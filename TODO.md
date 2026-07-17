# ONEVibe — Cloud Workspace Transformation TODO

> **What ONEVibe is**: A cloud-native AI workspace that is a **provider-neutral meta-layer** above agent harnesses. Users pick which harness runs their task — Claude Agent SDK, OpenAI Codex, AWS Bedrock AgentCore, OpenCode, or any future runtime. ONEVibe provides everything above the harness: conversation history, artifact storage, workspace files, approval governance, MCP routing, team management, and a professional UI. The harness is a pluggable detail. ONEVibe is not.
>
> **What ONEVibe is not**: A wrapper around a single SDK. OpenWork locked onto OpenCode. We do not lock onto anything. Harnesses will always improve. Our users must be free to use the best one at any time.
>
> **The abstraction that matters**: `server/runtime-adapter.ts` — the `RuntimeAdapter` interface. Every harness is an implementation. Strengthen this boundary. Never leak harness-specific concepts into the UI or data model.
>
> **Current state**: The local-first foundation is substantially implemented: backend-offline recovery, truthful simulation labelling, durable SSE replay/reconnect, LiteLLM-only routing, provider-neutral runtime lifecycle, runtime health/routing, task workspaces, durable guidance queueing, assistant-ui conversation rendering, owner-scoped local auth, bounded MCP health/facade controls, and the initial skill marketplace boundary are in place. Remaining release blockers are live provider acceptance, Postgres/runtime deployment, sandbox attestation, production MCP secret brokering/external health attestation, document/provider/browser evidence, and the remaining professional-UI gates. See `HANDOVER.md` and `plan/00-gap-analysis.md`.
>
> **Release gate**: `npm run check` must stay green (oxlint + 259 vitest tests + tsc build + e2e harness typecheck) after every task.

> **Current handover policy**: all model traffic must traverse the protected LiteLLM boundary. Direct first-party Anthropic API traffic is prohibited, not a fallback. The Claude SDK configuration now fails closed unless the server-controlled relay is configured; Codex/AgentCore remain blocked until their adapters also use the same boundary.

> **New planning input**: `THEMING_EXTENSIBILITY.md` defines a future multi-tenant white-labeling program. It is not release-ready implementation evidence. Its customer profiles, arbitrary custom HTML, remote font loading, and dynamic theme-package loading require the security, tenancy, typography, and supply-chain constraints captured in Phase 7 below.

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
- [x] **P1-09** Make local metadata writes crash-safe — task/project/schedule/workspace-version JSON now uses same-directory temporary files, private permissions, flush-before-rename, and cleanup coverage; this protects the local fallback from truncated metadata after a process crash

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

- [ ] **P4-01** Add auth — feature-gated Better Auth + hashed email-OTP foundation, real delivery webhook, session middleware, login UI, expanded local cross-user route negative coverage, matching Postgres auth-handle wiring, and `npm run e2e:postgres-auth-http` authenticated Postgres owner-scope proof are implemented; keep open until production delivery, org-backed policy, and exhaustive authenticated Postgres route/deployment acceptance are complete
- [ ] **P4-02** Migrate database — Drizzle/PostgreSQL schema contract, eight migrations, owner-bound conversation/task-lineage/provider-message/MCP-history/legacy-provenance tables, isolated async chat, metadata, operational, workspace, and project-revision repositories, owner-required importer, organization/member staging, cross-owner relationship validation, optimistic-conflict/restart proofs, MCP audit retention, lease fencing, native-event projection proofs, transaction-backed fork history, HTTP driver/read-boundary evidence, authenticated two-process HTTP SSE suffix/replay evidence (`npm run e2e:postgres-http-sse`), an opt-in `TaskStore` runtime (`npm run e2e:postgres-taskstore`, `npm run e2e:postgres-http`), and bounded follow-up idempotency/replay protection (`npm run e2e:follow-up-attachment`) are now present; the real importer also round-trips workspace/project/native bytes and projection metadata; keep open until private attachment export policy/round trips, crash-safe full workflow idempotency/concurrency, production broker/deployment tuning, and production migration/deployment controls are safe
- [ ] **P4-03** Containerise — current non-root multi-stage `Dockerfile`, hardened Compose image, explicit operator-controlled Postgres/auth environment contract, `.env.example`, and a GitHub Actions build/non-root/read-only smoke gate are implemented; keep open until the Postgres migration/backup procedure, production secret delivery, and deployment rollout/rollback controls are exercised

P4-02 progress note: Postgres is now a controlled opt-in server driver with matching Better Auth handle wiring and authenticated owner-scope rejection. The proofs cover standalone messages, atomic native projections, transaction-backed fork history, workspace byte/version restore/compare/copy recovery, current project-file update/restart recovery, durable project revision restore, interrupted-task reconciliation, HTTP driver/read-boundary checks, authenticated two-process HTTP SSE suffix/replay, a real legacy import of workspace/project/native bytes plus projection metadata, and bounded duplicate follow-up acceptance with deterministic keyed attachment paths. Remaining blockers are private attachment export policy/round trips, crash-safe complete workflow idempotency/concurrency, production broker/deployment tuning, and production migration/deployment controls.
- [ ] **P4-04** Deploy to Railway or Fly.io — `railway.toml` or `fly.toml`; deploy instructions in `plan/04-cloud-infrastructure.md#deploy`
- [ ] **P4-05** Add cloud sandbox — integrate **e2b.dev** (`@e2b/code-interpreter`) as the default `sandboxed` execution backend; surface sandbox preview URL in workspace iframe; `E2bRuntimeAdapter` wraps e2b and implements the full `RuntimeAdapter` interface
- [ ] **P4-06** Add multi-tenancy scaffolding — local user ownership now scopes tasks, projects, schedules, conversations, MCP declarations, and task routes; migration v9 adds local `organizations`/`organization_members` records behind the shared repository/transaction boundary, with owner/member HTTP routes and explicit owner-only mutations; the authenticated two-user HTTP harness covers conversation, Library, search, task, project, file, schedule, MCP, and organization boundaries and proves membership visibility does not widen task access; keep open until the Postgres repository switch, org-backed policy/data authorization, and migration/import are complete
- [x] **P4-07** Resolve dependency audit gate — the five moderate Better Auth/Drizzle Kit/esbuild advisories are resolved by pinning the vulnerable transitive `@esbuild-kit/core-utils` esbuild dependency to patched `0.25.12`; `npm audit --omit=dev --audit-level=moderate` returns zero vulnerabilities, `npm run db:check` remains green, and CI now enforces the production-tree audit. The override must be revalidated whenever Drizzle Kit or Better Auth changes.

---

## Phase 5 — Professional UI
**Target: no hardcoded strings, no dead controls, no swallowed errors; state management is Zustand + TanStack Query.**
Reference: `plan/05-ui-overhaul.md`

- [x] **P5-01** Migrate state management — `useUiStore`, `useComposerStore`, and `useSessionStore` own navigation/inspector, composer, and auth state; all ordinary server-backed collections are now Query-owned. Active task snapshots remain intentionally isolated in `useTask` because they are durable SSE projections, not generic client state.
- [x] **P5-02** Adopt TanStack Query — QueryClient is mounted at the app root; Skills, runtime readiness, MCP declarations, Projects, Schedules, Library, paginated Conversations, and task inventory use cached queries, and active-task stop/retry/follow-up/branch/share/guidance/project/tag actions use mutation hooks with explicit pending controls and toast errors. The active task/SSE snapshot remains intentionally on `useTask`; successful mutations reconcile server-derived caches or refresh that snapshot without duplicating stream authority.
- [x] **P5-03** Add toast system — Sonner is mounted globally; task/project/schedule/MCP/share/runtime failures now surface as user-visible notifications, and the duplicate schedule confirmation was removed. Deliberately remains a client error-surface slice, not a replacement for server evidence.
- [x] **P5-04** Fix all dead controls — removed the two decorative Settings controls, made workspace refresh reload task files, and replaced the hardcoded skills count with the live catalog size
- [x] **P5-05** Add conversation search UI — sidebar search debounces against the server-backed `/api/conversations?q=...` contract and retains the loaded-history fallback for short queries
- [x] **P5-06** Add schedule delete — `DELETE /api/schedules/:id` + trash icon + confirm dialog; existing tasks remain durable after schedule removal
- [x] **P5-07** Add library item removal — `DELETE /api/library/:taskId` hides a completed artifact from Library with confirmation and evidence, while preserving the originating task/workspace
- [x] **P5-08** Add history restore confirmation — confirm dialog, loading state, success/error status, and evidence-backed refresh
- [x] **P5-09** Fix evidence log — latest-six view now has an explicit "Show all N events" toggle without discarding the durable event ledger
- [x] **P5-10** Fix status labels — added canonical `statusLabel`/`tokenLabel` helpers and replaced raw run, mode, execution-boundary, and activity enum rendering in the primary task/computer surfaces
- [x] **P5-11** Fix accessibility — all semantic `<time>` elements now carry `dateTime`, byte labels use the shared `readableBytes` helper, generated images have alt text, and the activity/file surfaces retain accessible labels. No `<time>` element exists in `index.html`; the null-guard is therefore not applicable.
- [x] **P5-12** Fix working trace — added a disclosure chevron, keeps the trace open while running, and replaces hard truncation with an accessible Show more detail disclosure
- [x] **P5-13** Finish composer UX — disable the fifth skill toggle with an explanatory tooltip; the duplicate typing indicator and `waiting_for_user_input` running-state defect are closed under P2-09

---

## Phase 6 — MCP + extensions
**Target: users add MCP servers; ONEVibe routes tool calls through them; skill marketplace works.**
Reference: `plan/06-mcp-extensions.md`

- [x] **P6-01** Add MCP config management — local SQLite-backed UI to add/remove/test MCP servers; store in `runtime_mcp_configs` (not on-disk JSON); inject secret-free declarations into adapters that support `'tool_use'`. Authenticated ownership and a production secret broker remain part of P4.
- [x] **P6-02** Add skill marketplace — GitHub-backed catalog, SHA-256 verified install/remove UI, owner-scoped persistence, bounded built-in/marketplace selection validation, truthful demo/provider event contracts, deterministic restart/materialization proof, live pushed-GitHub catalog/content verification, and protected Claude/LiteLLM materialization are complete. The protected evidence is host-process only; production org authorization and ONEComputer/microVM isolation remain separate gates.
- [x] **P6-03** Add two-tool MCP facade — opt-in server-owned stdio facade exposes `search_capabilities` + `execute_capability`, bounds output/time/process environment, and executes only IDs returned by the same catalog; production secret brokering, external health/attestation, authenticated organization ownership, and protected provider acceptance remain open
- [x] **P6-04** Add agent context diagnostics — authenticated `/api/diagnostics` and a Computers status panel now report the LiteLLM model boundary, session scope, persistence driver/contract, runtime readiness, sandbox boundary, and owner-scoped MCP health/tool-catalog checks without returning credentials, prompts, or provider payloads. This is local operational visibility, not production attestation.

---

## Phase 7 — Tenant theming and extensibility (planned; post-Phase 6)
**Target: secure, tenant-scoped white-labeling without weakening ONEVibe's provider, auth, approval, or typography boundaries.** Linear parent: `ONE-261`; security/schema: `ONE-262`; token/runtime provider: `ONE-263`; persistence/API: `ONE-264`; admin controls: `ONE-265`.
Reference: `THEMING_EXTENSIBILITY.md`.

**Dependency gate:** do not ship tenant-admin theme mutation until P4-01 auth/admin roles, P4-02 Postgres runtime persistence, P4-06 organization policy, and the P5 UI foundation are accepted. A single-tenant `ONEVIBE_TENANT_ID` preview may be used earlier only with read-only, checked-in fixtures.

**Design constraints added during review:**

- The current product contract is sans-serif UI typography only. The source brief's visible serif and monospace examples are reference material, not permission to reintroduce serif/monospace fonts into the ONEVibe UI. Tenant font overrides must be allow-listed and preserve this invariant unless a separately approved accessibility/design ADR changes it.
- Theme configuration is untrusted tenant data. Validate it with a shared schema, bound every string/array/asset size, reject CSS injection primitives (`url(`, `expression(`, `javascript:`, unbalanced declarations), and never render arbitrary HTML without a reviewed sanitizer and CSP.
- Tenant themes may change presentation and content, never model routing, LiteLLM enforcement, OpenVTC/VTI approval authority, auth/session policy, evidence redaction, sandbox policy, or provider credentials.
- Tier 3 packages are deployment-time code, not database-controlled plugins. Load only signed/allow-listed packages from the server environment; never dynamically import a package name supplied by a request or tenant config.
- Logos, fonts, and background assets require server-side type/size/content validation and a documented provenance policy. Remote assets must not become an unbounded browser egress path.

### P7-01 — Token foundation and component migration (P1 after backend gate)

- [ ] Create `src/theme/default.css` as the canonical token source for color, typography, shape, spacing, layout, and shadow.
- [ ] Inventory raw color/font/radius literals in `src/` and migrate production components to tokens without changing the current ONEVibe visual baseline.
- [ ] Add a CSS/static-analysis gate for raw colors and forbidden font families in component styles; allow literals only in token source, SVG assets, and reviewed test fixtures.
- [ ] Add asymmetric brand-radius tokens as opt-in tokens, with neutral defaults; no component may assume a customer-specific shape.

### P7-02 — Typed tenant configuration and safe resolution (P0 security foundation)

- [ ] Add a versioned `TenantThemeConfig` schema with bounded tokens, brand assets, homepage content, navigation, feature flags, and compliance links.
- [ ] Define tenant resolution order: authenticated session/org, explicit deployment environment, then validated host/subdomain; default to the base theme when unresolved.
- [ ] Enforce tenant isolation on every read/write and reject cross-tenant admin access; preserve server-derived actor/org scope.
- [ ] Keep theme configuration unable to override LiteLLM routes, runtime credentials, approval state, auth policy, sandbox boundaries, or evidence payloads.

### P7-03 — Durable theme store and API (P1)

- [ ] Add a Postgres-backed `tenant_theme_configs` table/migration with version, owner/org scope, audit metadata, and optimistic update checks; do not add a second SQLite-only authority.
- [ ] Implement authenticated `GET /api/theme/current`, admin-only `GET/PUT /api/theme/:tenantId`, and admin-only reset with typed errors and append-only audit events.
- [ ] Add import/seed validation for reference tenant fixtures; never seed live customer data or secrets into the repository.

### P7-04 — Runtime ThemeProvider and asset loader (P1)

- [ ] Add `ThemeProvider` and `ThemeSlot` contexts that project server-authoritative configuration into the React tree without browser-owned persistence.
- [ ] Sanitize camelCase-to-CSS-token mapping, reject unsafe values, replace styles on config revision, and set nav contrast attributes from a tested luminance helper.
- [ ] Add a bounded font/asset loader. Prefer self-hosted, integrity-checked assets; remote font loading must be explicit, allow-listed, and compatible with the sans-serif contract.

### P7-05 — Admin appearance controls (P1)

- [ ] Add an admin-only Appearance surface for palette, allowed font, radius, logo, and logo-mark changes with immediate local preview and explicit Save/Reset.
- [ ] Validate logo MIME/content server-side (PNG/SVG, bounded size); sanitize SVG scripts, event handlers, external references, and unsafe URL schemes.
- [ ] Add keyboard, reduced-motion, contrast, error, optimistic-conflict, and unauthorized-state coverage.

### P7-06 — Tenant homepage/content configuration (P1)

- [ ] Add an admin-only homepage editor for bounded hero copy, announcement links, feature cards, navigation links, and compliance links.
- [ ] Render configured content through typed React components; do not render arbitrary `customSectionsHtml` by default. If an HTML escape hatch is approved later, use a reviewed sanitizer/CSP test and prohibit scripts, iframes, inline styles, event handlers, and unsafe URLs.
- [ ] Support optional per-card accent tokens through an allow-listed palette rather than arbitrary CSS values.

### P7-07 — Reference tenant profiles and acceptance matrix (P2)

- [ ] Add non-production, fixture-only reference profiles for institutional, financial, and philanthropic visual systems, with no customer credentials or proprietary assets.
- [ ] Verify base theme plus each profile at desktop/mobile sizes, light/dark modes, keyboard navigation, reduced motion, WCAG contrast, and no-overflow conditions.
- [ ] Verify that theme changes do not alter runtime readiness, LiteLLM routing, task ownership, approval authority, evidence chain, or artifact behavior.

### P7-08 — Tier 3 deployment-time extension package (P2, after P7-02/P7-04)

- [ ] Define and document a versioned `ThemePackage` contract for page overrides, named slots, routes, CSS, and token defaults.
- [ ] Load only packages from `ONEVIBE_ALLOWED_THEME_PACKAGES`, verify package version/integrity at deployment, and fail closed on invalid exports.
- [ ] Add slot fallback, package isolation, static-build, CSP, and rollback tests; package code must not receive raw secrets or become an approval authority.

### P7-09 — Release evidence and operations (P1 before production)

- [ ] Add `npm run e2e:themes` covering base-theme fallback, tenant isolation, safe token rejection, admin authorization, save/reset, content sanitization, asset validation, and restart persistence.
- [ ] Add theme audit events to diagnostics and Linear evidence without storing raw secrets, uploaded bytes, or untrusted HTML.
- [ ] Document cache invalidation, rollout/rollback, migration, package provenance, asset retention, and incident response in the deployment runbook.

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
