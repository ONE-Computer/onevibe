import type { IncomingMessage, ServerResponse } from 'node:http'
import type Database from 'better-sqlite3'
import { betterAuth } from 'better-auth'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
import { emailOTP } from 'better-auth/plugins'

const enabled = process.env.ONEVIBE_AUTH_ENABLED === 'true'

const trustedOrigins = () => (process.env.ONEVIBE_TRUSTED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean)

export class AuthService {
  private auth?: ReturnType<typeof betterAuth<any>>

  constructor(private readonly database: Database.Database) {}

  get isEnabled() { return enabled }

  async initialize() {
    if (!enabled) return
    const secret = process.env.BETTER_AUTH_SECRET?.trim()
    if (!secret || secret.length < 32) throw new Error('ONEVIBE_AUTH_ENABLED=true requires BETTER_AUTH_SECRET with at least 32 characters')
    const webhook = process.env.ONEVIBE_AUTH_OTP_WEBHOOK_URL?.trim()
    if (!webhook) throw new Error('ONEVIBE_AUTH_ENABLED=true requires ONEVIBE_AUTH_OTP_WEBHOOK_URL; OTPs must use a real email delivery path')
    this.auth = betterAuth({
      database: this.database,
      secret,
      baseURL: process.env.BETTER_AUTH_URL?.trim() || trustedOrigins()[0],
      trustedOrigins: trustedOrigins(),
      emailAndPassword: { enabled: false },
      plugins: [emailOTP({
        otpLength: 6,
        expiresIn: 300,
        storeOTP: 'hashed',
        disableSignUp: false,
        async sendVerificationOTP({ email, otp, type }) {
          const response = await fetch(webhook, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, type }), signal: AbortSignal.timeout(10_000),
          })
          if (!response.ok) throw new Error(`OTP delivery webhook returned HTTP ${response.status}`)
        },
      })],
    })
    const auth = this.auth
    if (!auth) throw new Error('Better Auth failed to initialize')
    const context = await auth.$context
    await context.runMigrations()
  }

  async handle(request: IncomingMessage, response: ServerResponse) {
    if (!this.auth) return false
    await toNodeHandler(this.auth)(request, response)
    return true
  }

  async getSession(request: IncomingMessage) {
    if (!this.auth) return null
    return this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) })
  }
}
