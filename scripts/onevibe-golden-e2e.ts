/**
 * Local ONEVibe golden-flow proof.
 *
 * This is an opt-in provider-backed test. It starts an isolated API child with
 * a temporary SQLite/workspace root, passes only the server-side Claude route
 * configuration, and never prints credential material. It proves local
 * conversation durability and evidence flow; it does not prove microVM or
 * ONEComputer isolation.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
const startupTimeoutMs = 15_000
const turnTimeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 15 * 60_000))

type RuntimeEvent = { id?: string; type: string; label?: string; runId?: string; content?: string; payload: Record<string, unknown> }
type Snapshot = {
  id: string
  title: string
  status: string
  securityContext?: { executionBoundary?: string; runtimeSessionId?: string }
  files: Array<{ path: string; size?: number }>
  events: RuntimeEvent[]
  messages: Array<{ id: string; turnId: string; role: string; content: string; status: string }>
}
type SseFrame = { id?: string; event?: string; data?: string }

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const availablePort = async () => new Promise<number>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    if (!address || typeof address === 'string') {
      probe.close()
      reject(new Error('Unable to discover a local API port'))
      return
    }
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}) => {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    throw new Error(`${pathname} could not be reached: ${error instanceof Error ? error.message : 'network failure'}`)
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}

const startApi = (dataDirectory: string, port: number) => {
  // Keep the child environment intentionally narrow. The two route variables
  // below are secrets, but they are used only by the child and never logged,
  // returned in JSON, or written to the workspace.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? dataDirectory,
    TMPDIR: dataDirectory,
    LANG: 'C',
    NODE_ENV: 'test',
    ONEVIBE_DATA_DIR: dataDirectory,
    ONEVIBE_API_HOST: '127.0.0.1',
    ONEVIBE_API_PORT: String(port),
  }
  for (const key of [
    'ONEVIBE_LITELLM_URL',
    'ONEVIBE_LITELLM_API_KEY',
    'ONEVIBE_LITELLM_MODEL',
    'ONEVIBE_CLAUDE_MODEL',
    'ONEVIBE_CLAUDE_MAX_TURNS',
    'ONEVIBE_CLAUDE_MAX_BUDGET_USD',
    'ONEVIBE_TURN_TIMEOUT_MS',
  ]) {
    if (process.env[key]) env[key] = process.env[key]
  }
  const child = spawn(process.execPath, [tsxEntry, serverEntry], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited }
}

const stopApi = async (api: ReturnType<typeof startApi>) => {
  if (api.child.exitCode !== null || api.child.signalCode !== null) return
  api.child.kill('SIGTERM')
  await Promise.race([api.exited, sleep(2_000)])
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL')
  await Promise.race([api.exited, sleep(1_000)])
}

const waitForHealth = async (baseUrl: string, api: ReturnType<typeof startApi>) => {
  const deadline = Date.now() + startupTimeoutMs
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null || api.child.signalCode !== null) throw new Error('Isolated ONEVibe API exited before becoming healthy')
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.status === 'healthy') return
    } catch {
      // The server may still be loading the TypeScript entry point.
    }
    await sleep(100)
  }
  throw new Error('Isolated ONEVibe API did not become healthy within the startup deadline')
}

const waitForTerminal = async (baseUrl: string, taskId: string) => {
  const deadline = Date.now() + turnTimeoutMs
  let latest: Snapshot | undefined
  while (Date.now() < deadline) {
    latest = await request<Snapshot>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`)
    if (terminalStatuses.has(latest.status)) return latest
    await sleep(1_000)
  }
  throw new Error(`Task ${taskId} did not reach a terminal state before the deadline (last state: ${latest?.status ?? 'unknown'})`)
}

const terminalSummary = (task: Snapshot) => task.events.slice(-8).map((event) => ({
  type: event.type,
  label: event.label,
  runId: event.runId,
  payloadKeys: Object.keys(event.payload).sort(),
  failureReason: typeof event.payload.failureReason === 'string' ? event.payload.failureReason : undefined,
  content: event.type === 'run_failed' ? event.content?.replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '[REDACTED]').slice(0, 240) : undefined,
})).filter((event) => event.type === 'run_failed' || event.type === 'run_completed' || event.type === 'run_cancelled' || event.type === 'activity_delta')

const parseSseFrames = (source: string): SseFrame[] => source.split(/\r?\n\r?\n/).flatMap((block) => {
  if (!block.trim() || block.trimStart().startsWith(':')) return []
  const frame: SseFrame = {}
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    const key = separator < 0 ? line : line.slice(0, separator)
    const value = (separator < 0 ? '' : line.slice(separator + 1)).replace(/^ /, '')
    if (key === 'id') frame.id = value
    if (key === 'event') frame.event = value
    if (key === 'data') frame.data = frame.data ? `${frame.data}\n${value}` : value
  }
  return frame.event || frame.data ? [frame] : []
})

const readSseFrames = async (baseUrl: string, taskId: string, lastEventId?: string, minimumFrames = 4) => {
  const controller = new AbortController()
  const deadline = Date.now() + 20_000
  try {
    const response = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/events`, {
      headers: { Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) },
      signal: controller.signal,
    })
    if (!response.ok || !response.body) throw new Error(`SSE endpoint returned HTTP ${response.status}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let source = ''
    let frames: SseFrame[] = []
    while (frames.length < minimumFrames) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`SSE stream did not produce ${minimumFrames} frames before its deadline`)
      const chunk = await Promise.race([
        reader.read(),
        sleep(remaining).then(() => { throw new Error(`SSE stream did not produce ${minimumFrames} frames before its deadline`) }),
      ])
      if (chunk.done) break
      source += decoder.decode(chunk.value, { stream: true })
      frames = parseSseFrames(source)
    }
    void reader.cancel().catch(() => undefined)
    return frames
  } finally {
    controller.abort()
  }
}

const main = async () => {
  if (!process.env.ONEVIBE_LITELLM_URL || !process.env.ONEVIBE_LITELLM_API_KEY) {
    throw new Error('Set server-only ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY before running this provider-backed gate')
  }
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-golden-e2e-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  let api = startApi(dataDirectory, port)
  try {
    await waitForHealth(baseUrl, api)
    const readiness = await request<{ providers: Array<{ id: string; available: boolean; detail?: string }> }>(baseUrl, '/api/runtime')
    const claude = readiness.providers.find((provider) => provider.id === 'claude_sdk')
    if (!claude?.available) throw new Error(`Claude SDK is unavailable through the configured local route: ${claude?.detail ?? 'not ready'}`)

    const first = await request<{ id: string }>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Create a governed document-mode validation artifact in this workspace. Write document.md with an Executive summary and Provenance section, valid document.json metadata, dependency-free index.html, and README.md. Do not use the network, credentials, or paths outside the workspace.',
        provider: 'claude_sdk', mode: 'document', projectId: 'project_onevibe', references: [], attachments: [], skills: ['document', 'security_review'],
      }),
    })
    const liveSsePromise = readSseFrames(baseUrl, first.id, undefined, 4)
    const firstTurn = await waitForTerminal(baseUrl, first.id)
    if (firstTurn.status !== 'completed') throw new Error(`First Claude turn ended ${firstTurn.status}: ${JSON.stringify(terminalSummary(firstTurn))}`)
    const liveSse = await liveSsePromise
    const liveEvents = liveSse.filter((frame) => frame.event === 'runtime_event' && frame.data)
    assert.ok(liveEvents.length > 0, 'the first turn must emit durable runtime SSE frames')
    const replayCursor = liveEvents[0]?.id
    assert.ok(replayCursor, 'runtime SSE frames must expose a durable event ID')

    await request(baseUrl, `/api/tasks/${encodeURIComponent(first.id)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Continue this same conversation. Append one sentence to README.md confirming that the follow-up was persisted. Do not use the network or leave the workspace.' }),
    })
    const continued = await waitForTerminal(baseUrl, first.id)
    if (continued.status !== 'completed') throw new Error(`Follow-up Claude turn ended ${continued.status}: ${JSON.stringify(terminalSummary(continued))}`)
    assert.equal(continued.id, firstTurn.id)
    assert.equal(continued.securityContext?.executionBoundary, 'host_process')
    assert.ok(continued.securityContext?.runtimeSessionId, 'the provider session identity must be durable')
    assert.ok(continued.messages.filter((message) => message.role === 'user').length >= 2, 'the follow-up user turn must be durable')
    assert.ok(continued.events.filter((event) => event.type === 'run_completed').length >= 2, 'both provider turns must complete durably')
    assert.ok(continued.files.some((file) => file.path === 'README.md'), 'the first artifact must remain in the workspace')
    const readme = await request<{ content: string }>(baseUrl, `/api/tasks/${encodeURIComponent(first.id)}/file?path=README.md`)
    assert.match(readme.content, /follow-up (?:edit|conversation)[^\n]{0,120}persisted/i)
    const evidence = await request<{ valid: boolean }>(baseUrl, `/api/tasks/${encodeURIComponent(first.id)}/evidence`)
    assert.equal(evidence.valid, true, 'the evidence chain must verify after the follow-up')

    const replay = await readSseFrames(baseUrl, first.id, replayCursor, 2)
    const replayEvents = replay.filter((frame) => frame.event === 'runtime_event' && frame.data)
    assert.ok(replayEvents.length > 0, 'Last-Event-ID must replay a suffix')
    assert.ok(replayEvents.every((frame) => frame.id !== replayCursor), 'Last-Event-ID replay must be suffix-only')

    const second = await request<{ id: string }>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Create a separate governed conversation artifact and keep it isolated from every other task.', provider: 'demo', mode: 'general', projectId: 'project_onevibe', references: [], attachments: [], skills: [] }),
    })
    const secondTask = await waitForTerminal(baseUrl, second.id)
    assert.equal(secondTask.status, 'completed')
    assert.notEqual(secondTask.id, continued.id, 'separate conversations must have distinct task identities')
    assert.ok(secondTask.files.some((file) => file.path === 'README.md'), 'the separate task must have its own workspace files')

    await stopApi(api)
    api = startApi(dataDirectory, port)
    await waitForHealth(baseUrl, api)
    const reopened = await request<Snapshot>(baseUrl, `/api/tasks/${encodeURIComponent(first.id)}`)
    assert.equal(reopened.status, 'completed')
    assert.equal(reopened.securityContext?.runtimeSessionId, continued.securityContext?.runtimeSessionId)
    assert.equal(reopened.messages.length, continued.messages.length)
    const messages = await request<{ messages: Snapshot['messages']; total: number }>(baseUrl, `/api/tasks/${encodeURIComponent(first.id)}/messages?q=follow-up`)
    assert.ok(messages.total > 0, 'server-side conversation search must find the follow-up')
    const search = await request<{ results: Array<{ taskId: string; message: { content: string } }> }>(baseUrl, '/api/search?q=follow-up')
    assert.ok(search.results.some((result) => result.taskId === first.id), 'global server-side search must reopen the conversation')
    const conversations = await request<{ conversations: Array<{ id: string }> }>(baseUrl, '/api/conversations?q=follow-up')
    assert.ok(conversations.conversations.some((conversation) => conversation.id === first.id), 'conversation history search must include the durable task')

    console.log(JSON.stringify({
      taskId: first.id,
      separateTaskId: second.id,
      provider: 'claude_sdk',
      transport: 'litellm',
      durableTurns: reopened.messages.filter((message) => message.role === 'user').length,
      liveSseFrames: liveEvents.length,
      replaySseFrames: replayEvents.length,
      sseSuffixOnly: replayEvents.every((frame) => frame.id !== replayCursor),
      artifact: 'README.md',
      sessionRecorded: Boolean(reopened.securityContext?.runtimeSessionId),
      evidenceValid: evidence.valid,
      restartRecovered: reopened.messages.length === continued.messages.length,
      searchRecovered: true,
      conversationIsolation: first.id !== second.id,
      executionBoundary: reopened.securityContext?.executionBoundary,
      limitation: 'host_process local proof; no ONEComputer/microVM/OpenVTC enforcement claim',
    }, null, 2))
  } finally {
    await stopApi(api)
    await rm(dataDirectory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
