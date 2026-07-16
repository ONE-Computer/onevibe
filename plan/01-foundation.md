# Phase 1 — Foundation: Make the App Actually Work

> **Goal**: A real Claude conversation from the default path. Zero fake data. No silent failures.
> **Exit criterion**: Type "What is 2+2?" with Claude SDK selected → get a real Claude response. Backend offline → visible banner, not blank screen.
> **Tasks**: P1-01 through P1-08 in `TODO.md`

---

## Context

`npm run dev` correctly starts both processes (`dev:api` on port 4311, `dev:web` on 5173). Vite proxies `/api/*`. The server and adapters are real. The problems are:
1. Silent failure when backend is down
2. SSE event drop before snapshot loads
3. No backoff on reconnect
4. `demo` is the default provider
5. No deploy path

This phase fixes all five without any architectural rewrites. These are targeted patches.

---

## P1-01: Backend-down Banner

**File**: `src/hooks/useTask.ts`, `src/App.tsx`, `src/lib/api.ts`

**Problem**: When `server/index.ts` is not running, Vite's SPA fallback serves `index.html` for `/api/*`. `response.json()` on HTML throws `SyntaxError`. The error propagates up via `parse()` in `api.ts:32`, hits `.catch(() => undefined)` in `App.tsx` `useEffect` chains, and is swallowed. The app renders blank.

**Fix**:
1. In `src/lib/api.ts`, modify `parse()` to detect HTML responses:
```ts
const parse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok && contentType.includes('text/html')) {
    throw new ApiError('Backend offline', 503, 'backend_offline')
  }
  // ...existing logic
}
```
2. Add `ApiError` class:
```ts
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message)
    this.name = 'ApiError'
  }
}
```
3. In `App.tsx`, add a top-level `backendOffline` state. In the `getRuntimeReadiness` `useEffect`, catch `ApiError` with `code === 'backend_offline'` and set it.
4. Render a persistent banner above `<main>` when `backendOffline`:
```tsx
{backendOffline && (
  <div className="backend-offline-banner" role="alert">
    Backend offline — run <code>npm run dev</code> in the project root.
    <button onClick={() => void getRuntimeReadiness().then(setRuntime).then(() => setBackendOffline(false)).catch(() => undefined)}>
      Retry
    </button>
  </div>
)}
```

---

## P1-02: SSE Event Drop Fix {#sse-event-drop}

**File**: `src/hooks/useTask.ts`

**Problem**: Lines 49-52. When a `runtime_event` SSE arrives, `setSnapshot` is called with `current => { if (!current) return current }`. If the initial `getTask()` REST call hasn't resolved yet, `current` is `null` and the event is permanently lost.

**Fix**: Add an event buffer ref:
```ts
const pendingEvents = useRef<RuntimeEvent[]>([])

// In the SSE message handler (line ~50):
setSnapshot(current => {
  if (!current) {
    // Buffer the event; it will be applied once the snapshot arrives
    pendingEvents.current.push(newEvent)
    return current
  }
  return applyEventToSnapshot(current, newEvent)
})

// In the initial getTask() .then() handler, after setSnapshot(data):
setSnapshot(current => {
  if (!current || !pendingEvents.current.length) return current
  let result = current
  for (const event of pendingEvents.current) {
    result = applyEventToSnapshot(result, event)
  }
  pendingEvents.current = []
  return result
})
```

---

## P1-03: SSE Reconnection Backoff

**File**: `src/hooks/useTask.ts`

**Problem**: `stream.onerror` fires indefinitely with no delay between retries. Browser hammers a dead server at browser-native speed.

**Fix**: Replace the `EventSource` direct assignment with a managed reconnect helper:
```ts
const retryCount = useRef(0)
const retryTimeout = useRef<ReturnType<typeof setTimeout>>()

const connect = useCallback((taskId: string) => {
  const stream = new EventSource(`/api/tasks/${taskId}/stream`)
  // ...attach handlers...
  stream.onerror = () => {
    stream.close()
    if (retryCount.current >= 5) {
      setError('Connection lost after 5 retries. Click retry to reconnect.')
      return
    }
    const delay = Math.min(500 * 2 ** retryCount.current, 30_000)
    retryCount.current++
    retryTimeout.current = setTimeout(() => connect(taskId), delay)
  }
  stream.onopen = () => { retryCount.current = 0; setConnected(true) }
}, [])
```

---

## P1-04: Default Provider Fix

**File**: `src/App.tsx`, `src/components/PromptComposer.tsx`

**Problem**: `provider` state initialises to `'demo'` regardless of what the runtime reports. Users who have `ANTHROPIC_API_KEY` set still see demo mode until they manually change the dropdown.

**Current code** (`PromptComposer.tsx:51-55`): already has a `useEffect` that sets `claude_sdk` when `runtime` arrives and `!providerTouched`. **The problem is that `runtime` takes a network round-trip to arrive**, so the initial render always shows `demo`.

**Fix**: Pass `preferredProvider` from `App.tsx` as a prop initial value, derived from `runtime` (which is already fetched in `App.tsx:108`):
```tsx
// App.tsx:127 - preferredProvider already computed:
const preferredProvider = runtime?.providers.find(p => p.id === 'claude_sdk' && p.available)?.id ?? 'demo'
// Pass as initialProvider prop to PromptComposer
```

Also: if `claude_sdk` is unavailable AND `onecomputer` is unavailable, show a banner:
```tsx
{runtime && !runtime.providers.some(p => p.available && p.id !== 'demo') && (
  <div className="setup-banner">
    Set <code>ANTHROPIC_API_KEY</code> in your <code>.env</code> to use Claude.
    <a href="https://console.anthropic.com" target="_blank">Get a key →</a>
  </div>
)}
```

---

## P1-05: Dev Startup Check

**File**: `scripts/dev-check.ts` (new)

Create a pre-flight script that runs before the dev server:
```ts
// scripts/dev-check.ts
const missing: string[] = []
if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY')
if (missing.length) {
  console.warn('\n⚠  Missing env vars:', missing.join(', '))
  console.warn('   Copy .env.example → .env and fill them in.')
  console.warn('   Claude SDK tasks will not work without these.\n')
  // Don't exit — let the app start in demo mode with a warning
}
```

Update `package.json` scripts:
```json
"dev": "concurrently -k -n check,api,web -c yellow,green,cyan \"tsx scripts/dev-check.ts\" \"npm:dev:api\" \"npm:dev:web\""
```

Also create `.env.example` if it doesn't exist:
```
# Required for Claude SDK provider
ANTHROPIC_API_KEY=

# Optional: ONEComputer sandbox
ONECOMPUTER_API_URL=
ONECOMPUTER_SERVICE_TOKEN=
ONECOMPUTER_PROJECT_ID=

# Server port (default: 4311)
ONEVIBE_API_PORT=4311
```

---

## P1-06: Static File Serving

**File**: `server/index.ts`

**Problem**: `server/index.ts` has no static file handler. In production (`npm run build`), `dist/` exists but nothing serves it. A separate nginx/Caddy layer would be needed, which is undocumented.

**Fix**: Add static file serving before the 404 handler, after all API routes:
```ts
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

const DIST_DIR = path.resolve(import.meta.dirname, '../dist')
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json',
}

// In the request handler, add after all /api routes:
const tryStatic = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
  if (process.env.NODE_ENV !== 'production') return false
  const urlPath = new URL(req.url ?? '/', `http://localhost`).pathname
  const filePath = path.join(DIST_DIR, urlPath)
  try {
    await stat(filePath)
    const ext = extname(filePath)
    const content = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    res.end(content)
    return true
  } catch {
    // Fall through to SPA fallback
  }
  // SPA fallback: serve index.html
  try {
    const html = await readFile(path.join(DIST_DIR, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
    return true
  } catch {
    return false
  }
}
```

---

## P1-07: Typed API Errors

**File**: `src/lib/api.ts`

Replace the current `parse()` function to carry structured error info:
```ts
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
  get isBackendOffline() { return this.status === 503 && this.code === 'backend_offline' }
  get isUnauthorized() { return this.status === 401 }
  get isNotFound() { return this.status === 404 }
}

const parse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok && !contentType.includes('application/json')) {
    throw new ApiError('Backend offline or not reachable', 503, 'backend_offline')
  }
  const body = await response.json() as T & { error?: string; code?: string }
  if (!response.ok) throw new ApiError(body.error ?? `HTTP ${response.status}`, response.status, body.code ?? 'unknown')
  return body
}
```

---

## P1-08: Demo Mode Banner

**File**: `src/App.tsx`, `src/index.css`

When `snapshot?.provider === 'demo'`, render a persistent top-of-conversation banner:
```tsx
// In the conversation-pane, before AssistantThread:
{snapshot?.provider === 'demo' && (
  <div className="demo-mode-banner" role="status">
    Simulation only — no model call is made in this mode.
    <button onClick={() => { /* switch to claude_sdk if available */ }}>
      Switch to Claude
    </button>
  </div>
)}
```

CSS — banner should be impossible to miss: amber background, full width, sticky at top of conversation pane.

---

## Test Plan

After all P1 tasks:

1. Kill `dev:api`, run only `dev:web` → backend-offline banner appears within 2 seconds
2. Restart `dev:api` → click Retry → banner disappears
3. Run `npm run dev` with `ANTHROPIC_API_KEY` unset → setup banner appears
4. Run `npm run dev` with `ANTHROPIC_API_KEY` set → claude_sdk is default provider, no demo banner
5. Select demo mode manually → "Simulation only" banner appears in conversation
6. Send a message in demo mode → scripted response arrives with demo banner still visible
7. Switch to `claude_sdk`, send "What is 2+2?" → real Claude response streams in
8. `npm run build && NODE_ENV=production tsx server/index.ts` → navigate to `http://localhost:4311` → app loads from `dist/`
9. `npm run check` → all 207 tests pass, lint clean, build succeeds
