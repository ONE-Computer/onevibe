import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = await mkdtemp(path.join(tmpdir(), 'onevibe-follow-up-recovery-'))
const port = 4342
const baseUrl = `http://127.0.0.1:${port}`
const crashKey = 'follow-up-recovery-proof'
const request = async <T>(route: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${route}`, init)
  const body = await response.json() as T & { error?: string }
  return { response, body }
}
const waitForHealth = async (child: ChildProcess) => {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API exited before readiness with ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`)
      if (response.ok) return
    } catch { /* wait for the child to bind */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('API did not become ready')
}
const start = (crashAfterPrepared: boolean, crashAfterProviderStarted = false) => spawn(process.execPath, ['--import', 'tsx/esm', 'server/index.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development', ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port), ONEVIBE_DATA_DIR: root, ...(crashAfterPrepared ? { ONEVIBE_TEST_CRASH_AFTER_FOLLOW_UP_PREPARED: 'true' } : {}), ...(crashAfterProviderStarted ? { ONEVIBE_TEST_CRASH_AFTER_FOLLOW_UP_PROVIDER_STARTED: 'true' } : {}) },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const stop = async (child: ChildProcess) => {
  if (child.exitCode !== null) return child.exitCode
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return child.exitCode
}
const waitForTask = async (taskId: string, expectedMessages: number) => {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const { body } = await request<{ status: string; messages: Array<{ role: string }>; attachments: Array<{ path: string }> }>(`/api/tasks/${taskId}`)
    if (body.status === 'completed' && body.messages.length === expectedMessages) return body
    if (body.status === 'failed' || body.status === 'cancelled') throw new Error(`Task ended as ${body.status}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Task did not complete after recovery')
}
const waitForFailedTask = async (taskId: string) => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const { body } = await request<{ status: string; messages: Array<{ role: string }> }>(`/api/tasks/${taskId}`)
    if (body.status === 'failed') return body
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Task did not reach the explicit provider-unknown failure state')
}

let first: ChildProcess | undefined
let second: ChildProcess | undefined
try {
  first = start(false)
  await waitForHealth(first)
  const created = await request<{ id: string }>('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Create a recovery proof task', provider: 'demo', mode: 'chat', projectId: 'project_onevibe', references: [], attachments: [], skills: [] }),
  })
  assert.equal(created.response.status, 201)
  const taskId = created.body.id
  await waitForTask(taskId, 2)
  await stop(first)
  first = undefined

  first = start(true)
  await waitForHealth(first)
  const followUp = await fetch(`${baseUrl}/api/tasks/${taskId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Recover this follow-up after a crash.', idempotencyKey: crashKey, attachments: [{ name: 'recovery.txt', mimeType: 'text/plain', dataBase64: Buffer.from('recovery bytes').toString('base64') }] }),
  }).catch(() => undefined)
  assert.ok(followUp === undefined || [202, 500].includes(followUp.status), 'the injected process must not report a successful durable response')
  const crashedExit = await new Promise<number | null>((resolve) => first!.once('exit', (code) => resolve(code)))
  assert.equal(crashedExit, 97)
  first = undefined

  second = start(false)
  await waitForHealth(second)
  const recovered = await waitForTask(taskId, 4)
  assert.equal(recovered.attachments.length, 1)
  const replay = await fetch(`${baseUrl}/api/tasks/${taskId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Recover this follow-up after a crash.', idempotencyKey: crashKey, attachments: [{ name: 'recovery.txt', mimeType: 'text/plain', dataBase64: Buffer.from('recovery bytes').toString('base64') }] }),
  })
  assert.equal(replay.status, 200)
  const replayBody = await replay.json() as { taskId?: string }
  assert.equal(replayBody.taskId, taskId)
  assert.equal((await request<{ messages: Array<{ role: string }> }>(`/api/tasks/${taskId}`)).body.messages.length, 4)

  await stop(second)
  second = undefined
  second = start(false, true)
  await waitForHealth(second)
  const providerStartedCrash = await fetch(`${baseUrl}/api/tasks/${taskId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Exercise the explicit provider unknown boundary.', idempotencyKey: 'provider-unknown-crash-key', attachments: [] }),
  }).catch(() => undefined)
  assert.ok(providerStartedCrash === undefined || [202, 500].includes(providerStartedCrash.status))
  const unknownExit = await new Promise<number | null>((resolve) => second!.once('exit', (code) => resolve(code)))
  assert.equal(unknownExit, 98)
  second = undefined
  second = start(false)
  await waitForHealth(second)
  const failedUnknown = await waitForFailedTask(taskId)
  const unknownReplay = await fetch(`${baseUrl}/api/tasks/${taskId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Exercise the explicit provider unknown boundary.', idempotencyKey: 'provider-unknown-crash-key', attachments: [] }),
  })
  assert.equal(unknownReplay.status, 409)
  const acknowledged = await fetch(`${baseUrl}/api/tasks/${taskId}/messages/reconcile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: 'provider-unknown-crash-key', decision: 'acknowledge_unknown' }),
  })
  assert.equal(acknowledged.status, 200)
  const acknowledgedBody = await acknowledged.json() as { retried?: boolean; status?: string }
  assert.equal(acknowledgedBody.status, 'acknowledged_unknown')
  assert.equal(acknowledgedBody.retried, false)
  console.log(JSON.stringify({ taskId, crashedExit, recoveredMessages: recovered.messages.length, recoveredAttachments: recovered.attachments.length, replayStatus: replay.status, exactlyOneRecoveredFollowUp: true, providerUnknownCrashExit: unknownExit, providerUnknownTaskStatus: failedUnknown.status, providerUnknownReplayStatus: unknownReplay.status, providerUnknownAcknowledgedStatus: acknowledged.status, providerUnknownAutoRetry: false }))
} finally {
  if (first) await stop(first)
  if (second) await stop(second)
  await rm(root, { recursive: true, force: true })
}
