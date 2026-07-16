/**
 * Local Better Auth + owner-scope HTTP acceptance proof.
 *
 * The loopback mail-catcher is test infrastructure only: Better Auth still
 * generates and sends the OTP through the configured webhook, and the test
 * reads that delivery to complete the real sign-in flow. No product route
 * accepts an OTP from the browser or exposes a development bypass.
 *
 * This proves SQLite/local HTTP ownership boundaries. It does not prove
 * production email delivery, Postgres ownership, organization membership, or
 * provider/sandbox isolation.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
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

const startApi = async (dataRoot: string, port: number, webhookUrl: string) => {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dataRoot, TMPDIR: dataRoot, LANG: 'C', NODE_ENV: 'test',
    ONEVIBE_DATA_DIR: dataRoot, ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port),
    ONEVIBE_AUTH_ENABLED: 'true', BETTER_AUTH_SECRET: 'onevibe-auth-e2e-secret-012345678901234567890123',
    ONEVIBE_AUTH_OTP_WEBHOOK_URL: webhookUrl, BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    ONEVIBE_TRUSTED_ORIGINS: `http://127.0.0.1:${port}`, ONEVIBE_PERSISTENCE_DRIVER: 'sqlite',
  }
  const child = spawn(process.execPath, [tsxEntry, serverEntry], { cwd: repoRoot, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true })
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
  headers.set('Content-Type', 'application/json')
  if (cookie) headers.set('Cookie', cookie)
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers })
  const body = await response.json().catch(() => ({})) as T & { error?: string; code?: string }
  return { response, body }
}

const cookieFrom = (response: Response) => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
}

const waitFor = async <T>(read: () => T | undefined, label: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read()
    if (value !== undefined) return value
    await sleep(50)
  }
  throw new Error(`${label} did not become available`)
}

const signIn = async (baseUrl: string, email: string, delivered: Map<string, string>) => {
  delivered.delete(email)
  const sent = await request<{ success: boolean }>(baseUrl, '/api/auth/email-otp/send-verification-otp', { method: 'POST', body: JSON.stringify({ email, type: 'sign-in' }) })
  assert.equal(sent.response.status, 200, JSON.stringify(sent.body))
  assert.equal(sent.body.success, true)
  const otp = await waitFor(() => delivered.get(email), `OTP delivery for ${email}`)
  const signedIn = await request<{ user: { id: string; email: string } }>(baseUrl, '/api/auth/sign-in/email-otp', { method: 'POST', body: JSON.stringify({ email, otp, name: email.split('@')[0] }) })
  assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.body))
  const cookie = cookieFrom(signedIn.response)
  assert.ok(cookie, 'Better Auth must return a session cookie')
  const session = await request<{ enabled: boolean; session: { user: { id: string; email: string } } | null }>(baseUrl, '/api/auth/session', {}, cookie)
  assert.equal(session.response.status, 200)
  assert.equal(session.body.enabled, true)
  assert.equal(session.body.session?.user.email, email)
  return { cookie, userId: session.body.session!.user.id }
}

const waitForHealth = async (baseUrl: string, child: ReturnType<typeof spawn>) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('ONEVibe API exited before becoming healthy')
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.body.status === 'healthy') return
    } catch { /* Better Auth migrations may still be starting. */ }
    await sleep(100)
  }
  throw new Error('ONEVibe API did not become healthy')
}

const main = async () => {
  const mail = await startMailCatcher()
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'onevibe-auth-owner-e2e-'))
  const apiPort = await availablePort()
  const api = await startApi(dataRoot, apiPort, mail.url)
  const baseUrl = `http://127.0.0.1:${apiPort}`
  try {
    await waitForHealth(baseUrl, api.child)
    const publicSession = await request<{ enabled: boolean; session: null }>(baseUrl, '/api/auth/session')
    assert.equal(publicSession.response.status, 200)
    assert.deepEqual(publicSession.body, { enabled: true, session: null })

    const unauthorized = await request<{ code?: string }>(baseUrl, '/api/tasks')
    assert.equal(unauthorized.response.status, 401)
    assert.equal(unauthorized.body.code, 'unauthorized')

    const ownerA = await signIn(baseUrl, 'owner-a@example.test', mail.delivered)
    const projectA = await request<{ id: string }>(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Owner A workspace', context: 'Private A context' }) }, ownerA.cookie)
    assert.equal(projectA.response.status, 201, JSON.stringify(projectA.body))
    const projectFile = await request<{ files: Array<{ path: string }> }>(baseUrl, `/api/projects/${projectA.body.id}/files`, { method: 'POST', body: JSON.stringify({ name: 'private-notes.md', mimeType: 'text/markdown', dataBase64: Buffer.from('owner A only').toString('base64') }) }, ownerA.cookie)
    assert.equal(projectFile.response.status, 201, JSON.stringify(projectFile.body))
    const scheduleA = await request<{ id: string }>(baseUrl, '/api/schedules', { method: 'POST', body: JSON.stringify({ name: 'Owner A schedule', prompt: 'Say hello briefly.', provider: 'demo', mode: 'chat', projectId: projectA.body.id, intervalMinutes: 15 }) }, ownerA.cookie)
    assert.equal(scheduleA.response.status, 201, JSON.stringify(scheduleA.body))
    const mcpA = await request<{ id: string }>(baseUrl, '/api/mcp', { method: 'POST', body: JSON.stringify({ name: 'Owner A MCP', command: 'node', args: ['fixture.mjs'] }) }, ownerA.cookie)
    assert.equal(mcpA.response.status, 201, JSON.stringify(mcpA.body))
    const created = await request<{ id: string }>(baseUrl, '/api/tasks', { method: 'POST', body: JSON.stringify({ prompt: 'Say hello briefly.', provider: 'demo', mode: 'chat', projectId: projectA.body.id, references: [], attachments: [], skills: [] }) }, ownerA.cookie)
    assert.equal(created.response.status, 201, JSON.stringify(created.body))

    const ownerB = await signIn(baseUrl, 'owner-b@example.test', mail.delivered)
    const ownerBProjects = await request<{ projects: Array<{ id: string }> }>(baseUrl, '/api/projects', {}, ownerB.cookie)
    assert.equal(ownerBProjects.response.status, 200)
    assert.ok(!ownerBProjects.body.projects.some((project) => project.id === projectA.body.id))
    const ownerBTasks = await request<{ tasks: Array<{ id: string }> }>(baseUrl, '/api/tasks', {}, ownerB.cookie)
    assert.equal(ownerBTasks.response.status, 200)
    assert.deepEqual(ownerBTasks.body.tasks, [])
    const ownerBSchedules = await request<{ schedules: Array<{ id: string }> }>(baseUrl, '/api/schedules', {}, ownerB.cookie)
    assert.equal(ownerBSchedules.response.status, 200)
    assert.deepEqual(ownerBSchedules.body.schedules, [])
    const ownerBMcp = await request<{ configs: Array<{ id: string }> }>(baseUrl, '/api/mcp', {}, ownerB.cookie)
    assert.equal(ownerBMcp.response.status, 200)
    assert.deepEqual(ownerBMcp.body.configs, [])

    const forbiddenTask = await request<{ error?: string }>(baseUrl, `/api/tasks/${created.body.id}`, {}, ownerB.cookie)
    assert.equal(forbiddenTask.response.status, 404)
    assert.equal(forbiddenTask.body.error, 'Task not found')
    const forbiddenMove = await request<{ error?: string }>(baseUrl, `/api/tasks/${created.body.id}/project`, { method: 'PATCH', body: JSON.stringify({ projectId: projectA.body.id }) }, ownerB.cookie)
    assert.equal(forbiddenMove.response.status, 404)
    assert.equal(forbiddenMove.body.error, 'Task not found')
    const forbiddenTags = await request<{ error?: string }>(baseUrl, `/api/tasks/${created.body.id}/tags`, { method: 'PATCH', body: JSON.stringify({ tags: ['cross-user'] }) }, ownerB.cookie)
    assert.equal(forbiddenTags.response.status, 404)
    assert.equal(forbiddenTags.body.error, 'Task not found')
    const forbiddenProjectUpdate = await request<{ error?: string }>(baseUrl, `/api/projects/${projectA.body.id}`, { method: 'PATCH', body: JSON.stringify({ context: 'cross-user mutation' }) }, ownerB.cookie)
    assert.equal(forbiddenProjectUpdate.response.status, 404)
    assert.equal(forbiddenProjectUpdate.body.error, 'Project not found')
    const forbiddenProjectFile = await request<{ error?: string }>(baseUrl, `/api/projects/${projectA.body.id}/files?path=${encodeURIComponent(projectFile.body.files[0]!.path)}`, {}, ownerB.cookie)
    assert.equal(forbiddenProjectFile.response.status, 404)
    assert.equal(forbiddenProjectFile.body.error, 'Project not found')
    const forbiddenSchedule = await request<{ error?: string }>(baseUrl, `/api/schedules/${scheduleA.body.id}`, { method: 'DELETE' }, ownerB.cookie)
    assert.equal(forbiddenSchedule.response.status, 404)
    assert.equal(forbiddenSchedule.body.error, 'Schedule not found')
    const forbiddenMcp = await request<{ error?: string }>(baseUrl, `/api/mcp/${mcpA.body.id}`, { method: 'DELETE' }, ownerB.cookie)
    assert.equal(forbiddenMcp.response.status, 404)
    assert.equal(forbiddenMcp.body.error, 'MCP configuration not found')
    const ownerATask = await request<{ id: string; ownerUserId?: string }>(baseUrl, `/api/tasks/${created.body.id}`, {}, ownerA.cookie)
    assert.equal(ownerATask.response.status, 200)
    assert.equal(ownerATask.body.id, created.body.id)
    assert.equal(ownerATask.body.ownerUserId, ownerA.userId)

    console.log(JSON.stringify({ auth: 'better-auth email OTP through loopback delivery fixture', unauthorizedStatus: unauthorized.response.status, ownerA: ownerA.userId, ownerB: ownerB.userId, taskId: created.body.id, ownerBTaskCount: ownerBTasks.body.tasks.length, forbiddenStatuses: [forbiddenTask.response.status, forbiddenMove.response.status, forbiddenTags.response.status, forbiddenProjectUpdate.response.status, forbiddenProjectFile.response.status, forbiddenSchedule.response.status, forbiddenMcp.response.status], ownerReadStatus: ownerATask.response.status, productionLimitations: ['real email delivery', 'Postgres repository/runtime', 'organization membership'] }, null, 2))
  } finally {
    await api.stop(); await rm(dataRoot, { recursive: true, force: true }); await new Promise<void>((resolve) => mail.server.close(() => resolve()))
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
