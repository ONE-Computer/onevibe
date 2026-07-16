# Gap Analysis: ONEVibe vs OpenWork

> Prepared 2026-07-16. Source: deep subagent audit of `/tmp/openwork` + full ONEVibe source audit.

---

## What OpenWork Is

OpenWork is a local-first AI workspace desktop app (Electron 35) that:
1. Spawns `@opencode-ai/sdk` as a real agent subprocess (the engine owns LLM calls, tool execution, session state)
2. Runs agent tasks inside Daytona cloud VMs or Docker containers — **real sandboxes, real file systems**
3. Manages MCP servers in SQLite at runtime; injects them into the agent engine per-session
4. Has a full enterprise control plane ("Den"): better-auth (OTP + OAuth + SCIM + SSO), MySQL (PlanetScale), inference proxy, usage metering, Stripe billing, multi-tenancy
5. Exports a marketplace of skills (markdown SKILL.md files from GitHub), two-tool MCP facade, blueprint sessions, fork/revert/edit-message

## What ONEVibe Is Today

ONEVibe is a React SPA (`src/`) backed by a hand-rolled Node.js HTTP server (`server/index.ts`, 745 lines). The server:
- Runs on port 4311; Vite proxies `/api/*` to it
- Has real adapter classes: `ClaudeSdkRuntimeAdapter`, `OneComputerSandboxRuntimeAdapter`, `DemoRuntimeAdapter`
- Persists tasks to SQLite via `server/store.ts` + `server/persistence/`
- Streams events via SSE

**The server is real. The adapters are real. The problem is integration, deployment, and UX.**

---

## The 10 Root Causes

### 1. Default provider is `demo`
`server/index.ts` and `PromptComposer.tsx` both default to `'demo'`. `DemoRuntimeAdapter` makes zero model calls. Every new user gets a fake scripted response. **Fix: default to `claude_sdk` when `ANTHROPIC_API_KEY` is set.**

### 2. Backend down = silent white screen
When `server/index.ts` isn't running, Vite's dev server returns `index.html` for all `/api/*` requests. `api.ts:32` calls `response.json()` on HTML → `SyntaxError` → error swallowed → blank app. No banner, no explanation. **Fix: detect backend down, show persistent error.**

### 3. SSE event drop bug (`useTask.ts`)
Events arriving before the initial REST `getTask()` snapshot completes are added to `seen` but `setSnapshot` is a no-op because `current` is `null`. Those events are **permanently lost**. Early streaming content vanishes. **Fix: buffer pre-snapshot events; replay after snapshot.**

### 4. SSE reconnection hammers a dead server
`stream.onerror` fires → sets error → no retry limit → browser hammers indefinitely. **Fix: exponential backoff with cap.**

### 5. No auth, no user identity
No user concept. Sidebar hardcodes `"Terence"` and `TT`. All tasks belong to everyone. No deploy path supports multi-user. **Fix: better-auth with email OTP.**

### 6. No real sandbox
`ClaudeSdkRuntimeAdapter` calls the Anthropic SDK but there is no process isolation, no per-task working directory, no file system visible from the workspace panel. Tools run in the server process. **Fix: e2b.dev sandbox per task.**

### 7. No deploy path
`server/index.ts` does not serve `dist/`. No Dockerfile. No `docker-compose.yml`. No `.env.example`. No Railway/Fly config. The app cannot run in production. **Fix: containerise + deploy.**

### 8. No PostgreSQL / cloud DB
SQLite in `server/persistence/` is a local file. No multi-user, no cloud. **Fix: Drizzle + Postgres.**

### 9. 50 UX dead-ends
Documented in detail below. Dead controls, hardcoded strings, swallowed errors, missing empty states, broken status labels. See `TODO.md` Phase 4.

### 10. No MCP
No ability to extend the agent with external tools. No marketplace. **Fix: Phase 5.**

---

## Full 50-Issue Audit

Issues ranked by severity. `file:line` references are approximate — read actual files.

### Critical (app non-functional)

| # | File | Issue |
|---|---|---|
| 1 | `src/lib/api.ts:32` | Backend down → HTML body → `JSON.parse` throws → silent blank app |
| 2 | `index.html:24` | `document.querySelector('meta[name="theme-color"]').content` crashes if meta missing |
| 3 | `src/hooks/useTask.ts:52` | SSE events before snapshot drop permanently (null `current` guard) |
| 4 | `src/hooks/useTask.ts:32` | SSE reconnection: no backoff, no cap, hammers dead server indefinitely |
| 5 | `src/hooks/useTask.ts:42` | Race: `onopen` + initial `scheduler.run()` fire concurrently → stale snapshot clobber |
| 6 | `src/App.tsx:48` | Default provider `'demo'` → zero model calls → user gets fake data |
| 7 | `server/index.ts` | Does not serve `dist/` — app cannot be deployed standalone |
| 8 | `src/lib/api.ts:32` | All errors thrown as plain `Error(string)` — no `status` code — callers cannot classify |

### High (major UX dead-ends)

| # | File | Issue |
|---|---|---|
| 9 | `src/components/Sidebar.tsx:174` | `"Terence"` + `TT` + `"Local workspace"` hardcoded |
| 10 | `src/components/Sidebar.tsx:137` | Skills pill badge is hardcoded `8` |
| 11 | `src/components/Sidebar.tsx:146` | `<Settings2>` icon — no handler, no role, looks interactive |
| 12 | `src/components/Sidebar.tsx:174` | Footer `<Settings2>` — same |
| 13 | `src/components/Schedules.tsx` | No delete action on schedule rows |
| 14 | `src/components/Library.tsx` | No delete/archive on library items |
| 15 | `src/components/Workspace.tsx:256` | History restore fires immediately, no confirm, no loading state |
| 16 | `src/components/Sidebar.tsx` | Project file remove fires immediately, no confirm |
| 17 | `src/components/Workspace.tsx:225` | Completed task with no `previewPath` → "Building workspace" spinner forever |
| 18 | `src/components/AssistantThread.tsx:57` | Working trace: no expand affordance, no chevron |
| 19 | `src/App.tsx` | `task.inputRequest` disables send button with zero explanation |
| 20 | `src/components/Workspace.tsx:263` | "Integrity failure" — no remediation copy, total dead end |

### High (fake / misleading data)

| # | File | Issue |
|---|---|---|
| 21 | `src/components/Workspace.tsx:216` | `local.onevibe.dev` hardcoded in workspace meta |
| 22 | `src/components/Workspace.tsx:265` | Evidence log shows only last 6 events (`slice(-6)`), no "view all" |
| 23 | `src/components/Workspace.tsx:279` | Project shown as raw UUID, not name |
| 24 | `src/components/AssistantThread.tsx:196` | "Durably queued" copy shown for `demo` provider — false claim |
| 25 | `src/components/Workspace.tsx:226` | `speakerNotes` regex silently returns nothing on non-standard headings |
| 26 | `src/components/Workspace.tsx:229` | `brand-mark.svg` always renders — broken image if file doesn't exist |
| 27 | `src/App.tsx:232` | Notifications shown as fake notification objects from `task.flatMap()` with no backend push |

### Medium (missing functionality)

| # | File | Issue |
|---|---|---|
| 28 | `src/components/` (all) | No toast/notification system — all async failures silently swallowed |
| 29 | `src/components/Sidebar.tsx` | `searchChat` exists in `api.ts:153` but no search UI |
| 30 | `src/components/Workspace.tsx:230` | Data tab: 500-row cap, case-sensitive filter, no export |
| 31 | `src/components/Workspace.tsx:218` | File timestamps: `toLocaleTimeString()` drops date |
| 32 | `src/components/Workspace.tsx:239` | Code tab: no empty state when `files` is empty |
| 33 | `src/components/Workspace.tsx:217` | `save()` has no try/catch, no loading state, no error display |
| 34 | `src/components/Workspace.tsx:234` | Visual/X11 poll runs unconditionally — no `visibilitychange` pause |
| 35 | `src/components/Workspace.tsx:231` | Asset `alt={file.path}` — raw path is not accessible alt text |
| 36 | `src/components/SkillsLibrary.tsx` | 5th skill click silently does nothing — no disabled state, no tooltip |
| 37 | `src/components/Schedules.tsx` | `onToggle`/`onRunNow`: no loading state, rapid clicks queue duplicates |
| 38 | `src/components/Schedules.tsx` | Project create form: no `isSubmitting` guard |
| 39 | `src/components/Sidebar.tsx:96` | File > 256KB silently dropped — no user feedback |
| 40 | `src/components/Sidebar.tsx:107` | Search: query 1-char leaves stale `searchResults` |

### Medium (interaction quality)

| # | File | Issue |
|---|---|---|
| 41 | `src/components/AssistantThread.tsx:37` | `isRunning` true during `waiting_for_user_input` → "Writing…" header wrong |
| 42 | `src/components/AssistantThread.tsx:72` | Duplicate typing indicator rendered during streaming |
| 43 | `src/components/Workspace.tsx:219` | Plan progress shows `0 / 0` with no empty-state message |
| 44 | `src/components/Workspace.tsx:279` | Tags: `maxLength={264}` unrelated to 8-tag limit; no success confirm |
| 45 | `src/components/Sidebar.tsx:164` | `role === 'user' ? 'You' : 'ONEVibe'` — hardcoded product name as sender |

### Medium (terminology)

| # | File | Issue |
|---|---|---|
| 46 | `src/components/Schedules.tsx` | `'demo'` → `'Safe demo'` vs Sidebar `'Simulation · no model call'` — same provider, two names |
| 47 | `src/components/` (all) | `task.status.replaceAll('_', ' ')` — raw machine state shown to users |
| 48 | `src/components/AssistantThread.tsx:57` | Trace detail truncated at 240 chars, no "show more" |

### Lower (accessibility / polish)

| # | File | Issue |
|---|---|---|
| 49 | multiple | `<time>` elements lack `dateTime` attribute throughout |
| 50 | `src/components/AssistantThread.tsx:32` | File sizes: `Math.ceil(size/1024) KB` even for sub-1KB files; `readableBytes` helper exists but not used consistently |

---

## OpenWork Key Files to Study Before Each Phase

| Phase | Files to read in `/tmp/openwork` |
|---|---|
| P1 Foundation | `apps/app/src/sync/session-sync.ts`, `apps/server/src/server.ts` |
| P2 Agent | `apps/server/src/opencode-plugins/`, `apps/app/src/sync/transcript-reconcile.ts`, `apps/app/src/components/chat/composer/composer.tsx` |
| P3 Cloud | `ee/apps/den-api/src/auth.ts`, `ee/packages/den-db/src/schema/`, `ee/apps/den-worker-proxy/src/app.ts` |
| P4 UI | `apps/app/src/stores/`, `apps/app/src/components/session/`, `apps/app/src/components/artifact/` |
| P5 MCP | `apps/server/src/mcp.ts`, `apps/server/src/skill-hub.ts`, `ee/apps/den-api/src/mcp/agent.ts` |
