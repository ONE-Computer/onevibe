/**
 * Source for the small Node worker that runs inside an ONEComputer sandbox.
 *
 * The worker is deliberately transferred as source and executed by the
 * preinstalled sandbox runtime. It is not a host-side SDK call: the Claude
 * Agent SDK process, its session state, and its journal all live inside the
 * conversation-owned sandbox boundary.
 */
export const ONEVIBE_SANDBOX_AGENT_SDK_WORKER = String.raw`import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error('Missing ONEVibe sandbox worker setting: ' + name)
  return value
}

const workspace = required('ONEVIBE_AGENT_WORKSPACE')
const promptPath = required('ONEVIBE_AGENT_PROMPT_PATH')
const journalPath = required('ONEVIBE_AGENT_JOURNAL_PATH')
const exitPath = required('ONEVIBE_AGENT_EXIT_PATH')
const model = required('ONEVIBE_AGENT_MODEL')
const tools = JSON.parse(process.env.ONEVIBE_AGENT_TOOLS || '[]')
const resume = process.env.ONEVIBE_AGENT_RESUME || undefined
const statePath = process.env.ONEVIBE_AGENT_STATE_PATH || workspace + '/.claude-state'

await mkdir(statePath, { recursive: true })
await writeFile(journalPath, '')
await writeFile(exitPath, '')

const writeEvent = async (value) => {
  await appendFile(journalPath, JSON.stringify(value) + '\n')
}

try {
  const require = createRequire(import.meta.url)
  const sdkModulePath = require.resolve('@anthropic-ai/claude-agent-sdk')
  const { query } = await import(sdkModulePath)
  const prompt = await readFile(promptPath, 'utf8')
  const abortController = new AbortController()
  const options = {
    abortController,
    cwd: workspace,
    model,
    tools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    includeHookEvents: true,
    forwardSubagentText: true,
    agentProgressSummaries: true,
    enableFileCheckpointing: true,
    persistSession: true,
    settingSources: ['project'],
    maxTurns: Number(process.env.ONEVIBE_CLAUDE_MAX_TURNS || 24),
    maxBudgetUsd: Number(process.env.ONEVIBE_CLAUDE_MAX_BUDGET_USD || 5),
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: statePath,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'onevibe-sandbox/0.1.0',
    },
  }
  if (resume) options.resume = resume
  for await (const message of query({ prompt, options })) await writeEvent(message)
  await writeFile(exitPath, '0')
} catch (error) {
  await writeEvent({ type: 'onevibe_worker_error', error: error instanceof Error ? error.message.slice(0, 2_000) : 'Sandbox Claude Agent SDK worker failed' })
  await writeFile(exitPath, '1')
  process.exitCode = 1
}`
