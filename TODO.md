# ONEVibe — Cloud Workspace Transformation TODO

> **What ONEVibe is**: A cloud-native AI workspace that is a **provider-neutral meta-layer** above agent harnesses. Users pick which harness runs their task — Claude Agent SDK, OpenAI Codex, AWS Bedrock AgentCore, OpenCode, or any future runtime. ONEVibe provides everything above the harness: conversation history, artifact storage, workspace files, approval governance, MCP routing, team management, and a professional UI. The harness is a pluggable detail. ONEVibe is not.
>
> **What ONEVibe is not**: A wrapper around a single SDK. OpenWork locked onto OpenCode. We do not lock onto anything. Harnesses will always improve. Our users must be free to use the best one at any time.
>
> **The abstraction that matters**: `server/runtime-adapter.ts` — the `RuntimeAdapter` interface. Every harness is an implementation. Strengthen this boundary. Never leak harness-specific concepts into the UI or data model.
>
> **Current state**: The local-first foundation is substantially implemented: backend-offline recovery, truthful simulation labelling, durable SSE replay/reconnect, LiteLLM-only routing, provider-neutral runtime lifecycle, runtime health/routing, task workspaces, durable guidance queueing, and assistant-ui conversation rendering are in place. Remaining release blockers are conversation branching, auth/persistence/deployment, sandboxed execution, MCP/skills integration, and the remaining professional-UI dead ends. See `HANDOVER.md` and `plan/00-gap-analysis.md`.
>
> **Release gate**: `npm run check` must stay green (oxlint + 225 vitest tests + tsc build + e2e harness typecheck) after every task.

> **Current handover policy**: all model traffic must traverse the protected LiteLLM boundary. Direct first-party Anthropic API traffic is prohibited, not a fallback. The Claude SDK configuration now fails closed unless the server-controlled relay is configured; Codex/AgentCore remain blocked until their adapters also use the same boundary.

---

## Phase 1 — Stop the bleeding: make the app actually work
**Target: a real Claude conversation from the default path. Zero fake data. No silent failures.**
Reference: `plan/01-foundation.md`

- [x] **P1-01** Fix backend-down silent failure — when `/api/runtime` 404s or returns HTML, show a persistent "Backend offline — run `npm run dev`" banner instead of blank app
- [x] **P1-02** Fix `useTask.ts` event drop — buffer SSE events that arrive before initial REST snapshot; replay them after snapshot loads
- [x] **P1-03** Add SSE reconnection backoff — replace infinite hammer-on-failure with exponential backoff (500ms → 1s → 2s → 4s → 8s) capped at 5 retries, then show "Connection lost" with manual retry button
- [x] **P1-04** Fix default provider — detect which runtimes are available via `/api/runtime`; auto-select the best available; show onboarding wall when none are configured
- [x] **P1-05** Fix `npm run dev` startup DX — `scripts/dev-check.ts` validates env vars before starting; clear error if no runtime is configured
- [x] **P1-06** Fix `server/index.ts` static file serving — serve `dist/` for non-API routes so the app is self-deployable without a separate static host
- [x] **P1-07** Add API error types — replace plain `Error(message)` in `src/lib/api.ts:32` with a typed `ApiError` class carrying `status: number` and `code: string`
- [x] **P1-08** Fix demo-mode labelling — permanent "SIMULATION — no model call" banner in conversation pane when `provider === 'demo'`; current chip is invisible

---

## Phase 2 — Harden the runtime abstraction
**Target: `RuntimeAdapter` is airtight. Adding a new harness takes one new file. No harness concepts leak into UI or data.**
Reference: `plan/02-runtime-abstraction.md`

- [x] **P2-01** Audit and harden `RuntimeAdapter` interface — canonical lifecycle contract (`initialize`, `run(prompt, context, signal)` → AsyncIterator of persisted `RuntimeEvent`, `cancel`, `getFiles`, `getPreviewUrl`, `destroy`) is implemented by every adapter through the provider-neutral lifecycle base; the append-only store remains the event authority while provider execution migrates to the boundary
- [x] **P2-02** Add Codex-compatible adapter — implement a LiteLLM-routed `CodexRuntimeAdapter` with bounded workspace read/write tools; register as provider `'codex'`; expose only when the protected LiteLLM relay is configured. It deliberately does not claim sandbox isolation until a sandboxed Codex runtime is proven.
- [x] **P2-03** Add AgentCore remote adapter — implement `AgentCoreRuntimeAdapter` over the governed AgentCore SSE endpoint; register as provider `'agentcore'`; expose only when the endpoint explicitly declares LiteLLM-routed model traffic. AWS/Bedrock credentials are never copied into ONEVibe or a retained sandbox; live AgentCore and isolation acceptance remain open.
- [x] **P2-04** Add runtime capability declaration — each `RuntimeAdapter` declares `capabilities: RuntimeCapability[]` (e.g. `'streaming'`, `'tool_use'`, `'file_system'`, `'sandboxed'`, `'computer_use'`); UI uses this to show/hide tabs in the workspace panel
- [x] **P2-05** Add per-task working directory — the lifecycle initializer creates and passes each task's isolated `workingDir`; adapter file hooks and `/api/tasks/:id/files` read the same path-confined workspace, eliminating the stale workspace-spinner contract
- [x] **P2-06** Implement delta coalescing — `useTask.ts` batches live SSE event state updates per animation frame while preserving every durable event ID/content for replay and evidence
- [x] **P2-07** Add draft queuing — when agent is `running`, composer accepts a draft and shows "Will send when ready"; drains automatically on idle
- [x] **P2-08** Add fork/edit-message — click any user message → edit → creates a new conversation branch via `POST /api/tasks/:id/fork`; the branch copies the path-confined workspace, truncates history before the selected user message, preserves parent lineage, and starts a new provider turn
- [x] **P2-09** Fix `waiting_for_user_input` UX — assistant-ui `isRunning` is false in this state, the composer is disabled with an explicit waiting label, and `UserInputCard` is rendered above it
- [x] **P2-10** Add proper permission approval panel — `task.approval` is rendered by the task timeline above the assistant composer, while the separate wallet remains the decision authority

---

## Phase 3 — Runtime routing layer
**Target: the UI surfaces harness selection as a first-class choice; the right harness is suggested for each task mode; switching runtimes mid-session is possible.**
Reference: `plan/03-runtime-routing.md`

- [x] **P3-01** Build `RuntimeRegistry` — server-side registry discovers all registered adapters, warms configured-provider health on API startup, retains bounded health status/latency timestamps, and exposes `/api/runtime` with capability metadata without provider secrets
- [x] **P3-02** Build runtime routing suggestions — `RuntimeRegistry.suggest(mode)` returns a ranked, capability-based list with availability, compatibility, missing-capability explanation, and a human-readable reason; `/api/runtime` exposes the suggestions without provider secrets
- [x] **P3-03** Overhaul provider picker UI — the composer now ranks runtimes for the selected mode, shows availability/recommendation/capability badges and suitability reasons, and disables incompatible choices
- [x] **P3-04** Add runtime health dashboard — the Computers → Runtimes surface shows every registered adapter, status (online/offline/not configured/unknown), bounded detail/latency, and a Test button backed by `POST /api/runtime/test/:provider`; probes never expose credentials or provider response bodies
- [x] **P3-05** Add runtime fallback chain — provider failures now expose an explicit compatible-runtime suggestion; retry accepts a user-selected provider and records the boundary switch, never silently substituting a harness
- [x] **P3-06** Add `ONEVIBE_DEFAULT_PROVIDER` env var — operators can set the default runtime for their deployment; the registry honors it only when available/compatible and safely falls back; individual users can override per task
- [x] **P3-07** Runtime-neutral event schema — canonical `EventType`/`EventLane`/`RuntimeEvent` fields are provider-neutral; harness-specific model/tool/native metadata is confined to bounded `payload` or the sanitized native envelope

---

## Phase 4 — Cloud infrastructure
**Target: `https://onevibe.yourdomain.com` — deployed, authenticated, persistent, multi-user.**
Reference: `plan/04-cloud-infrastructure.md`

- [ ] **P4-01** Add auth — integrate `better-auth` with email OTP; protect all `/api/*` routes with session middleware; add login page; replace hardcoded `"Terence"` with real user identity
- [ ] **P4-02** Migrate database — replace in-process SQLite with **PostgreSQL via Drizzle ORM**; add `userId` foreign key to tasks, projects, schedules; multi-user isolation
- [ ] **P4-03** Containerise — `Dockerfile` (multi-stage build + runtime), `docker-compose.yml` (postgres + api), `.env.example` with all required vars documented
- [ ] **P4-04** Deploy to Railway or Fly.io — `railway.toml` or `fly.toml`; deploy instructions in `plan/04-cloud-infrastructure.md#deploy`
- [ ] **P4-05** Add cloud sandbox — integrate **e2b.dev** (`@e2b/code-interpreter`) as the default `sandboxed` execution backend; surface sandbox preview URL in workspace iframe; `E2bRuntimeAdapter` wraps e2b and implements the full `RuntimeAdapter` interface
- [ ] **P4-06** Add multi-tenancy scaffolding — `orgs` and `org_members` tables; tasks scoped to org when `orgId` set; sidebar project switcher drives real data isolation

---

## Phase 5 — Professional UI
**Target: no hardcoded strings, no dead controls, no swallowed errors; state management is Zustand + TanStack Query.**
Reference: `plan/05-ui-overhaul.md`

- [ ] **P5-01** Migrate state management — replace 17 `useState` calls in `App.tsx` with Zustand stores: `useUiStore`, `useComposerStore`, `useSessionStore`
- [ ] **P5-02** Adopt TanStack Query — replace all `useCallback` + `useEffect` data fetching with `useQuery` / `useMutation`; proper loading / error / empty states everywhere
- [ ] **P5-03** Add toast system — `sonner` library; wire all 12 currently-swallowed async errors
- [ ] **P5-04** Fix all dead controls — `<Settings2>` icons ×2, `<RefreshCw>` toolbar button, hardcoded `8` skills pill
- [ ] **P5-05** Add conversation search UI — wire `searchChat` (already in `api.ts:153`) to a real sidebar search input
- [ ] **P5-06** Add schedule delete — `DELETE /api/schedules/:id` + trash icon + confirm dialog
- [ ] **P5-07** Add library item delete — `DELETE /api/library/:taskId` + remove action
- [ ] **P5-08** Add history restore confirmation — confirm dialog + loading state + toast
- [ ] **P5-09** Fix evidence log — replace `slice(-6)` with paginated "Show all N events" affordance
- [ ] **P5-10** Fix status labels — `statusLabel(status)` canonical map; `providerLabel(id)` canonical map; replace all raw enum rendering
- [ ] **P5-11** Fix accessibility — `<time dateTime>` everywhere, `readableBytes` helper consistently, `alt` text on images, `<time>` null-guard in `index.html`
- [ ] **P5-12** Fix working trace — chevron on `<details>`, open by default when running, 240-char truncation replaced with expand link
- [ ] **P5-13** Finish composer UX — disable 5th skill toggle + tooltip; remove duplicate typing indicator (the `waiting_for_user_input` running-state defect is closed under P2-09)

---

## Phase 6 — MCP + extensions
**Target: users add MCP servers; ONEVibe routes tool calls through them; skill marketplace works.**
Reference: `plan/06-mcp-extensions.md`

- [ ] **P6-01** Add MCP config management — UI to add/remove MCP servers; store in `runtime_mcp_configs` table (not on-disk JSON); inject into any adapter that supports `'tool_use'` capability
- [ ] **P6-02** Add skill marketplace — GitHub-backed catalog; install/remove from SkillsLibrary; inject as system-prompt blocks per task
- [ ] **P6-03** Add two-tool MCP facade — `search_capabilities` + `execute_capability`; reduces context waste for agents with many MCP servers
- [ ] **P6-04** Add agent context diagnostics — `/api/diagnostics` health check; surface as status panel: API key → runtime reachable → sandbox → MCP servers

---

## Ongoing

- [ ] **ONG-01** All 50 UX issues from `plan/00-gap-analysis.md` — track each to resolution
- [ ] **ONG-02** `npm run check` green after every task
- [ ] **ONG-03** `ARCHITECTURE.md` updated in the same commit as every structural change
- [ ] **ONG-04** Evidence screenshots — 5-view desktop + mobile after each phase

---

## Done (prior work)

- [x] IBM Plex Mono / monospace purge
- [x] Light-mode default + Claude-calibrated palette (Phases 11–15)
- [x] Claude-style composer, home hero, sidebar restraint, typography calibration
- [x] UX overhaul Phases 1–15 (cosmetic; functional issues remain)
