import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../server/db/schema.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

process.env.ONEVIBE_AUTH_ENABLED = 'true'
process.env.BETTER_AUTH_SECRET = `postgres-auth-e2e-${randomUUID()}-secret-value-01234567890123456789`
const { AuthService } = await import('../server/auth.js')

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

const startWebhook = async () => {
  const port = await availablePort()
  const delivered = new Map<string, string>()
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { email?: string; otp?: string }
    if (typeof body.email !== 'string' || typeof body.otp !== 'string' || !/^\d{6}$/.test(body.otp)) {
      response.writeHead(400); response.end('invalid'); return
    }
    delivered.set(body.email, body.otp)
    response.writeHead(204); response.end()
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { server, url: `http://127.0.0.1:${port}/otp`, delivered }
}

const startAuthServer = async (auth: InstanceType<typeof AuthService>, port: number) => {
  const server = createServer(async (request, response) => {
    if (request.url === '/api/auth/session') {
      const session = await auth.getSession(request)
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ enabled: true, session })); return
    }
    await auth.handle(request, response)
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { server, baseUrl: `http://127.0.0.1:${port}` }
}

const cookieFrom = (response: Response) => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  const values = headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : [])
  return values.map((value) => value.split(';', 1)[0]).filter(Boolean).join('; ')
}

const request = async (baseUrl: string, pathname: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers); headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  return { response, body }
}

const waitForOtp = async (delivered: Map<string, string>, email: string) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const otp = delivered.get(email)
    if (otp) return otp
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`OTP delivery for ${email} did not arrive`)
}

const main = async () => {
  const sql = postgres(databaseUrl, { max: 2, prepare: false })
  const db = drizzle(sql, { schema })
  const webhook = await startWebhook()
  process.env.ONEVIBE_AUTH_OTP_WEBHOOK_URL = webhook.url
  const auth = new AuthService(db, 'postgres')
  let authServer: { server: Server; baseUrl: string } | undefined
  const authPort = await availablePort()
  process.env.BETTER_AUTH_URL = `http://127.0.0.1:${authPort}`
  process.env.ONEVIBE_TRUSTED_ORIGINS = `http://127.0.0.1:${authPort}`
  const emails = [`postgres-auth-a-${randomUUID()}@example.invalid`, `postgres-auth-b-${randomUUID()}@example.invalid`]
  try {
    await auth.initialize()
    authServer = await startAuthServer(auth, authPort)
    const cookies: string[] = []
    const userIds: string[] = []
    for (const email of emails) {
      webhook.delivered.delete(email)
      const sent = await request(authServer.baseUrl, '/api/auth/email-otp/send-verification-otp', { method: 'POST', body: JSON.stringify({ email, type: 'sign-in' }) })
      assert.equal(sent.response.status, 200, JSON.stringify(sent.body))
      const otp = await waitForOtp(webhook.delivered, email)
      const signedIn = await request(authServer.baseUrl, '/api/auth/sign-in/email-otp', { method: 'POST', body: JSON.stringify({ email, otp, name: email.split('@')[0] }) })
      assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.body))
      const cookie = cookieFrom(signedIn.response)
      assert.ok(cookie, 'Postgres Better Auth must return a session cookie')
      cookies.push(cookie)
      const sessionResponse: Response = await fetch(`${authServer.baseUrl}/api/auth/session`, { headers: { Cookie: cookie } })
      const sessionBody = await sessionResponse.json() as { session?: { user?: { id?: string; email?: string } } }
      assert.equal(sessionResponse.status, 200)
      assert.equal(sessionBody.session?.user?.email, email)
      userIds.push(sessionBody.session?.user?.id ?? '')
    }
    assert.notEqual(userIds[0], userIds[1])
    const users = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM "user" WHERE email = ${emails[0]} OR email = ${emails[1]}`
    const sessions = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM session WHERE "userId" = ${userIds[0]} OR "userId" = ${userIds[1]}`
    assert.equal(Number(users[0]?.count), 2)
    assert.equal(Number(sessions[0]?.count), 2)
    console.log(JSON.stringify({ auth: 'Better Auth + Drizzle/Postgres', userCount: Number(users[0]?.count), sessionCount: Number(sessions[0]?.count), distinctUsers: true, loopbackOtpDelivery: true, limitation: 'not yet selected by the running TaskStore/server driver' }, null, 2))
  } finally {
    if (authServer) await new Promise<void>((resolve) => authServer!.server.close(() => resolve()))
    await new Promise<void>((resolve) => webhook.server.close(() => resolve()))
    await sql`DELETE FROM "user" WHERE email = ${emails[0]} OR email = ${emails[1]}`
    await sql.end({ timeout: 5 })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
