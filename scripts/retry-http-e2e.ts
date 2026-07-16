/**
 * Deterministic local HTTP proof for retry idempotency.
 *
 * The API is started with an explicit, secret-free environment and a fresh
 * data directory. A failed demo task is seeded before the server starts so
 * this harness never needs a provider, wallet, or remote runtime.
 */
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUEST_TIMEOUT_MS = 3_000
const STARTUP_TIMEOUT_MS = 15_000
const TERMINAL_TIMEOUT_MS = 30_000
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

type RetryReceipt = { status: string; taskId: string; retryKey: string }
type RuntimeEvent = {
  type: string
  label?: string
  payload: Record<string, unknown>
}
type TaskSnapshot = {
  id: string
  status: string
  activeRunId?: string
  events: RuntimeEvent[]
}
type EvidenceResponse = { valid: boolean; events: RuntimeEvent[] }
type HttpResult<T> = { status: number; body: T }

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const availablePort = async () => new Promise<number>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    if (!address || typeof address === 'string') {
      probe.close()
      reject(new Error('Unable to discover an available local port'))
      return
    }
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}): Promise<HttpResult<T>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    throw new Error(`${pathname} could not be reached: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }

  const rawBody = await response.text()
  let body: unknown = {}
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    body = { rawBody }
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? `: ${body.error}`
      : ''
    throw new Error(`${pathname} returned HTTP ${response.status}${message}`)
  }
  return { status: response.status, body: body as T }
}

const seedFailedTask = async (dataDirectory: string) => {
  // Import after setting the data directory. Do not import server/index.ts:
  // that module owns the HTTP listener and reads its environment at import time.
  process.env.ONEVIBE_DATA_DIR = dataDirectory
  const { TaskStore } = await import('../server/store.js')
  const store = new TaskStore(dataDirectory)
  await store.initialize()
  const task = await store.createTask(
    'Retry this deterministic local HTTP idempotency fixture.',
    'demo',
    'general',
    'project_onevibe',
  )
  await store.appendEvent(task.id, {
    type: 'run_failed',
    lane: 'control',
    status: 'failed',
    label: 'Seed failure',
    content: 'The local E2E fixture failed before retry and is safe to retry.',
    payload: { reason: 'retry_http_e2e_fixture', retryable: true },
  })
  await store.updateTask(task.id, { status: 'failed' })

  // TaskStore intentionally keeps its persistence handles private. Close the
  // seed connection before the child opens the same SQLite database.
  const database = (store as unknown as { database?: { close(): void } }).database
  database?.close()
  return task.id
}

const startApi = (dataDirectory: string, port: number) => {
  // Deliberately construct this environment instead of inheriting process.env:
  // no API keys, provider tokens, wallet tokens, or runtime credentials reach
  // the child process.
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
  const child = spawn(process.execPath, [tsxEntry, serverEntry], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let output = ''
  const capture = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-8_000)
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited, output: () => output }
}

const stopApi = async (child: ChildProcess, exited: Promise<void>) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([exited, sleep(2_000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, sleep(1_000)])
  }
}

const waitForHealth = async (baseUrl: string, child: ChildProcess, childOutput: () => string) => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let lastError = 'API did not become healthy'
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`API child exited before becoming healthy${childOutput() ? `: ${childOutput()}` : ''}`)
    }
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.body.status === 'healthy') return
      lastError = `unexpected health response: ${JSON.stringify(health.body)}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(100)
  }
  throw new Error(`${lastError}${childOutput() ? `; child output: ${childOutput()}` : ''}`)
}

const waitForTerminal = async (baseUrl: string, taskId: string) => {
  const deadline = Date.now() + TERMINAL_TIMEOUT_MS
  let latest: TaskSnapshot | undefined
  while (Date.now() < deadline) {
    latest = (await request<TaskSnapshot>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`)).body
    if (TERMINAL_STATUSES.has(latest.status)) return latest
    await sleep(100)
  }
  throw new Error(`Task ${taskId} did not reach a terminal status within ${TERMINAL_TIMEOUT_MS}ms (last status: ${latest?.status ?? 'unknown'})`)
}

const main = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-retry-http-e2e-'))
  let api: ReturnType<typeof startApi> | undefined
  try {
    const taskId = await seedFailedTask(dataDirectory)
    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    api = startApi(dataDirectory, port)
    await waitForHealth(baseUrl, api.child, api.output)

    const idempotencyKey = 'retry-http-e2e-fixed-key'
    const first = await request<RetryReceipt>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    })
    const second = await request<RetryReceipt>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}/retry`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    })

    assert.equal(first.status, 202, 'the first retry request should be accepted')
    assert.equal(second.status, 200, 'the completed idempotent retry should replay as an existing receipt')
    assert.deepEqual(second.body, first.body, 'the second retry response must replay the first receipt')
    assert.equal(first.body.taskId, taskId)
    assert.equal(first.body.retryKey, idempotencyKey)

    const finalTask = await waitForTerminal(baseUrl, taskId)
    assert.equal(finalTask.status, 'completed', `the demo retry should complete, got ${finalTask.status}`)
    const retryEvents = finalTask.events.filter((event) => event.label === 'Retry attempt started')
    assert.equal(retryEvents.length, 1, 'one idempotency key must create exactly one retry attempt')
    assert.deepEqual(retryEvents[0]?.payload, { retryKey: idempotencyKey, idempotent: true })
    assert.ok(finalTask.events.some((event) => event.type === 'run_completed'), 'retry completion evidence is missing')

    const evidence = (await request<EvidenceResponse>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}/evidence`)).body
    assert.equal(evidence.valid, true, 'the evidence chain must verify after retry')
    assert.equal(evidence.events.filter((event) => event.label === 'Retry attempt started').length, 1)

    console.log(JSON.stringify({
      taskId,
      status: finalTask.status,
      firstResponse: { status: first.status, body: first.body },
      secondResponse: { status: second.status, body: second.body, replayedBody: true },
      retryAttempts: retryEvents.length,
      evidenceValid: evidence.valid,
    }, null, 2))
  } finally {
    if (api) await stopApi(api.child, api.exited)
    await rm(dataDirectory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
