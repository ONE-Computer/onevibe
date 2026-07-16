# ONEVibe — Cloud-Grade Transformation TODO

> **North star**: ONEVibe should be the cloud-native equivalent of [OpenWork](https://github.com/different-ai/openwork) — a production AI workspace running fully in the cloud, with real agent execution, real sandboxes, real auth, and a professional UI. OpenWork is the benchmark. Study plan is in `plan/`.
>
> **Current state**: 0.5/100. The server and agent runtime exist but the app silently fails when the backend is down, defaults to a fake demo provider, has no auth, no real sandboxes, no deploy path, and 50+ documented UX dead-ends. See `plan/00-gap-analysis.md`.
>
> **Release gate**: `npm run check` must stay green (oxlint + 207 vitest tests + tsc build + e2e harness typecheck) after every task.

---

## Phase 1 — Stop the bleeding: make the app actually work
**Target: a real Claude conversation from the default path, zero fake data, no silent failures.**
Reference: `plan/01-foundation.md`

- [ ] **P1-01** Fix backend-down silent failure — when `/api/runtime` 404s or returns HTML, show a persistent "Backend offline — run `npm run dev`" banner instead of blank app
- [ ] **P1-02** Fix `useTask.ts` event drop — buffer SSE events that arrive before initial REST snapshot; replay them after snapshot loads (`plan/01-foundation.md#sse-event-drop`)
- [ ] **P1-03** Add SSE reconnection backoff — replace infinite hammer-on-failure with exponential backoff (500ms → 1s → 2s → 4s → 8s) capped at 5 retries, then show "Connection lost" with manual retry button
- [ ] **P1-04** Fix default provider — detect `ANTHROPIC_API_KEY` via `/api/runtime` response; if `claude_sdk` is available, default to it; if not, show onboarding wall explaining what env var is needed
- [ ] **P1-05** Fix `npm run dev` startup DX — add a `scripts/dev-check.ts` that validates env before starting; print clear error if `ANTHROPIC_API_KEY` is missing
- [ ] **P1-06** Fix `server/index.ts` static file serving — serve `dist/` for non-API routes so the app is self-deployable without a separate static host
- [ ] **P1-07** Add API error types — replace plain `Error(message)` in `src/lib/api.ts:32` with a typed `ApiError` class carrying `status: number` and `code: string`; update all callers
- [ ] **P1-08** Fix demo-mode labelling — add a permanent, prominent "SIMULATION — no model call" banner to the conversation pane when `provider === 'demo'`; current chip is invisible

---

## Phase 2 — Real agent runtime
**Target: Claude writes a file to disk; it appears in the workspace panel.**
Reference: `plan/02-agent-runtime.md`

- [ ] **P2-01** Wire tool execution — `server/claude-sdk-runner.ts` must pass a real `workingDir` per task and surface tool outputs (file writes, bash output) as events
- [ ] **P2-02** Implement delta coalescing — buffer SSE token deltas per animation frame in `useTask.ts`, not per event; prevents per-token re-renders on long responses (see OpenWork `session-sync.ts`)
- [ ] **P2-03** Add draft queuing — when agent is `running`, composer should accept a draft and show "Will send when agent is ready"; drain on idle (see OpenWork `handleQueue`)
- [ ] **P2-04** Add fork/edit-message — click any user message → edit → creates a new conversation branch; requires a `/api/tasks/:id/fork` endpoint and frontend branch navigation
- [ ] **P2-05** Fix `waiting_for_user_input` UX — `isRunning` must be `false` in this state; header must say "Waiting for your input", not "Writing…"; `UserInputCard` must be prominent above composer
- [ ] **P2-06** Implement real workspace file browser — after each agent turn, poll `/api/tasks/:id/files` and display real generated files in the workspace panel with open/download; replace the "Building workspace" forever-spinner
- [ ] **P2-07** Add proper permission approval panel — render `task.inputRequest` and `task.approval` as mid-conversation panels above the composer (not modals), matching OpenWork's `PermissionApprovalPanel` pattern

---

## Phase 3 — Cloud architecture
**Target: `https://onevibe.yourdomain.com` — deployed, authenticated, persistent.**
Reference: `plan/03-cloud-architecture.md`

- [ ] **P3-01** Add auth — integrate `better-auth` with email OTP; add `/api/auth/*` routes; protect all `/api/*` routes with session middleware; add login page
- [ ] **P3-02** Add user identity — replace hardcoded `"Terence"` / `TT` throughout with `currentUser` from auth session; propagate to sidebar, workspace header, task ownership
- [ ] **P3-03** Migrate database — replace `better-sqlite3` in-process SQLite with **PostgreSQL via Drizzle ORM** (`drizzle-orm` + `postgres` driver + `drizzle-kit`); update `server/store.ts` and `server/persistence/`
- [ ] **P3-04** Containerise — write `Dockerfile` (multi-stage: build + runtime) and `docker-compose.yml` (postgres + api + vite-preview); add `.env.example` with all required vars
- [ ] **P3-05** Deploy to Railway or Fly.io — write `railway.toml` or `fly.toml`; document the full deploy in `plan/03-cloud-architecture.md#deploy`
- [ ] **P3-06** Add cloud sandbox — integrate **e2b.dev** (`@e2b/code-interpreter`) as the default execution sandbox for `general` / `app` / `website` task modes; each task gets an isolated cloud VM; surface the sandbox preview URL in the workspace iframe
- [ ] **P3-07** Add multi-tenancy scaffolding — `org` and `project` tables in Postgres; tasks scoped to org; sidebar project switcher drives real data isolation

---

## Phase 4 — Professional UI
**Target: no hardcoded strings, no dead controls, no missing states; UI matches OpenWork quality.**
Reference: `plan/04-ui-overhaul.md`

- [ ] **P4-01** Migrate state management — replace `useState` cascade in `App.tsx` (17 useState calls) with **Zustand** stores: `useUiStore`, `useSessionStore`, `useComposerStore`; model after OpenWork's store split
- [ ] **P4-02** Adopt TanStack Query — replace manual `useCallback` + `useEffect` data fetching for conversations, tasks, library, schedules with `useQuery` / `useMutation`; proper loading / error / empty states everywhere
- [ ] **P4-03** Add toast system — single `ToastProvider` + `useToast()` hook; wire all 12 swallowed async errors across Sidebar, Schedules, Library, Workspace
- [ ] **P4-04** Fix all dead controls — `<Settings2>` icons in sidebar (×2), `<RefreshCw>` in workspace toolbar, hardcoded `8` skills pill; each must do something real or be removed
- [ ] **P4-05** Fix hardcoded identity — remove `"Terence"`, `TT`, `"Local workspace"`, `local.onevibe.dev` from all components; replace with auth context values
- [ ] **P4-06** Add schedule delete — add DELETE endpoint + trash icon per schedule row with confirm dialog
- [ ] **P4-07** Add library item delete — add DELETE endpoint + remove action per library card
- [ ] **P4-08** Add history restore confirmation — confirm dialog before `restoreVersion()`; show loading state during restore; toast on success/failure
- [ ] **P4-09** Fix evidence log truncation — replace `task.events.slice(-6)` with paginated view; show "View all N events" expand affordance
- [ ] **P4-10** Fix task project display — replace raw UUID in Settings tab with project name from `projects` prop
- [ ] **P4-11** Fix all `<time>` elements — add `dateTime` attribute everywhere; show date+time not just time
- [ ] **P4-12** Fix skills cap UX — disable (not silently ignore) toggle for 5th skill; show tooltip "Max 4 skills selected"
- [ ] **P4-13** Fix status badge labels — replace raw `task.status.replaceAll('_', ' ')` with a proper `statusLabel(status)` map with capitalised human labels
- [ ] **P4-14** Fix provider label consistency — unify "Safe demo" / "Simulation · no model call" across Schedules and Sidebar into one canonical `providerLabel(id)` function
- [ ] **P4-15** Add conversation search UI — wire `src/lib/api.ts:153` `searchChat` to a real search input in the sidebar (the API already supports `?q=`)
- [ ] **P4-16** Fix working trace expand affordance — add chevron icon to `<details>` summary; open by default for `running` traces
- [ ] **P4-17** Fix `brand-mark.svg` broken image — add `onError` handler; hide `<img>` if file doesn't exist
- [ ] **P4-18** Fix double typing indicator — `AssistantThread.tsx:72` renders a second typing animation unconditionally during streaming; remove the duplicate
- [ ] **P4-19** Fix file size display — use the existing `readableBytes` helper consistently; a 500-byte file should not show as "1 KB"
- [ ] **P4-20** Fix `index.html` null-guard — add `?.content` on `document.querySelector('meta[name="theme-color"]')` to prevent theme crash on CSP-stripped meta

---

## Phase 5 — MCP + Extensions
**Target: users can add MCP servers; ONEVibe gains access to real external tools.**
Reference: `plan/05-mcp-extensions.md`

- [ ] **P5-01** Add MCP config management — UI to add/remove MCP servers (name, command, env vars); store in `runtime_mcp_configs` table in Postgres (not on-disk JSON); inject into agent on task creation
- [ ] **P5-02** Add skill marketplace — fetch skill catalog from a GitHub-backed JSON manifest (copy OpenWork's `skill-hub.ts` pattern); display in SkillsLibrary with install/remove
- [ ] **P5-03** Add two-tool MCP facade — for cloud agent runs, expose `search_capabilities` + `execute_capability` tools to Claude rather than the full raw MCP surface (reduces context waste; see OpenWork `ee/apps/den-api/src/mcp/agent.ts`)
- [ ] **P5-04** Add agent context diagnostics — health check endpoint that validates: API key configured → agent reachable → MCP servers registered → sandbox reachable; surface as a status panel in Settings

---

## Ongoing / Non-blocking

- [ ] **ONG-01** All 50 issues from `plan/00-gap-analysis.md` — track each to resolution
- [ ] **ONG-02** `npm run check` green after every task — no task is done until lint + tests + build + e2e harness typecheck pass
- [ ] **ONG-03** Architecture doc — keep `ARCHITECTURE.md` current; every structural change gets a doc update in the same commit
- [ ] **ONG-04** Evidence screenshots — after each phase, take 5-view desktop+mobile evidence screenshots into `docs/evidence/`

---

## Done (prior work)

- [x] IBM Plex Mono / monospace purge
- [x] Light-mode default + Claude-calibrated palette
- [x] Claude-style composer + home hero
- [x] Sidebar restraint
- [x] Typography calibration
- [x] UX overhaul Phases 1–15 (cosmetic; functional issues remain)
