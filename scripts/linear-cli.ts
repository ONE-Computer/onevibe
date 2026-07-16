import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LINEAR_URL = 'https://api.linear.app/graphql'
export const DEFAULT_PROJECT_ID = '7f0dd6f2-ffdf-4412-9954-c471e59d08f1'
export const DEFAULT_TEAM_ID = '3b764a66-a067-41ee-865e-5481d6a07afa'
const DEFAULT_KEY_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'handover', 'onecomputer-handover-secrets-lean', 'mac', 'linear-api-key.txt')

type Args = { command: string; positionals: string[]; flags: Record<string, string | boolean> }
type IssueRow = { id?: string; identifier: string; title: string; priority: number; state: { name: string }; url: string }

export const parseArgs = (argv: string[]): Args => {
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]!
    if (!value.startsWith('--')) { positionals.push(value); continue }
    const [rawKey, inline] = value.slice(2).split('=', 2)
    if (inline !== undefined) { flags[rawKey!] = inline; continue }
    const next = argv[index + 1]
    if (next && !next.startsWith('--')) { flags[rawKey!] = next; index += 1 } else flags[rawKey!] = true
  }
  return { command: positionals.shift() ?? 'help', positionals, flags }
}

const flag = (args: Args, name: string, fallback?: string) => {
  const value = args.flags[name]
  return typeof value === 'string' ? value : fallback
}

const requirePositional = (args: Args, index: number, label: string) => {
  const value = args.positionals[index]
  if (!value) throw new Error(`Missing ${label}. See: npm run linear -- help`)
  return value
}

export const priorityName = (priority: number) => ({ 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' }[priority] ?? String(priority))

export const formatIssueTable = (issues: IssueRow[]) => [
  'IDENTIFIER\tSTATE\tPRIORITY\tTITLE\tURL',
  ...issues.map((issue) => `${issue.identifier}\t${issue.state.name}\t${priorityName(issue.priority)}\t${issue.title}\t${issue.url}`),
].join('\n')

const readApiKey = async () => {
  const fromEnv = process.env.LINEAR_API_KEY?.trim()
  if (fromEnv) return fromEnv
  const keyFile = process.env.LINEAR_API_KEY_FILE?.trim() || DEFAULT_KEY_FILE
  try {
    const key = (await readFile(keyFile, 'utf8')).trim()
    if (key && !/[\r\n]/.test(key)) return key
  } catch { /* report the actionable error below */ }
  throw new Error(`Linear API key not found. Set LINEAR_API_KEY or provide LINEAR_API_KEY_FILE (default: ${keyFile}).`)
}

export const linearRequest = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const apiKey = await readApiKey()
  const response = await fetch(LINEAR_URL, {
    method: 'POST', headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json() as { data?: T; errors?: Array<{ message?: string }> }
  if (!response.ok || body.errors?.length) {
    const retryAfter = response.headers.get('retry-after')
    throw new Error(body.errors?.map((error) => error.message ?? 'Unknown GraphQL error').join('; ') || `Linear API returned HTTP ${response.status}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`)
  }
  if (!body.data) throw new Error('Linear API returned no data')
  return body.data
}

const issueQuery = `query Issue($id: String!) { issue(id: $id) { id identifier title description priority state { id name type } team { id key name } project { id name } url comments(first: 20) { nodes { id body createdAt } } } }`
const projectIssuesQuery = `query ProjectIssues($projectId: String!, $after: String) { project(id: $projectId) { id name url issues(first: 100, after: $after) { nodes { id identifier title priority state { name } url } pageInfo { hasNextPage endCursor } } } }`
const teamStatesQuery = `query TeamStates($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }`

type IssueResponse = { issue: { id: string; identifier: string; title: string; description?: string; priority: number; state: { id: string; name: string; type: string }; team: { id: string; key: string; name: string }; project?: { id: string; name: string }; url: string; comments: { nodes: Array<{ id: string; body: string; createdAt: string }> } } }
const issue = async (identifier: string) => (await linearRequest<IssueResponse>(issueQuery, { id: identifier })).issue

const requireConfirmation = (args: Args) => {
  if (args.flags['dry-run'] === true) return false
  if (args.flags.confirm !== true) throw new Error('This is a mutation. Add --confirm, or use --dry-run to inspect the planned operation.')
  return true
}

const findState = async (teamId: string, teamKey: string, stateName: string) => {
  const states = await linearRequest<{ team: { states: { nodes: Array<{ id: string; name: string; type: string }> } } }>(teamStatesQuery, { teamId })
  const state = states.team.states.nodes.find((candidate) => candidate.name.toLowerCase() === stateName.toLowerCase())
  if (!state) throw new Error(`State '${stateName}' not found for team ${teamKey}. Available: ${states.team.states.nodes.map((candidate) => candidate.name).join(', ')}`)
  return state
}

const help = () => console.log(`ONEVibe Linear helper\n\nCommands:\n  project [--json]                 Show the canonical ONEVibe project and issues\n  issues [--project ID] [--json]   List project issues\n  issue ONE-223 [--json]            Show an issue and recent comments\n  comment ONE-223 --body TEXT       Add an evidence/comment (requires --confirm; use --file PATH)\n  state ONE-223 --name Done         Move an issue to a named team state (requires --confirm)\n  create-issue --title TEXT         Create a ticket (requires --confirm)\n\nAll mutation commands support --dry-run and require --confirm.\nCredential resolution:\n  LINEAR_API_KEY is preferred; otherwise LINEAR_API_KEY_FILE is read.\n  The default file is the handover path documented in docs/LINEAR-BOARD.md.\n  Credentials are never accepted as CLI flags, printed, or written by this helper.`)

const run = async (args: Args) => {
  if (args.command === 'help' || args.command === '--help') return help()
  if (args.command === 'project' || args.command === 'issues') {
    const projectId = flag(args, 'project', process.env.LINEAR_PROJECT_ID || DEFAULT_PROJECT_ID)!
    const allIssues: IssueRow[] = []
    let after: string | null = null
    let project: { id: string; name: string; url: string } | undefined
    do {
      const page: { project: { id: string; name: string; url: string; issues: { nodes: IssueRow[]; pageInfo: { hasNextPage: boolean; endCursor?: string } } } } = await linearRequest(projectIssuesQuery, { projectId, after })
      project = page.project
      allIssues.push(...page.project.issues.nodes)
      after = page.project.issues.pageInfo.hasNextPage ? page.project.issues.pageInfo.endCursor ?? null : null
    } while (after)
    const stateFilter = flag(args, 'state')?.toLowerCase()
    const priorityFilter = flag(args, 'priority')
    const issues = allIssues.filter((candidate) => (!stateFilter || candidate.state.name.toLowerCase() === stateFilter) && (!priorityFilter || String(candidate.priority) === priorityFilter))
    if (args.flags.json) return console.log(JSON.stringify({ ...project, issues }, null, 2))
    console.log(`${project!.name}\n${project!.url}\n\n${formatIssueTable(issues)}`)
    return
  }
  if (args.command === 'issue') {
    const item = await issue(requirePositional(args, 0, 'issue identifier'))
    if (args.flags.json) return console.log(JSON.stringify(item, null, 2))
    console.log(`${item.identifier} · ${item.title}\n${item.state.name} · ${priorityName(item.priority)} · ${item.url}\n\n${item.description ?? '(no description)'}`)
    if (item.comments.nodes.length) console.log(`\nRecent comments:\n${item.comments.nodes.map((comment) => `- ${comment.createdAt}: ${comment.body}`).join('\n')}`)
    return
  }
  if (args.command === 'comment') {
    const item = await issue(requirePositional(args, 0, 'issue identifier'))
    const body = flag(args, 'body') ?? (flag(args, 'file') ? await readFile(String(flag(args, 'file')), 'utf8') : undefined)
    if (!body || typeof body !== 'string' || !body.trim()) throw new Error('Provide --body TEXT or --file PATH')
    const input = { issueId: item.id, body }
    if (!requireConfirmation(args)) return console.log(JSON.stringify({ dryRun: true, operation: 'commentCreate', issue: item.identifier, bodyLength: body.length }, null, 2))
    const data = await linearRequest<{ commentCreate: { success: boolean; comment?: { id: string } } }>('mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }', { input })
    console.log(JSON.stringify({ success: data.commentCreate.success, issue: item.identifier, commentId: data.commentCreate.comment?.id }, null, 2))
    return
  }
  if (args.command === 'state') {
    const item = await issue(requirePositional(args, 0, 'issue identifier'))
    const stateName = flag(args, 'name')
    if (!stateName) throw new Error('Provide --name STATE')
    const state = await findState(item.team.id, item.team.key, stateName)
    if (!requireConfirmation(args)) return console.log(JSON.stringify({ dryRun: true, operation: 'issueUpdate', issue: item.identifier, from: item.state.name, to: state.name }, null, 2))
    const data = await linearRequest<{ issueUpdate: { success: boolean; issue?: { identifier: string; state: { name: string } } } }>('mutation UpdateIssue($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { identifier state { name } } } }', { id: item.id, stateId: state.id })
    console.log(JSON.stringify({ success: data.issueUpdate.success, issue: data.issueUpdate.issue }, null, 2))
    return
  }
  if (args.command === 'create-issue') {
    const title = flag(args, 'title')
    const description = flag(args, 'description') ?? (flag(args, 'description-file') ? await readFile(String(flag(args, 'description-file')), 'utf8') : '')
    if (!title) throw new Error('Provide --title TEXT')
    const projectId = flag(args, 'project', process.env.LINEAR_PROJECT_ID || DEFAULT_PROJECT_ID)!
    const teamId = flag(args, 'team', process.env.LINEAR_TEAM_ID || DEFAULT_TEAM_ID)!
    const stateName = flag(args, 'state')
    const state = stateName ? await findState(teamId, 'ONE', stateName) : undefined
    const priority = Number(flag(args, 'priority', '0'))
    if (!Number.isInteger(priority) || priority < 0 || priority > 4) throw new Error('Priority must be an integer from 0 (none) through 4 (low)')
    const input = { teamId, title, description, projectId, priority, ...(state ? { stateId: state.id } : {}) }
    if (!requireConfirmation(args)) return console.log(JSON.stringify({ dryRun: true, operation: 'issueCreate', input: { ...input, description: undefined, descriptionLength: description.length } }, null, 2))
    const data = await linearRequest<{ issueCreate: { success: boolean; issue?: { id: string; identifier: string; url: string } } }>('mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }', { input })
    console.log(JSON.stringify({ success: data.issueCreate.success, issue: data.issueCreate.issue }, null, 2))
    return
  }
  throw new Error(`Unknown command '${args.command}'. See: npm run linear -- help`)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) run(parseArgs(process.argv)).catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Linear command failed'); process.exitCode = 1 })
