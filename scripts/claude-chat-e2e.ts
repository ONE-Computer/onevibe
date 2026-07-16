/**
 * ONEVibe local Claude chat + terminal evidence acceptance gate.
 *
 * Opt-in: requires server-only ONEVIBE_LITELLM_URL and
 * ONEVIBE_LITELLM_API_KEY. This proves the host-process local contract only;
 * it does not claim ONEComputer, microVM, or gateway isolation.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
const startupTimeoutMs = 15_000
const taskTimeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 15 * 60_000))

type Event = { id?: string; type: string; label?: string; content?: string; payload: Record<string, unknown> }
type Message = { id: string; turnId: string; role: string; content: string; status: string }
type Snapshot = { id: string; mode: string; provider: string; status: string; plan: Array<{ id: string; status: string }>; files: Array<{ path: string; size: number }>; events: Event[]; messages: Message[]; approval?: unknown; securityContext?: { executionBoundary?: string; runtimeSessionId?: string } }
type SseFrame = { id?: string; event?: string; data?: string }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const terminalSummary = (task: Snapshot) => task.events.slice(-8).map((event) => ({ type: event.type, label: event.label, failureReason: event.payload.failureReason })).filter((event) => event.type.startsWith('run_'))

const availablePort = async () => new Promise<number>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    if (!address || typeof address === 'string') { probe.close(); reject(new Error('Unable to discover API port')); return }
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const startApi = (dataDirectory: string, port: number, modelOverride?: string) => {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? dataDirectory, TMPDIR: dataDirectory, LANG: 'C', NODE_ENV: 'test', ONEVIBE_DATA_DIR: dataDirectory, ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port) }
  for (const key of ['ONEVIBE_LITELLM_URL', 'ONEVIBE_LITELLM_API_KEY', 'ONEVIBE_LITELLM_MODEL', 'ONEVIBE_CLAUDE_MODEL', 'ONEVIBE_CLAUDE_MAX_TURNS', 'ONEVIBE_CLAUDE_MAX_BUDGET_USD', 'ONEVIBE_TURN_TIMEOUT_MS']) if (process.env[key]) env[key] = process.env[key]
  if (modelOverride) env.ONEVIBE_LITELLM_MODEL = modelOverride
  const child = spawn(process.execPath, [tsxEntry, serverEntry], { cwd: repoRoot, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited }
}

const stopApi = async (api: ReturnType<typeof startApi>) => {
  if (api.child.exitCode !== null || api.child.signalCode !== null) return
  api.child.kill('SIGTERM'); await Promise.race([api.exited, sleep(2_000)])
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL')
  await Promise.race([api.exited, sleep(1_000)])
}

const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}

const waitForHealth = async (baseUrl: string, api: ReturnType<typeof startApi>) => {
  const deadline = Date.now() + startupTimeoutMs
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null || api.child.signalCode !== null) throw new Error('API exited before becoming healthy')
    try { if ((await request<{ status: string }>(baseUrl, '/api/health')).status === 'healthy') return } catch { /* startup */ }
    await sleep(100)
  }
  throw new Error('API did not become healthy within the startup deadline')
}

const waitForTerminal = async (baseUrl: string, taskId: string) => {
  const deadline = Date.now() + taskTimeoutMs; let latest: Snapshot | undefined
  while (Date.now() < deadline) {
    latest = await request<Snapshot>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`)
    if (terminalStatuses.has(latest.status)) return latest
    await sleep(750)
  }
  throw new Error(`Task ${taskId} did not reach a terminal state: ${latest?.status ?? 'unknown'}`)
}

const parseSseFrames = (source: string): SseFrame[] => source.split(/\r?\n\r?\n/).flatMap((block) => {
  if (!block.trim() || block.trimStart().startsWith(':')) return []
  const frame: SseFrame = {}
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(':'); const key = separator < 0 ? line : line.slice(0, separator); const value = (separator < 0 ? '' : line.slice(separator + 1)).replace(/^ /, '')
    if (key === 'id') frame.id = value
    if (key === 'event') frame.event = value
    if (key === 'data') frame.data = frame.data ? `${frame.data}\n${value}` : value
  }
  return frame.event || frame.data ? [frame] : []
})

const readSse = async (baseUrl: string, taskId: string, lastEventId?: string, minimumFrames = 2, requiredFragment?: string) => {
  const controller = new AbortController(); const deadline = Date.now() + 20_000
  try {
    const response = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/events`, { headers: { Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) }, signal: controller.signal })
    if (!response.ok || !response.body) throw new Error(`SSE returned HTTP ${response.status}`)
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let source = ''; let frames: SseFrame[] = []
    while (frames.length < minimumFrames || Boolean(requiredFragment && !frames.some((frame) => frame.data?.includes(requiredFragment)))) {
      if (Date.now() >= deadline) throw new Error(`SSE did not produce ${minimumFrames} frames`)
      const chunk = await Promise.race([reader.read(), sleep(Math.max(1, deadline - Date.now())).then(() => { throw new Error('SSE read deadline exceeded') })])
      if (chunk.done) break
      source += decoder.decode(chunk.value, { stream: true }); frames = parseSseFrames(source)
    }
    await reader.cancel().catch(() => undefined); return frames
  } finally { controller.abort() }
}

const createTask = async (baseUrl: string, prompt: string, provider: 'claude_sdk' | 'demo', mode: 'chat' | 'general') => request<{ id: string }>(baseUrl, '/api/tasks', { method: 'POST', body: JSON.stringify({ prompt, provider, mode, projectId: 'project_onevibe', references: [], attachments: [], skills: [] }) })

const failureRetryProbe = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-failure-retry-e2e-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  let api = startApi(dataDirectory, port, 'onevibe-invalid-model-for-retry-proof')
  try {
    await waitForHealth(baseUrl, api)
    const task = await createTask(baseUrl, 'Answer this short question in one sentence: what is 2 + 2?', 'claude_sdk', 'chat')
    const failed = await waitForTerminal(baseUrl, task.id)
    assert.equal(failed.status, 'failed', JSON.stringify(terminalSummary(failed)))
    assert.ok(failed.events.some((event) => event.type === 'run_failed' && ['provider_result_failure', 'missing_terminal_result', 'provider_execution_failure'].includes(String(event.payload.failureReason))), JSON.stringify(terminalSummary(failed)))

    await stopApi(api)
    api = startApi(dataDirectory, port, process.env.ONEVIBE_LITELLM_MODEL ?? 'claude-sonnet-5')
    await waitForHealth(baseUrl, api)
    const retry = await request<{ status: string; taskId: string; retryKey: string }>(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/retry`, { method: 'POST', body: JSON.stringify({ idempotencyKey: 'claude-failure-retry-proof' }) })
    assert.equal(retry.status, 'queued'); assert.equal(retry.taskId, task.id)
    const recovered = await waitForTerminal(baseUrl, task.id)
    assert.equal(recovered.status, 'completed', JSON.stringify(terminalSummary(recovered)))
    assert.ok(recovered.events.some((event) => event.label === 'Retry attempt started'), 'retry evidence must be recorded')
    assert.ok(recovered.events.some((event) => event.type === 'run_completed'), 'retry must produce a completed provider run')
    const evidence = await request<{ valid: boolean }>(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/evidence`)
    assert.equal(evidence.valid, true)
    return { taskId: task.id, failedRun: true, retried: true, recovered: recovered.status, evidenceValid: evidence.valid }
  } finally {
    await stopApi(api)
    await rm(dataDirectory, { recursive: true, force: true })
  }
}

const main = async () => {
  if (!process.env.ONEVIBE_LITELLM_URL || !process.env.ONEVIBE_LITELLM_API_KEY) throw new Error('Set server-only ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY before running this gate')
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-chat-e2e-')); const port = await availablePort(); const baseUrl = `http://127.0.0.1:${port}`; let api = startApi(dataDirectory, port)
  try {
    await waitForHealth(baseUrl, api)
    const readiness = await request<{ providers: Array<{ id: string; available: boolean; detail?: string }> }>(baseUrl, '/api/runtime'); const claude = readiness.providers.find((provider) => provider.id === 'claude_sdk')
    if (!claude?.available) throw new Error(`Claude SDK unavailable: ${claude?.detail ?? 'not ready'}`)

    const chat = await createTask(baseUrl, 'Hello. In one short sentence, say hello and ask what I would like to work on.', 'claude_sdk', 'chat')
    const liveSsePromise = readSse(baseUrl, chat.id, undefined, 2, 'assistant_text_delta'); const first = await waitForTerminal(baseUrl, chat.id)
    assert.equal(first.status, 'completed', JSON.stringify(terminalSummary(first))); assert.equal(first.mode, 'chat'); assert.equal(first.provider, 'claude_sdk'); assert.equal(first.plan.length, 0); assert.equal(first.files.length, 0); assert.equal(first.approval, undefined)
    assert.equal(first.messages.filter((message) => message.role === 'user').length, 1); assert.ok(first.messages.find((message) => message.role === 'assistant')?.content.trim(), 'chat must persist a non-empty assistant response'); assert.equal(first.events.some((event) => event.type === 'artifact_created'), false)
    const liveSse = await liveSsePromise; assert.ok(liveSse.some((frame) => frame.event === 'runtime_event' && frame.data), 'chat must emit durable SSE frames'); assert.ok(liveSse.some((frame) => frame.data?.includes('assistant_text_delta')), 'chat SSE must include assistant text deltas')
    const cursor = liveSse.find((frame) => frame.event === 'runtime_event' && frame.id)?.id; assert.ok(cursor, 'chat SSE must expose a durable event cursor')

    await request(baseUrl, `/api/tasks/${encodeURIComponent(chat.id)}/messages`, { method: 'POST', body: JSON.stringify({ prompt: 'Please answer only: 2 + 2 = 4.' }) }); const continued = await waitForTerminal(baseUrl, chat.id)
    assert.equal(continued.status, 'completed'); assert.equal(continued.messages.filter((message) => message.role === 'user').length, 2); assert.equal(continued.events.filter((event) => event.type === 'run_completed').length, 2); assert.equal(continued.securityContext?.runtimeSessionId, first.securityContext?.runtimeSessionId)
    const replay = await readSse(baseUrl, chat.id, cursor, 1); assert.ok(replay.some((frame) => frame.event === 'runtime_event' && frame.id !== cursor), 'Last-Event-ID must replay a suffix'); const evidence = await request<{ valid: boolean }>(baseUrl, `/api/tasks/${encodeURIComponent(chat.id)}/evidence`); assert.equal(evidence.valid, true)

    const demo = await createTask(baseUrl, 'Hello from simulation', 'demo', 'chat'); const demoTask = await waitForTerminal(baseUrl, demo.id); assert.equal(demoTask.status, 'completed'); assert.equal(demoTask.files.length, 0); assert.match(demoTask.messages.at(-1)?.content ?? '', /Simulation only/i)

    const artifact = await createTask(baseUrl, 'Create NOTES.md with three bullets about reproducible local tests, then run `wc -c NOTES.md` using a bounded workspace-relative Bash command. Do not create index.html.', 'claude_sdk', 'general'); const artifactTask = await waitForTerminal(baseUrl, artifact.id)
    assert.equal(artifactTask.status, 'completed', JSON.stringify(terminalSummary(artifactTask))); assert.ok(artifactTask.files.some((file) => file.path === 'NOTES.md'))
    const bashStarts = artifactTask.events.filter((event) => event.type === 'tool_call_started' && event.label === 'Bash'); const bashResults = artifactTask.events.filter((event) => event.type === 'tool_call_completed' && event.payload.isError === false && typeof event.content === 'string' && /NOTES\.md|bytes|wc/i.test(event.content))
    assert.ok(bashStarts.length > 0, 'artifact task must invoke Bash'); assert.ok(bashResults.length > 0, 'Bash result must be durable'); assert.ok(bashStarts.every((event) => event.payload.presentation && (event.payload.presentation as { panel?: string }).panel === 'terminal'), 'Bash starts must project to the terminal panel'); assert.ok(artifactTask.events.some((event) => event.type === 'artifact_created' && event.content === 'NOTES.md'), 'Markdown artifact must be projected')

    await stopApi(api); api = startApi(dataDirectory, port); await waitForHealth(baseUrl, api); const reopened = await request<Snapshot>(baseUrl, `/api/tasks/${encodeURIComponent(chat.id)}`); assert.equal(reopened.messages.length, continued.messages.length); assert.equal(reopened.status, 'completed')
    const search = await request<{ results: Array<{ taskId: string }> }>(baseUrl, '/api/search?q=2%20%2B%202'); assert.ok(search.results.some((result) => result.taskId === chat.id), 'reload must retain searchable chat history')
    const failureRetry = await failureRetryProbe()
    console.log(JSON.stringify({ chatTaskId: chat.id, demoTaskId: demo.id, artifactTaskId: artifact.id, chatTurns: reopened.messages.filter((message) => message.role === 'user').length, liveSseFrames: liveSse.length, replaySseFrames: replay.length, bashCalls: bashStarts.length, evidenceValid: evidence.valid, restartRecovered: reopened.messages.length === continued.messages.length, failureRetry, executionBoundary: reopened.securityContext?.executionBoundary, limitation: 'host_process local proof; no ONEComputer/microVM/OpenVTC enforcement claim' }, null, 2))
  } finally { await stopApi(api); await rm(dataDirectory, { recursive: true, force: true }) }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
