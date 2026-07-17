# Phase 3 — Cloud Architecture

> **Implementation status (2026-07-17):** This historical plan is retained for intent, but the repository's current source of truth is `TODO.md`, `docker-compose.yml`, `Dockerfile`, `docs/DEPLOYMENT-RUNBOOK.md`, and the P4 evidence in `docs/LIVE-E2E-ENGINEERING-LOG.md`. The running server has a controlled Postgres/Better Auth path, authenticated two-process SSE proof, separate liveness/readiness endpoints, graceful shutdown, and local backup/restore evidence. The illustrative snippets below must not be copied over the current LiteLLM-only, fail-closed environment contract. Managed deployment, production secrets, PITR/retention, and e2b/attested sandbox acceptance remain external gates.

> **Goal**: `https://onevibe.yourdomain.com` — deployed, authenticated, persistent across refreshes.
> **Exit criterion**: Navigate to the URL, log in with email OTP, create a task, Claude responds, conversation persists on page refresh, all data scoped to that user.
> **Tasks**: P3-01 through P3-07 in `TODO.md`
> **Prerequisite**: Phase 2 complete.

---

## Study First

Before implementing, read these OpenWork files in `/tmp/openwork`:
- `ee/apps/den-api/src/auth.ts` — full better-auth configuration; copy the plugin list
- `ee/packages/den-db/src/schema/` — all table schemas; understand the workspace/worker model
- `packages/connect-link/src/index.ts` — JWT deep-link bootstrap pattern (for future use)
- `.devcontainer/docker-compose.yml` — full local dev stack

---

## P3-01: Auth with better-auth

**New dependencies**:
```bash
npm install better-auth @better-auth/drizzle-adapter
```

**Server changes** (`server/auth.ts` — new file):
```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { emailOTP } from 'better-auth/plugins'
import { db } from './db.js' // Drizzle instance (see P3-03)

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: false }, // OTP only, no passwords
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        // Send via Resend or nodemailer; see P3-01-email
        await sendEmail({ to: email, subject: 'Your ONEVibe code', text: `Your sign-in code: ${otp}` })
      },
      expiresIn: 300, // 5 minutes
    }),
  ],
  trustedOrigins: (process.env.ONEVIBE_TRUSTED_ORIGINS ?? 'http://localhost:5173').split(','),
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-in-production',
})
```

**Route registration** in `server/index.ts`:
```ts
// Add before all API routes:
if (req.url?.startsWith('/api/auth')) {
  return auth.handler(req, res)
}
```

**Session middleware** — add to every `/api/*` route handler:
```ts
const getSession = async (req: IncomingMessage) => {
  const session = await auth.api.getSession({ headers: req.headers as Headers })
  return session
}

// In each route handler:
const session = await getSession(req)
if (!session) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized', code: 'unauthorized' })); return }
```

**Frontend** (`src/lib/auth.ts` — new):
```ts
import { createAuthClient } from 'better-auth/client'
export const authClient = createAuthClient({ baseURL: '/api/auth' })
export const useSession = () => authClient.useSession()
```

**Login page** (`src/components/LoginPage.tsx` — new):
- Single input: email address
- "Send code" button → calls `authClient.signIn.emailOtp({ email })`
- OTP input appears → "Sign in" button → calls `authClient.signIn.emailOtp.verify({ email, otp })`
- On success → `window.history.pushState({}, '', '/')` → `App` re-renders with session

**App.tsx gate**:
```tsx
const { data: session, isPending } = useSession()
if (isPending) return <LoadingSpinner />
if (!session) return <LoginPage />
// ...rest of app
```

### Email provider options (choose one):
1. **Resend** (recommended for production): `npm install resend` — free tier 3k emails/month
2. **Nodemailer + SMTP**: for self-hosted setups
3. **Development policy**: no console OTP fallback is permitted. Use the loopback delivery fixture only in tests; enabled deployments require a real OTP delivery webhook.

---

## P3-02: Replace Hardcoded Identity

**Files**: `src/components/Sidebar.tsx`, `src/components/Workspace.tsx`, `src/App.tsx`

After P3-01 ships, `useSession()` provides `session.user.name` and `session.user.email`.

Changes:
- `Sidebar.tsx:174` — `"Terence"` → `session.user.name ?? session.user.email`
- `Sidebar.tsx:174` — `TT` → initials from `session.user.name` or first char of email
- `Sidebar.tsx:174` — `"Local workspace"` → org name (later, Phase P3-07) or `"Personal workspace"`
- `Workspace.tsx:216` — `local.onevibe.dev` → `window.location.host`
- `Schedules.tsx:38` notification copy — remove "governed" language

---

## P3-03: Migrate to PostgreSQL

**New dependencies**:
```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit @types/pg
```

**Schema** (`server/db/schema.ts` — new):

Mirror current SQLite tables to Postgres Drizzle schema. Key tables to migrate from `server/persistence/`:
- `tasks` — id, title, prompt, provider, mode, status, projectId, createdAt, updatedAt, userId (new)
- `task_events` — id, taskId, sequence, type, lane, status, label, content, payload, createdAt, previousHash, eventHash
- `projects` — id, name, context, createdAt, updatedAt, userId (new)
- `project_files` — id, projectId, name, path, size, mimeType, createdAt
- `schedules` — id, name, prompt, provider, mode, projectId, intervalMinutes, enabled, nextRunAt, lastRunAt
- `library_items` — taskId (FK), createdAt
- `chat_messages` — id, taskId, turnId, role, content, status, provider, createdAt, updatedAt

Add `userId` (FK to `auth.users`) on `tasks`, `projects`, `schedules`.

**Drizzle config** (`drizzle.config.ts`):
```ts
export default {
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
}
```

**Migration strategy**: Keep SQLite for dev if `DATABASE_URL` is unset, Postgres when set. Use a `getDb()` factory that selects the driver. This lets Phase 1 and Phase 2 ship without breaking existing local dev.

---

## P3-04: Containerise

**`Dockerfile`** (multi-stage):
```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache python3 make g++  # for better-sqlite3 native build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json .
ENV NODE_ENV=production
ENV ONEVIBE_API_PORT=4311
EXPOSE 4311
CMD ["node", "--import=tsx/esm", "server/index.ts"]
```

**`docker-compose.yml`**:
```yaml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: onevibe
      POSTGRES_USER: onevibe
      POSTGRES_PASSWORD: localdev
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]

  api:
    build: .
    environment:
      DATABASE_URL: postgres://onevibe:localdev@postgres:5432/onevibe
      ONEVIBE_LITELLM_URL: ${ONEVIBE_LITELLM_URL}
      ONEVIBE_LITELLM_API_KEY: ${ONEVIBE_LITELLM_API_KEY}
      ONEVIBE_LITELLM_MODEL: ${ONEVIBE_LITELLM_MODEL}
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:-local-dev-change-me}
      ONEVIBE_TRUSTED_ORIGINS: http://localhost:5173,http://localhost:4311
    ports: ["4311:4311"]
    depends_on: [postgres]

volumes:
  pgdata:
```

**`.env.example`** (comprehensive):
```
# Required for Claude SDK; route all model traffic through LiteLLM
ONEVIBE_LITELLM_URL=http://litellm:4000
ONEVIBE_LITELLM_API_KEY=relay-key
ONEVIBE_LITELLM_MODEL=claude-sonnet-5

# Required for auth
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-32

# Required for email OTP (use Resend)
RESEND_API_KEY=re_...

# Database (Postgres in prod, SQLite in dev if omitted)
DATABASE_URL=postgres://onevibe:password@localhost:5432/onevibe

# Optional: ONEComputer sandbox
ONECOMPUTER_API_URL=
ONECOMPUTER_SERVICE_TOKEN=
ONECOMPUTER_PROJECT_ID=

# Optional: e2b cloud sandbox (Phase P3-06)
E2B_API_KEY=

# Server
ONEVIBE_API_PORT=4311
ONEVIBE_TRUSTED_ORIGINS=http://localhost:5173
```

---

## P3-05: Deploy {#deploy}

### Railway (recommended — simplest)

1. Create `railway.toml`:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "node --import=tsx/esm server/index.ts"
healthcheckPath = "/api/runtime"
healthcheckTimeout = 300

[[services]]
name = "api"
```

2. Add a Postgres plugin in Railway dashboard → copy `DATABASE_URL` to env vars
3. Set all required env vars in Railway dashboard
4. `railway up` — deploys in ~3 minutes
5. Enable custom domain → `onevibe.yourdomain.com` → SSL auto-provisioned

### Fly.io (alternative — better for persistent sandboxes later)

```toml
# fly.toml
app = "onevibe"
primary_region = "sin"  # Singapore for APAC

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 4311
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1
```

Add Postgres: `fly postgres create --name onevibe-db`

---

## P3-06: Cloud Sandbox with e2b

**Context**: Each task needs an isolated execution environment. [e2b.dev](https://e2b.dev) provides cloud sandbox VMs with a simple Node.js SDK. Each sandbox is an isolated container with a real filesystem and bash shell.

**New dependency**:
```bash
npm install @e2b/code-interpreter
```

**New adapter** (`server/e2b-sandbox-runner.ts`):
```ts
import { CodeInterpreter } from '@e2b/code-interpreter'

export class E2bSandboxRuntimeAdapter implements RuntimeAdapter {
  private sandbox: CodeInterpreter | null = null

  async initialize(task: Task) {
    this.sandbox = await CodeInterpreter.create({
      apiKey: process.env.E2B_API_KEY!,
      metadata: { taskId: task.id },
    })
  }

  async runCode(code: string, language: 'python' | 'bash' | 'js') {
    if (!this.sandbox) throw new Error('Sandbox not initialized')
    const exec = await this.sandbox.notebook.execCell(code)
    return { stdout: exec.logs.stdout, stderr: exec.logs.stderr, results: exec.results }
  }

  async writeFile(path: string, content: string) {
    await this.sandbox?.filesystem.write(path, content)
  }

  async readFile(path: string) {
    return this.sandbox?.filesystem.read(path)
  }

  async listFiles(dir = '/home/user') {
    return this.sandbox?.filesystem.list(dir)
  }

  async getPreviewUrl() {
    // e2b provides a hosted URL for HTTP servers started in the sandbox
    return this.sandbox?.getHostname(3000)
  }

  async destroy() {
    await this.sandbox?.close()
  }
}
```

**Provider registration**: Add `'e2b'` to `Task['provider']` type and `RuntimeReadiness` providers list when `E2B_API_KEY` is set.

**Sandbox preview URL**: When the agent starts an HTTP server (e.g. builds a React app with `npm start`), `getPreviewUrl()` returns a public URL. Surface this in the workspace iframe immediately — this replaces the "Building workspace" spinner with a live preview.

---

## P3-07: Multi-tenancy Scaffolding

This is scoped for future. Add the data model now so it doesn't require migrations later.

**Schema additions** (to `server/db/schema.ts`):
```ts
export const orgs = pgTable('orgs', {
  id: text('id').primaryKey().$defaultFn(() => `org_${nanoid(12)}`),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const orgMembers = pgTable('org_members', {
  orgId: text('org_id').references(() => orgs.id).notNull(),
  userId: text('user_id').notNull(), // FK to better-auth users
  role: text('role', { enum: ['owner', 'member'] }).default('member').notNull(),
})
```

Add `orgId` (nullable) to `tasks` and `projects`. When null, task is personal (scoped to `userId`). When set, task is shared within org.

Sidebar project switcher (future): shows personal projects + org projects.

---

## Test Plan

1. `docker-compose up` → Postgres starts → API starts → visit `http://localhost:4311` → app loads
2. Enter email → receive OTP → enter OTP → signed in → see correct name in sidebar
3. Create task → Claude responds → refresh page → conversation still there, scoped to that user
4. Log in as a different email → see empty conversation list (isolation works)
5. Deploy to Railway → `curl https://onevibe.yourdomain.com/api/runtime` → `{"providers":[...]}`
6. Create task on deployed app → e2b sandbox spins up → file appears in workspace
7. `npm run check` → green
