/**
 * Authenticated Postgres HTTP acceptance proof.
 *
 * The loopback mail catcher is test delivery infrastructure only. Better Auth
 * still generates, hashes, and verifies the OTP through its configured
 * webhook; no product route accepts an OTP or bypasses the session boundary.
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

const startApi = async (dataRoot: string, port: number, webhookUrl: string) => {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dataRoot, TMPDIR: dataRoot, LANG: 'C', NODE_ENV: 'test',
    DATABASE_URL: databaseUrl, ONEVIBE_PERSISTENCE_DRIVER: 'postgres', ONEVIBE_DATA_DIR: dataRoot,
    ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port), ONEVIBE_AUTH_ENABLED: 'true',
    BETTER_AUTH_SECRET: `onevibe-postgres-http-${randomUUID()}-secret-01234567890123456789`,
    ONEVIBE_AUTH_OTP_WEBHOOK_URL: webhookUrl, BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    ONEVIBE_TRUSTED_ORIGINS: `http://127.0.0.1:${port}`,
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
  const otp = await waitFor(() => delivered.get(email), `OTP delivery for ${email}`)
  const signedIn = await request<{ user: { id: string; email: string } }>(baseUrl, '/api/auth/sign-in/email-otp', { method: 'POST', body: JSON.stringify({ email, otp, name: email.split('@')[0] }) })
  assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.body))
  const cookie = cookieFrom(signedIn.response)
  assert.ok(cookie, 'Better Auth must return a session cookie')
  return { cookie, userId: signedIn.body.user.id }
}

const main = async () => {
  const suffix = randomUUID().replaceAll('-', '')
  const emails = [`postgres-http-a-${suffix}@example.invalid`, `postgres-http-b-${suffix}@example.invalid`]
  const mail = await startMailCatcher()
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'onevibe-postgres-auth-http-'))
  const apiPort = await availablePort()
  const api = await startApi(dataRoot, apiPort, mail.url)
  const baseUrl = `http://127.0.0.1:${apiPort}`
  const sql = postgres(databaseUrl, { max: 2, prepare: false })
  let themeTenantId: string | undefined
  let themeOrganizationId: string | undefined
  let otherThemeTenantId: string | undefined
  let otherThemeOrganizationId: string | undefined
  try {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (api.child.exitCode !== null || api.child.signalCode !== null) throw new Error('ONEVibe Postgres auth API exited before becoming healthy')
      try {
        const health = await request<{ status: string }>(baseUrl, '/api/health')
        if (health.body.status === 'healthy') break
      } catch { /* Better Auth/Postgres startup may still be in progress. */ }
      if (attempt === 149) throw new Error('ONEVibe Postgres auth API did not become healthy')
      await sleep(100)
    }
    const readiness = await request<{ status: string; applicationReady: boolean }>(baseUrl, '/api/health/ready')
    assert.equal(readiness.response.status, 200, JSON.stringify(readiness.body))
    assert.equal(readiness.body.status, 'ready')
    assert.equal(readiness.body.applicationReady, true)
    const unauthorized = await request<{ error?: string; code?: string }>(baseUrl, '/api/projects')
    assert.equal(unauthorized.response.status, 401)
    const ownerA = await signIn(baseUrl, emails[0]!, mail.delivered)
    const ownerB = await signIn(baseUrl, emails[1]!, mail.delivered)
    const baselineDiagnostics = await request<{ auth: { enabled: boolean; sessionScoped: boolean }; modelBoundary: { directFirstPartyAllowed: boolean; configured: boolean }; persistence: { active: string; runtimeSwitchReady: boolean }; runtime: { providers: Array<{ id: string; available: boolean; compatible: boolean }> }; sandbox: { configured: boolean; boundary: string }; mcp: { configuredCount: number } }>(baseUrl, '/api/diagnostics', {}, ownerA.cookie)
    assert.equal(baselineDiagnostics.response.status, 200, JSON.stringify(baselineDiagnostics.body))
    const currentTheme = await request<{ source: string; persistent: boolean; config: { tenantId: string } }>(baseUrl, '/api/theme/current', {}, ownerA.cookie)
    assert.equal(currentTheme.response.status, 200, JSON.stringify(currentTheme.body))
    assert.equal(currentTheme.body.source, 'base')
    assert.equal(currentTheme.body.persistent, false)
    const organization = await request<{ id: string }>(baseUrl, '/api/organizations', { method: 'POST', body: JSON.stringify({ name: 'Theme acceptance org' }) }, ownerA.cookie)
    assert.equal(organization.response.status, 201, JSON.stringify(organization.body))
    themeOrganizationId = organization.body.id
    themeTenantId = `acme-${suffix.slice(0, 12)}`
    const otherOrganization = await request<{ id: string }>(baseUrl, '/api/organizations', { method: 'POST', body: JSON.stringify({ name: 'Second theme acceptance org' }) }, ownerB.cookie)
    assert.equal(otherOrganization.response.status, 201, JSON.stringify(otherOrganization.body))
    otherThemeOrganizationId = otherOrganization.body.id
    otherThemeTenantId = `second-${suffix.slice(0, 10)}`
    const seededTheme = {
      schemaVersion: 1, tenantId: themeTenantId, tenantName: 'Acme',
      tokens: { colorBrandPrimary: '#123456' }, brand: { brandName: 'Acme' },
      homePage: { announcementBannerVisible: false, featureCards: [] }, navigation: { items: [] },
      features: { showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false }, compliance: {},
    }
    const seededAt = new Date()
    await sql`
      INSERT INTO tenant_theme_config (tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at)
      VALUES (${themeTenantId}, ${themeOrganizationId}, ${ownerA.userId}, 1, true, ${JSON.stringify(seededTheme)}::jsonb, ${ownerA.userId}, ${ownerA.userId}, ${seededAt}, ${seededAt})
    `
    await sql`
      INSERT INTO tenant_theme_config_event (id, tenant_id, org_id, version, operation, actor_user_id, config_json, created_at)
      VALUES (${`theme_event_seed_${suffix}`}, ${themeTenantId}, ${themeOrganizationId}, 1, 'created', ${ownerA.userId}, ${JSON.stringify(seededTheme)}::jsonb, ${seededAt})
    `
    const otherSeededTheme = { ...seededTheme, tenantId: otherThemeTenantId, tenantName: 'Second', brand: { brandName: 'Second' } }
    await sql`
      INSERT INTO tenant_theme_config (tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at)
      VALUES (${otherThemeTenantId}, ${otherThemeOrganizationId}, ${ownerB.userId}, 1, true, ${JSON.stringify(otherSeededTheme)}::jsonb, ${ownerB.userId}, ${ownerB.userId}, ${seededAt}, ${seededAt})
    `
    await sql`
      INSERT INTO tenant_theme_config_event (id, tenant_id, org_id, version, operation, actor_user_id, config_json, created_at)
      VALUES (${`theme_event_other_seed_${suffix}`}, ${otherThemeTenantId}, ${otherThemeOrganizationId}, 1, 'created', ${ownerB.userId}, ${JSON.stringify(otherSeededTheme)}::jsonb, ${seededAt})
    `
    const ownerATheme = await request<{ config: { tenantId: string }; customized: boolean; version: number }>(baseUrl, `/api/theme/${themeTenantId}`, {}, ownerA.cookie)
    assert.equal(ownerATheme.response.status, 200, JSON.stringify(ownerATheme.body))
    assert.equal(ownerATheme.body.config.tenantId, themeTenantId)
    assert.equal(ownerATheme.body.customized, true)
    assert.equal(ownerATheme.body.version, 1)
    const addThemeMember = await request(baseUrl, `/api/organizations/${themeOrganizationId}/members`, { method: 'POST', body: JSON.stringify({ userId: ownerB.userId }) }, ownerA.cookie)
    assert.equal(addThemeMember.response.status, 201, JSON.stringify(addThemeMember.body))
    const ownerBTheme = await request(baseUrl, `/api/theme/${themeTenantId}`, {}, ownerB.cookie)
    assert.equal(ownerBTheme.response.status, 404, JSON.stringify(ownerBTheme.body))
    const ownerBOwnTheme = await request<{ config: { tenantId: string } }>(baseUrl, `/api/theme/${otherThemeTenantId}`, {}, ownerB.cookie)
    assert.equal(ownerBOwnTheme.response.status, 200, JSON.stringify(ownerBOwnTheme.body))
    assert.equal(ownerBOwnTheme.body.config.tenantId, otherThemeTenantId)
    const ownerAOtherTheme = await request(baseUrl, `/api/theme/${otherThemeTenantId}`, {}, ownerA.cookie)
    assert.equal(ownerAOtherTheme.response.status, 404, JSON.stringify(ownerAOtherTheme.body))
    const ownerAThemeList = await request<{ themes: Array<{ tenantId: string }> }>(baseUrl, '/api/theme', {}, ownerA.cookie)
    const ownerBThemeList = await request<{ themes: Array<{ tenantId: string }> }>(baseUrl, '/api/theme', {}, ownerB.cookie)
    assert.deepEqual(ownerAThemeList.body.themes.map((theme) => theme.tenantId), [themeTenantId])
    assert.deepEqual(ownerBThemeList.body.themes.map((theme) => theme.tenantId), [otherThemeTenantId])
    const memberMutation = await request(baseUrl, `/api/theme/${themeTenantId}`, { method: 'PUT', body: JSON.stringify({ expectedVersion: 1, config: { schemaVersion: 1, tenantName: 'Acme', tokens: { colorBrandPrimary: '#654321' }, homePage: { announcementBannerVisible: false, featureCards: [] }, brand: { brandName: 'Acme' }, navigation: { items: [] }, features: { showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false }, compliance: {} } }) }, ownerB.cookie)
    assert.equal(memberMutation.response.status, 403, JSON.stringify(memberMutation.body))
    const updatedTheme = await request<{ config: { homePage: { heroHeadline?: string } }; customized: boolean; version: number }>(baseUrl, `/api/theme/${themeTenantId}`, { method: 'PUT', body: JSON.stringify({ expectedVersion: 1, config: { schemaVersion: 1, tenantName: 'Acme', tokens: { colorBrandPrimary: '#654321' }, homePage: { heroHeadline: 'Secure workspaces', announcementBannerVisible: false, featureCards: [] }, brand: { brandName: 'Acme' }, navigation: { items: [] }, features: { showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false }, compliance: {} } }) }, ownerA.cookie)
    assert.equal(updatedTheme.response.status, 200, JSON.stringify(updatedTheme.body))
    assert.equal(updatedTheme.body.version, 2)
    assert.equal(updatedTheme.body.customized, true)
    assert.equal(updatedTheme.body.config.homePage.heroHeadline, 'Secure workspaces')
    const staleTheme = await request<{ code?: string }>(baseUrl, `/api/theme/${themeTenantId}`, { method: 'PUT', body: JSON.stringify({ expectedVersion: 1, config: { schemaVersion: 1, tenantName: 'Stale', homePage: { announcementBannerVisible: false, featureCards: [] }, brand: {}, navigation: { items: [] }, features: { showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false }, compliance: {} } }) }, ownerA.cookie)
    assert.equal(staleTheme.response.status, 409, JSON.stringify(staleTheme.body))
    assert.equal(staleTheme.body.code, 'theme_version_conflict')
    const resetTheme = await request<{ customized: boolean; version: number }>(baseUrl, `/api/theme/${themeTenantId}/reset`, { method: 'POST', body: JSON.stringify({ expectedVersion: 2 }) }, ownerA.cookie)
    assert.equal(resetTheme.response.status, 200, JSON.stringify(resetTheme.body))
    assert.equal(resetTheme.body.version, 3)
    assert.equal(resetTheme.body.customized, false)
    const eventRows = await sql<{ operation: string; version: number }[]>`SELECT operation, version FROM tenant_theme_config_event WHERE tenant_id = ${themeTenantId} ORDER BY version ASC`
    assert.deepEqual(eventRows.map((row) => [row.operation, row.version]), [['created', 1], ['updated', 2], ['reset', 3]])
    const unknownTheme = await request(baseUrl, '/api/theme/not-visible', {}, ownerB.cookie)
    assert.equal(unknownTheme.response.status, 404)
    const bodyTenantId = await request(baseUrl, `/api/theme/${themeTenantId}`, { method: 'PUT', body: JSON.stringify({ expectedVersion: 3, config: { tenantId: 'attacker', schemaVersion: 1, tenantName: 'Attacker' } }) }, ownerA.cookie)
    assert.equal(bodyTenantId.response.status, 400)
    const diagnostics = await request<{ auth: { enabled: boolean; sessionScoped: boolean }; modelBoundary: { directFirstPartyAllowed: boolean; configured: boolean }; persistence: { active: string; runtimeSwitchReady: boolean }; runtime: { providers: Array<{ id: string; available: boolean; compatible: boolean }> }; sandbox: { configured: boolean; boundary: string }; mcp: { configuredCount: number }; theme: { persistent: boolean; audit: { tenantCount: number; eventCount: number; latestOperation: string | null; latestAt: string | null } } }>(baseUrl, '/api/diagnostics', {}, ownerA.cookie)
    assert.equal(diagnostics.response.status, 200)
    assert.equal(diagnostics.body.auth.sessionScoped, true)
    assert.equal(diagnostics.body.persistence.active, 'postgres')
    assert.equal(diagnostics.body.persistence.runtimeSwitchReady, true)
    assert.equal(diagnostics.body.theme.persistent, true)
    assert.deepEqual(diagnostics.body.theme.audit, { tenantCount: 1, eventCount: 3, latestOperation: 'reset', latestAt: diagnostics.body.theme.audit.latestAt })
    assert.match(diagnostics.body.theme.audit.latestAt ?? '', /^20\d\d-/)
    assert.deepEqual({ auth: diagnostics.body.auth, modelBoundary: diagnostics.body.modelBoundary, persistence: diagnostics.body.persistence, runtime: diagnostics.body.runtime.providers.map(({ id, available, compatible }) => ({ id, available, compatible })), sandbox: diagnostics.body.sandbox, mcp: diagnostics.body.mcp.configuredCount }, { auth: baselineDiagnostics.body.auth, modelBoundary: baselineDiagnostics.body.modelBoundary, persistence: baselineDiagnostics.body.persistence, runtime: baselineDiagnostics.body.runtime.providers.map(({ id, available, compatible }) => ({ id, available, compatible })), sandbox: baselineDiagnostics.body.sandbox, mcp: baselineDiagnostics.body.mcp.configuredCount })
    const project = await request<{ id: string }>(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Postgres auth project', context: 'owner A' }) }, ownerA.cookie)
    assert.equal(project.response.status, 201, JSON.stringify(project.body))
    const ownerBProjects = await request<{ projects: Array<{ id: string }> }>(baseUrl, '/api/projects', {}, ownerB.cookie)
    assert.equal(ownerBProjects.response.status, 200)
    assert.equal(ownerBProjects.body.projects.some((candidate) => candidate.id === project.body.id), false)
    const task = await request<{ id: string }>(baseUrl, '/api/tasks', { method: 'POST', body: JSON.stringify({ prompt: 'Say hello from authenticated Postgres', provider: 'demo', mode: 'chat', projectId: project.body.id }) }, ownerA.cookie)
    assert.equal(task.response.status, 201, JSON.stringify(task.body))
    const ownerBTasks = await request<{ tasks: Array<{ id: string }> }>(baseUrl, '/api/tasks', {}, ownerB.cookie)
    assert.equal(ownerBTasks.response.status, 200)
    assert.equal(ownerBTasks.body.tasks.some((candidate) => candidate.id === task.body.id), false)
    const forbidden = await request(baseUrl, `/api/tasks/${task.body.id}`, {}, ownerB.cookie)
    assert.equal(forbidden.response.status, 404)
    const ownerAProject = await request(baseUrl, `/api/projects/${project.body.id}`, {}, ownerA.cookie)
    assert.equal(ownerAProject.response.status, 404, 'unsupported project GET should remain bounded')
    console.log(JSON.stringify({ auth: 'Better Auth email OTP through loopback delivery fixture', driver: diagnostics.body.persistence.active, runtimeSwitchReady: diagnostics.body.persistence.runtimeSwitchReady, readiness: true, unauthorizedStatus: unauthorized.response.status, ownerIsolation: true, themeIsolation: true, taskCreated: true, crossOwnerTaskStatus: forbidden.response.status, themeVersion: resetTheme.body.version, themeEvents: eventRows.length, themeAuditEvents: diagnostics.body.theme.audit.eventCount, themeAuditLatest: diagnostics.body.theme.audit.latestOperation, themeMemberRead: ownerBTheme.response.status, themeMemberWrite: memberMutation.response.status, themeOtherOwnerRead: ownerAOtherTheme.response.status, themeConflict: staleTheme.response.status, themeReset: resetTheme.body.customized === false, runtimeInvariant: true, directFirstPartyAllowed: diagnostics.body.auth.sessionScoped ? false : undefined }, null, 2))
  } finally {
    await api.stop()
    mail.server.close()
    if (themeTenantId) await sql`DELETE FROM tenant_theme_config_event WHERE tenant_id = ${themeTenantId}`
    if (themeTenantId) await sql`DELETE FROM tenant_theme_config WHERE tenant_id = ${themeTenantId}`
    if (otherThemeTenantId) await sql`DELETE FROM tenant_theme_config_event WHERE tenant_id = ${otherThemeTenantId}`
    if (otherThemeTenantId) await sql`DELETE FROM tenant_theme_config WHERE tenant_id = ${otherThemeTenantId}`
    if (themeOrganizationId) await sql`DELETE FROM org WHERE id = ${themeOrganizationId}`
    if (otherThemeOrganizationId) await sql`DELETE FROM org WHERE id = ${otherThemeOrganizationId}`
    await sql`DELETE FROM "user" WHERE email IN (${emails[0]}, ${emails[1]})`
    await sql.end({ timeout: 5 })
    await rm(dataRoot, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })
