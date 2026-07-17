/**
 * Authenticated two-process Postgres HTTP SSE acceptance proof.
 *
 * This deliberately uses the demo provider. The proof is about durable event
 * allocation, owner-scoped HTTP access, cross-process notification, and
 * Last-Event-ID replay; it does not claim provider, sandbox, or production
 * deployment behavior.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
const availablePort = async () => {
  const server = createServer()
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') { server.close(); reject(new Error('Unable to discover loopback port')); return }
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

const startMailCatcher = async () => {
  const port = await availablePort()
  const delivered = new Map<string, string>()
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { email?: string; otp?: string }
      if (typeof body.email !== 'string' || typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp)) throw new Error('Invalid test OTP delivery')
      delivered.set(body.email, body.otp)
      response.writeHead(204); response.end()
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid delivery' }))
    }
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()) })
  return { server, url: `http://127.0.0.1:${port}/otp`, delivered }
}

const startApi = async (dataRoot: string, port: number, webhookUrl: string, secret: string, trustedOrigins: string) => {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dataRoot, TMPDIR: dataRoot, LANG: 'C', NODE_ENV: 'test',
    DATABASE_URL: databaseUrl, ONEVIBE_PERSISTENCE_DRIVER: 'postgres', ONEVIBE_DATA_DIR: dataRoot,
    ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port), ONEVIBE_AUTH_ENABLED: 'true',
    BETTER_AUTH_SECRET: secret, ONEVIBE_AUTH_OTP_WEBHOOK_URL: webhookUrl,
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`, ONEVIBE_TRUSTED_ORIGINS: trustedOrigins,
  }
  const child = spawn(process.execPath, [tsxEntry, serverEntry], { cwd: repoRoot, env, stdio: ['ignore', 'ignore', 'ignore'] })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM'); await Promise.race([exited, sleep(2_000)])
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await Promise.race([exited, sleep(1_000)])
  }
  return { child, stop }
}

type ApiResult<T> = { response: Response; body: T & { error?: string; code?: string } }
const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}, cookie?: string): Promise<ApiResult<T>> => {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (cookie) headers.set('Cookie', cookie)
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers, signal: AbortSignal.timeout(10_000) })
  const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string }
  return { response, body }
}

const cookieFrom = (response: Response) => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
}

const waitFor = async <T>(read: () => T | undefined | Promise<T | undefined>, label: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = await read()
    if (value !== undefined) return value
    await sleep(50)
  }
  throw new Error(`${label} did not become available`)
}

const waitForHealthy = async (baseUrl: string, child: ReturnType<typeof spawn>, label: string) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${label} exited before becoming healthy`)
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.body.status === 'healthy') return
    } catch { /* startup may still be in progress */ }
    await sleep(100)
  }
  throw new Error(`${label} did not become healthy`)
}

const signIn = async (baseUrl: string, email: string, delivered: Map<string, string>) => {
  delivered.delete(email)
  const sent = await request<{ success: boolean }>(baseUrl, '/api/auth/email-otp/send-verification-otp', { method: 'POST', body: JSON.stringify({ email, type: 'sign-in' }) })
  assert.equal(sent.response.status, 200, JSON.stringify(sent.body))
  const otp = await waitFor(() => delivered.get(email), `OTP delivery for ${email}`)
  const signedIn = await request<{ user: { id: string; email: string } }>(baseUrl, '/api/auth/sign-in/email-otp', { method: 'POST', body: JSON.stringify({ email, otp, name: email.split('@')[0] }) })
  assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.body))
  const cookie = cookieFrom(signedIn.response)
  assert.ok(cookie, 'Better Auth must return a session cookie')
  return { cookie, userId: signedIn.body.user.id }
}

type RuntimeEvent = { id: string; type: string; label?: string; payload: Record<string, unknown> }
const readSseEvent = async (response: Response, predicate: (event: RuntimeEvent) => boolean) => {
  assert.ok(response.body, 'SSE response must expose a body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) throw new Error('SSE stream closed before the expected event')
      buffer += decoder.decode(next.value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const eventName = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7)
        const data = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
        if (eventName !== 'runtime_event' || !data) continue
        const event = JSON.parse(data) as RuntimeEvent
        if (predicate(event)) return event
      }
    }
  } finally {
    await reader.cancel()
  }
}

const main = async () => {
  const suffix = randomUUID().replaceAll('-', '')
  const email = `postgres-http-sse-${suffix}@example.invalid`
  const mail = await startMailCatcher()
  const dataRootA = await mkdtemp(path.join(os.tmpdir(), 'onevibe-postgres-http-sse-a-'))
  const dataRootB = await mkdtemp(path.join(os.tmpdir(), 'onevibe-postgres-http-sse-b-'))
  const portA = await availablePort()
  const portB = await availablePort()
  const secret = `onevibe-postgres-http-sse-${randomUUID()}-secret-01234567890123456789`
  const baseA = `http://127.0.0.1:${portA}`
  const baseB = `http://127.0.0.1:${portB}`
  const trustedOrigins = `${baseA},${baseB}`
  const apiA = await startApi(dataRootA, portA, mail.url, secret, trustedOrigins)
  const apiB = await startApi(dataRootB, portB, mail.url, secret, trustedOrigins)
  const sql = postgres(databaseUrl, { max: 2, prepare: false })
  try {
    await waitForHealthy(baseA, apiA.child, 'ONEVibe API A')
    await waitForHealthy(baseB, apiB.child, 'ONEVibe API B')
    const owner = await signIn(baseA, email, mail.delivered)
    const project = await request<{ id: string }>(baseA, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Postgres HTTP SSE project', context: 'cross-process event proof' }) }, owner.cookie)
    assert.equal(project.response.status, 201, JSON.stringify(project.body))
    const task = await request<{ id: string }>(baseA, '/api/tasks', { method: 'POST', body: JSON.stringify({ prompt: 'Complete the local SSE proof.', provider: 'demo', mode: 'chat', projectId: project.body.id }) }, owner.cookie)
    assert.equal(task.response.status, 201, JSON.stringify(task.body))
    await waitFor(async () => {
      const snapshot = await request<{ status: string }>(baseA, `/api/tasks/${task.body.id}`, {}, owner.cookie)
      return snapshot.body.status === 'completed' ? snapshot.body : undefined
    }, 'demo task completion')
    const before = await request<{ events: RuntimeEvent[] }>(baseA, `/api/tasks/${task.body.id}`, {}, owner.cookie)
    const beforeEventId = before.body.events.at(-1)?.id
    assert.ok(beforeEventId, 'task must have a durable event cursor before the live handoff')

    const liveResponsePromise = fetch(`${baseA}/api/tasks/${task.body.id}/events`, { headers: { Accept: 'text/event-stream', Cookie: owner.cookie, 'Last-Event-ID': beforeEventId } })
    await sleep(150)
    const update = await request(baseB, `/api/tasks/${task.body.id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags: ['cross-process-sse'] }) }, owner.cookie)
    assert.equal(update.response.status, 200, JSON.stringify(update.body))
    const liveEvent = await readSseEvent(await liveResponsePromise, (event) => event.label === 'Task tags updated')
    assert.equal(liveEvent.type, 'activity_delta')
    assert.deepEqual(liveEvent.payload.tags, ['cross-process-sse'])

    const replayResponse = await fetch(`${baseA}/api/tasks/${task.body.id}/events`, { headers: { Accept: 'text/event-stream', Cookie: owner.cookie, 'Last-Event-ID': beforeEventId } })
    const replayEvent = await readSseEvent(replayResponse, (event) => event.label === 'Task tags updated')
    assert.equal(replayEvent.id, liveEvent.id)
    assert.ok(replayEvent.id !== beforeEventId)
    console.log(JSON.stringify({ driver: 'postgres', apiProcesses: 2, ownerScoped: true, liveCrossProcessEvent: true, liveEventId: liveEvent.id, suffixReplay: true, replayEventId: replayEvent.id, provider: 'demo', limitation: 'HTTP proof only; deployment broker/tuning, provider runtime, sandbox isolation, and production auth remain open' }, null, 2))
  } finally {
    await apiA.stop()
    await apiB.stop()
    mail.server.close()
    await sql`DELETE FROM "user" WHERE email = ${email}`
    await sql.end({ timeout: 5 })
    await rm(dataRootA, { recursive: true, force: true })
    await rm(dataRootB, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })
