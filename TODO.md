# ONEVibe — Cloud Workspace Transformation TODO

> **What ONEVibe is**: The **Cowork frontend** — the end-user face of the ONEComputer governed AI platform. Users open ONEVibe, pick a task, connect their tools (Jira, GitHub, Outlook, Google Drive, Slack…), and an agent runs it inside an ONEComputer-managed sandbox. ONEVibe provides everything the user sees and touches: conversation, artifacts, connector management, approval cards, and the execution trace. ONEComputer is the invisible infrastructure beneath: MITM gateway, connector broker, VTI identity, CISO console, policy enforcement. Neither product works without the other; they are one platform with two faces.
>
> **What ONEVibe is not**: A wrapper around a single SDK, and not a standalone product. The connectors, governance, sandbox isolation, and audit trail all live in ONEComputer. ONEVibe surfaces them in a way a non-technical user can act on. The harness (Claude SDK, Codex, AgentCore) is a pluggable detail; the governance layer is not.
>
> **The two abstractions that matter**: `server/runtime-adapter.ts` (harness boundary — every AI runtime is an implementation) and `ONECOMPUTER_URL` (governance boundary — all connector calls, approvals, sandbox execution, and audit trail live behind this endpoint). Never leak harness-specific or connector-specific concepts into the UI data model.
>
> **Current state**: The local-first foundation is substantially implemented: backend-offline recovery, truthful simulation labelling, durable SSE replay/reconnect, LiteLLM-only routing, provider-neutral runtime lifecycle, runtime health/routing, task workspaces, durable guidance queueing, assistant-ui conversation rendering, owner-scoped local auth, bounded MCP health/facade controls, and the initial skill marketplace boundary are in place. Remaining release blockers are live provider acceptance, Postgres/runtime deployment, sandbox attestation, production MCP secret brokering/external health attestation, document/provider/browser evidence, and the remaining professional-UI gates. See `HANDOVER.md` and `plan/00-gap-analysis.md`.
>
> **Release gate**: `npm run check` must stay green after every task: lint, the complete Vitest suite, production TypeScript/Vite build, and E2E harness typecheck. Treat the command output as the authoritative test count; the latest verified run is 61 files / 288 tests.

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
- [x] **P1-10** Close the protected document-mode agent loop — the full `npm run e2e:golden` run now passes through the server-controlled LiteLLM relay with the product's documented 15-minute turn deadline: selected skills materialize, two Claude turns complete, durable source/artifact evidence persists, SSE live/suffix replay, restart recovery, server-side search, and separate-task isolation all pass. Earlier 60–120s diagnostic deadlines were below the product default and failed closed without synthetic artifacts. Latest result: task `task_93c3a98da5964b`, 5 live frames, 86 replay frames, valid evidence, and `executionBoundary=host_process`.

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
**Platform philosophy: Docker-first, cloud-agnostic.** The deployment unit is a `docker-compose.yml` (or equivalent Compose-compatible stack) that runs identically on any host: Azure Container Apps, AWS ECS, GCP Cloud Run, Hetzner VPS, bare-metal, or a developer's laptop. No cloud SDK, no proprietary managed-service client code inside the app itself. Cloud-specific wiring (ACR, ACA, ACS email) lives in CI/deploy scripts only — never in application code. All secrets injected as environment variables; the app never calls a secret manager SDK directly.
Reference: `plan/04-cloud-infrastructure.md`

- [ ] **P4-01** Add auth — feature-gated Better Auth + hashed email-OTP foundation, real delivery webhook, session middleware, login UI, expanded local cross-user route negative coverage, matching Postgres auth-handle wiring, and `npm run e2e:postgres-auth-http` authenticated Postgres owner-scope proof are implemented; keep open until production delivery, org-backed policy, and exhaustive authenticated Postgres route/deployment acceptance are complete
- [ ] **P4-02** Migrate database — reviewed fourteen-migration Drizzle/PostgreSQL schema contract, owner-bound conversation/task-lineage/provider-message/MCP-history/legacy-provenance tables, isolated async chat, metadata, operational, workspace, project-revision, durable follow-up-operation, durable follow-up-attachment, and tenant-theme/audit repositories, owner-required importer, organization/member staging, cross-owner relationship validation, optimistic-conflict/restart proofs, MCP audit retention, lease fencing, native-event projection proofs, transaction-backed fork history, HTTP driver/read-boundary evidence, authenticated two-process HTTP SSE suffix/replay evidence (`npm run e2e:postgres-http-sse`), an opt-in `TaskStore` runtime (`npm run e2e:postgres-taskstore`, `npm run e2e:postgres-http`), bounded follow-up idempotency/replay protection (`npm run e2e:follow-up-attachment`), crash-recovery failure-injection proof (`npm run e2e:follow-up-recovery`), TaskStore-level replay-safe turn reservation, durable follow-up leases with heartbeat renewal/correlation IDs, explicit provider-unknown acknowledgment, durable attachment byte reservations, and centralized private-path filtering for public files/direct reads/exports are now present; the real importer also round-trips workspace/project/native bytes and projection metadata; keep open until provider-side idempotency, production broker/deployment tuning, and production migration/deployment controls are safe. The filesystem/task-metadata promotion boundary is recoverable and idempotent under failure injection, but remains a non-atomic cross-store operation
- [ ] **P4-03** Containerise — current non-root multi-stage `Dockerfile`, hardened Compose image, explicit operator-controlled Postgres/auth environment contract, separate liveness/readiness health endpoints, graceful SIGTERM TaskStore shutdown, `.env.example`, reviewed migration/backup/restore/rollback runbook, Fly.io release contract with migration-first `release_command`, and GitHub Actions build/non-root/read-only/Postgres backup smoke gates are implemented; keep open until production secret delivery, managed deployment, PITR/retention, and rollout/rollback controls are exercised

P4-02 progress note: Postgres is now a controlled opt-in server driver with matching Better Auth handle wiring, authenticated owner-scope rejection, and a real running-server proof. The disposable PostgreSQL 18 acceptance on 2026-07-17 passed `e2e:postgres-http`, `e2e:postgres-auth-http`, two-process authenticated `e2e:postgres-http-sse` live delivery plus suffix replay, repository/TaskStore restart and lease proofs, tenant-theme transaction/audit/owner-boundary acceptance, and backup/restore byte/hash verification across fourteen reviewed migrations. The broader proofs cover standalone messages, atomic native projections, transaction-backed fork history, workspace byte/version restore/compare/copy recovery, current project-file update/restart recovery, durable project revision restore, interrupted-task reconciliation, a real legacy import of workspace/project/native bytes plus projection metadata, bounded duplicate follow-up acceptance with deterministic keyed attachment paths, replay-safe TaskStore turn reservation on SQLite/Postgres, private attachment exclusion from public files/direct reads/edits/portable export, and a durable follow-up operation journal with controlled crash recovery. A repeated client request now reuses the durable turn/message pair and does not reactivate a terminal turn; a crash after operation preparation resumes exactly one demo follow-up after restart, while an operation already claimed for provider execution is marked failed rather than automatically replayed. Remaining blockers are the non-atomic attachment/task promotion boundary, provider-side idempotency, production broker/deployment tuning, reference seed/import validation, and production migration/deployment controls.
- [ ] **P4-04** Docker-first production stack — produce `docker-compose.prod.yml` (app + postgres + optional smtp relay) that is the canonical deploy artifact. Works on any Docker host. CI builds the image, pushes to any OCI registry (ACR, ECR, GHCR, or self-hosted), and a single `docker compose up -d` deploys it. Include: migration-first entrypoint, health checks, restart policy, named volumes for Postgres data and workspace files, `.env.example` with every required var documented. Azure-specific notes (ACA, ACR, ACS email) live in `docs/AZURE-DEPLOY-NOTES.md` as an optional overlay, not in the main stack.
- [ ] **P4-05** Sandbox backends — moved to Phase 8 (ONEComputer meta-sandbox harness). See P8 below.
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
- [x] **P5-14** Overhaul execution trace / scrubbing UX — the current `<input type="range">` slider in the artifact rail is the wrong interaction model for a discrete-step agent system. Replace it with a **checkpoint list + detail panel** pattern (industry standard: AgentOps waterfall, LangSmith checkpoints, Langfuse trace tree). Done: scrubber and "Scrub evidence" label removed; the rail is now a virtualized checkpoint list (status dot, type icon, label, timestamp, latency badge) with a ← n / m → stepper, consecutive tool calls grouped under collapsible LLM-turn headers, and the right-hand stage as the selected-step detail pane; filter bar, run comparison, search, and Replay/Live unchanged.

  **Design principles (from research into Manus, Kimi, AgentOps, LangSmith, Langfuse):**
  - Agents are discrete-step systems, not continuous media. The correct primitive is a **clickable checkpoint list**, not a drag slider. Every step is a named, labeled object — not a position on a range.
  - **Left list, right detail** is the dominant pattern. Left rail shows the chronological step list with type icon, label, and timestamp. Clicking a step populates the right/main panel with its full detail (input, output, latency, token count, status).
  - **Visual hierarchy mirrors execution hierarchy.** Tool calls nest under the LLM turn that triggered them. Sub-steps indent under parent steps. A flat log with no nesting is the #1 complaint across all tools.
  - **Per-step metadata visible inline** on the list row: latency badge, token count (where available), status dot (success / error / pending). No need to click in just to see if a step failed.
  - **Causality visible.** You can see which step caused which child. Collapsible groups for tool-call clusters keep the list scannable without hiding data.
  - **Type differentiation.** LLM turn ≠ tool call ≠ error ≠ artifact ≠ user input ≠ approval request. Each type gets a distinct icon and colour token. Currently all events look the same.
  - **No drag scrubber.** A range input is the wrong affordance — it implies continuous media. Remove it. Step-through navigation (← →) or click-to-select is the right model.
  - **Replay = re-select.** Clicking any past checkpoint re-renders the detail panel at that point in time. "Play" means auto-advancing through checkpoints at a fixed interval (useful for demos), not scrubbing a timeline bar.

  **Concrete implementation guidance for Kimi:**
  1. Replace `.computer-rail-scrubber input[type=range]` with a step counter + prev/next arrow buttons (`←  3 / 12  →`).
  2. Restructure `.computer-rail-entry` to show: type icon (colour-coded) · step label · timestamp · latency badge — all on one 44px row.
  3. Add an expandable detail pane (below the list or in a right panel) that renders the selected step's full content: tool input/output, artifact preview, approval prompt, etc.
  4. Group consecutive tool calls under their parent LLM turn with an indent and a collapse toggle.
  5. Add a status dot to each row: green (completed) / red (failed) / yellow (approval pending) / grey (skipped).
  6. Keep the filter bar (All / terminal / screenshot / file / etc.) — it is genuinely useful.
  7. Keep the run comparison dropdown — also useful.
  8. Remove the "Scrub evidence" label and range input entirely.

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

- [x] Create `src/theme/default.css` as the canonical token source for color, typography, shape, spacing, layout, and shadow.
- [x] Inventory raw color/font/radius literals in `src/` and migrate production components to tokens without changing the current ONEVibe visual baseline.
- [x] Add a CSS/static-analysis gate for raw colors and forbidden font families in component styles; allow literals only in token source, SVG assets, and reviewed test fixtures.
- [x] Add asymmetric brand-radius tokens as opt-in tokens, with neutral defaults; no component may assume a customer-specific shape.

### P7-02 — Typed tenant configuration and safe resolution (P0 security foundation)

- [x] Add a versioned `TenantThemeConfig` schema with bounded tokens, brand assets, homepage content, navigation, feature flags, and compliance links. `server/theme-config.ts` rejects CSS injection primitives, unsafe URLs, unapproved fonts, and unbounded content.
- [x] Define tenant resolution order: authenticated session/org, explicit deployment environment, then validated host/subdomain; default to the base theme when unresolved. The resolver accepts only server-derived scope and an operator-owned host allow-list.
- [x] Enforce tenant isolation on the implemented theme reads/writes and reject cross-tenant owner access; preserve server-derived actor/org scope. Fresh two-organization Postgres HTTP acceptance proves owner A/B lists are isolated and cross-tenant reads return `404`.
- [x] Complete the no-capability-escalation invariant across approval state, evidence payloads, and produced artifacts. The two-organization Postgres acceptance proves theme mutation does not change model-boundary, auth, persistence, runtime, sandbox, MCP, approval, evidence, or artifact state. Production policy and visual acceptance remain separate gates.

### P7-03 — Durable theme store and API (P1)

- [x] Add a Postgres-backed `tenant_theme_config`/audit table and migrations with version, owner/org scope, audit metadata, optimistic update checks, and reset tombstones; do not add a second SQLite-only authority. The live owner row is `org_member.role=owner`; stored owner identity is provenance only.
- [x] Implement authenticated `GET /api/theme/current`, owner-only `GET/PUT /api/theme/:tenantId`, and owner-only reset with typed errors and append-only audit events. Writes and audit rows are committed transactionally; stale versions return `theme_version_conflict`.
- [x] Add import/seed validation for reference tenant fixtures; `npm run theme:validate-seed -- docs/fixtures/themes/reference-onevibe.json` accepts only checked-in `reference-*` profiles and rejects credential-like fields, unsafe schema values, and live-looking tenant IDs.

### P7-04 — Runtime ThemeProvider and asset loader (P1)

- [x] Add `ThemeProvider` and `ThemeSlot` contexts that project server-authoritative configuration into the React tree without browser-owned tenant persistence.
- [x] Sanitize camelCase-to-CSS-token mapping, reject unsafe values, replace styles on config revision, and set nav/page contrast attributes from tested luminance and WCAG ratio helpers. Projection targets the semantic CSS layer actually consumed by the UI.
- [x] Add a bounded font/asset loader. Fonts remain a sans-serif allow-list; image assets are HTTPS/same-origin only, fetched without ambient credentials, MIME-checked, capped at 2 MiB, abortable, and integrity-checked when a remote digest is configured. Remote logos require `logoSha256`.

### P7-05 — Admin appearance controls (P1)

- [x] Add a truthful owner-scoped Appearance surface for palette, allowed font, radius, and logo changes with immediate local preview and explicit versioned Save/Reset. Formal admin-role authorization and logo-mark controls remain open because the current auth contract only proves organization-owner membership.
- [x] Validate logo MIME/content server-side (PNG/SVG, bounded size); sanitize SVG scripts, event handlers, external references, and unsafe URL schemes. `sanitizeSvg` (`src/lib/svg-sanitize.ts`, re-exported from `server/theme-config.ts`) strips `<script>`/`<foreignObject>` blocks, inline `on*` handlers, `javascript:`/`data:` URI hrefs/srcs, and `<use>` references to an external document, with a positive smoke test that a benign SVG and local `#fragment` `<use>` are left untouched. It is a best-effort regex pass, not a full parser, and is applied in addition to (not instead of) the existing MIME/size/integrity checks. The one live remote-asset path (`src/components/ThemeProvider.tsx` `loadThemeImage`) now runs `image/svg+xml` bytes through it before constructing the object URL.
- [ ] Add keyboard, reduced-motion, contrast, error, optimistic-conflict, and unauthorized-state coverage.

### P7-06 — Tenant homepage/content configuration (P1)

- [x] Add an owner-scoped homepage editor for bounded hero copy, announcement links, and feature cards. Navigation links are rendered from the existing validated config; formal admin-role authorization and editor controls for compliance links remain open.
- [x] Render configured content through typed React components; arbitrary `customSectionsHtml` is not accepted or rendered. Any future HTML escape hatch requires a reviewed sanitizer/CSP test and must prohibit scripts, iframes, inline styles, event handlers, and unsafe URLs.
- [x] Support optional per-card accent tokens through an allow-listed palette rather than arbitrary CSS values.

### P7-07 — Reference tenant profiles and acceptance matrix (P2)

- [x] Add non-production, fixture-only reference profiles for institutional, financial, and philanthropic visual systems, with no customer credentials or proprietary assets. `docs/fixtures/themes/reference-profiles.json` is schema-validated and uses the sans-serif-only contract.
- [x] Add a read-only, exact-ID fixture preview path via `ONEVIBE_TENANT_ID=reference-*`; it is disabled in production, returns `persistent: false`/`previewOnly: true`, and cannot select mutations, runtime policy, credentials, approvals, or sandbox behavior.
- [x] Programmatic acceptance: `server/theme-wcag-acceptance.test.ts` validates all three reference profiles for required token presence, an allow-listed top-level schema, WCAG contrast ≥4.5:1 for nav and body text/background pairs (real luminance-ratio math, not eyeballed), `fontUi` membership in the sans-serif allow-list, and light/dark token-name parity in `src/index.css`. Full desktop/mobile, light/dark, keyboard-navigation, reduced-motion, and no-overflow browser screenshot acceptance is NOT covered by this test and still needs a manual pass — see the Manual QA note below.
- [x] Verified via `npm run e2e:themes` (delegates to the authenticated Postgres HTTP proof): theme mutations do not alter runtime readiness, LiteLLM routing, task ownership, approval authority, evidence chain, or artifact behavior — only tenant theme rows/events change, gated by owner authorization.

> **Manual QA still open (P7-07):** the programmatic test above proves data-level correctness (contrast math, schema, token parity) but does not render the app. A human still needs to load each reference profile in a real browser at desktop (≥1280px) and mobile (375px) widths, in both light and dark mode, and confirm: no layout overflow, visible focus rings for keyboard-only navigation, and no motion-heavy transitions when `prefers-reduced-motion` is set. Not automated in this environment (no attached browser/display for Playwright screenshots).

### P7-08 — Tier 3 deployment-time extension package (P2, after P7-02/P7-04)

- [x] Define and document a versioned `ThemePackage` manifest contract for an operator-pinned entry artifact, host-owned slots/routes, and token defaults in `docs/THEME-PACKAGE-CONTRACT.md`; CSS, arbitrary paths, and runtime imports are explicitly excluded.
- [x] Add a fail-closed manifest loader using `ONEVIBE_ALLOWED_THEME_PACKAGES`, operator-only selection/version/integrity/root/manifest paths, semver, bounded regular files, symlink-safe relative paths, and SHA-256 checks. It deliberately stops before executing extension code.
- [ ] Add slot fallback, package isolation, static-build, CSP, and rollback tests; package code must not receive raw secrets or become an approval authority.

### P7-09 — Release evidence and operations (P1 before production)

- [x] Add `npm run e2e:themes` covering base-theme fallback, tenant isolation, safe token rejection, owner authorization, save/reset, typed content escaping, asset-boundary checks, and restart persistence by delegating to the authenticated Postgres HTTP proof. Disposable Postgres acceptance passed on 2026-07-17 with three reference profiles, versions 1→3, three audit events, owner/member `404`/`403`, and direct-first-party blocked.
- [x] Add owner-scoped theme audit counters/latest operation to diagnostics and Linear evidence without returning raw secrets, uploaded bytes, actor IDs, or untrusted HTML. `npm run e2e:postgres-auth-http` asserts the Postgres path.
- [x] Document cache invalidation, rollout/rollback, migration, package provenance, asset retention, and incident response boundaries in the deployment runbook. Managed deployment/PITR/retention remains open.

---

## Phase 8 — ONEComputer meta-sandbox harness + VTI identity layer
**Target: ONEComputer is the universal sandboxing layer for ONEVibe, with every sandbox carrying a cryptographically-verifiable identity backed by OpenVTI/VTC. Agents run inside ONEComputer-managed sandboxes. Their traffic through the MITM gateway carries a W3C VC proving who the sandbox is, what community it belongs to, and what it is authorised to do — creating a tamper-evident audit trail per agent execution.**

**Why ONEComputer, not direct e2b/Daytona:** ONEVibe's `RuntimeAdapter` interface abstracts harnesses. ONEComputer is the next level up — it abstracts the *sandbox* itself and owns sandbox credentials, so you can swap Daytona for e2b without touching ONEVibe.

**Why OpenVTI/VTC here:** The ONEComputer gateway already has `vti_signer.rs` (W3C VC injection via affinidi TDK) and `identity_injection.rs` (VP header embedding). The VTI stack provides: VTA for sandbox key custody and DID issuance; VTC for community membership and policy; `vta-mcp` for exposing VTA capabilities to any MCP-speaking agent host. Sandboxes should enrol as `ai-agent` devices in the VTA — their gateway token then carries a signed VC (`vtiVerified=true`) and the condition_match policy can enforce that a sandbox must prove community membership before any outbound call is allowed through.

**OSS-first principle:** self-hosted Daytona, e2b OSS, and Docker devcontainers are all runnable on Azure. SaaS tiers are drop-in env-var swaps once the OSS path is proven.

**Phase 9 feeds into this phase:** Kimi's Azure installation benchmarks (P9) become the acceptance evidence for each adapter here. Don't implement an adapter until P9 has produced a working install of that backend.

### Sandbox infrastructure (adapters)

- [ ] **P8-01** Design ONEComputer `SandboxAdapter` interface — `create(spec) → SandboxHandle`, `exec(handle, cmd) → stream`, `getPreviewUrl(handle) → string`, `getFiles(handle, path) → FileTree`, `destroy(handle)`. Spec carries: image/template, resource limits, workspace mount, env vars (secret refs only). Document in `ONECOMPUTER-SANDBOX-CONTRACT.md`. Include VTI device-enrolment hook: on `create`, the adapter calls VTA to register the sandbox as an `ai-agent` device and stores the credential in the SandboxHandle.

- [ ] **P8-02** Implement Daytona OSS adapter — `DaytonaSandboxAdapter` wraps the Daytona OSS API (`github.com/daytonaio/daytona`). Accept: create workspace → exec command → stream stdout → destroy. Target: self-hosted on Azure, no Daytona Cloud dependency. Blocked on P9-01.

- [ ] **P8-03** Implement e2b OSS adapter — `E2bSandboxAdapter` wraps the e2b self-hosted runtime (`github.com/e2b-dev/infra`) behind the same interface. SaaS tier (`e2b.dev`) is a drop-in swap via `E2B_BASE_URL`. Blocked on P9-02.

- [ ] **P8-04** Implement Docker-native devcontainer adapter — spin up a Docker-in-Docker or ACA job per task. Lowest external dependency; works with zero third-party SaaS. Available on Azure immediately.

- [ ] **P8-05** ONEComputer broker endpoint — `POST /api/sandbox/run` routes to the right `SandboxAdapter`, streams results as SSE. ONEVibe never imports Daytona/e2b SDKs directly.

- [ ] **P8-06** Wire ONEVibe `SandboxedRuntimeAdapter` — `server/sandbox-runner.ts` POSTs to ONEComputer's broker, streams SSE into the durable event ledger, exposes `'sandboxed'` capability.

- [ ] **P8-07** Sandbox health in Computers view — per-backend status (reachable / active count / last used) via ONEComputer health endpoint; never calls sandbox API directly from ONEVibe.

- [ ] **P8-08** Azure deployment for sandbox sidecar — ACA revision with Daytona OSS sidecar, Azure File Share volume, managed identity for ACR pull, Key Vault refs for sandbox credentials. `azure-deploy/sandbox-sidecar.md`.

### VTI/VTC identity layer (sandbox trust)

- [ ] **P8-09** Sandbox device identity via VTA — on `SandboxAdapter.create()`, call the VTA API to enrol the new sandbox as an `ai-agent` device (using the `--enroll` flow from `vta-mcp`). Store the issued device DID + credential in the SandboxHandle. On `destroy()`, call `device disable` to revoke. This gives every sandbox a cryptographic identity that can be audited and revoked independently of the process.

- [ ] **P8-10** Gateway VC injection for sandbox traffic — extend `identity_injection.rs` to embed the sandbox's device credential (from SandboxHandle) as the `verifiableCredential` in the VP header injected into every outbound HTTP request. `condition_match.rs` (currently always-true stub — see AUDIT.md) must be fixed to actually evaluate community-membership assertions from the VC before forwarding. This closes the biggest security gap in the ONEComputer gateway.

- [ ] **P8-11** `vta-mcp` sidecar for sandbox agents — each sandbox that runs a Claude Code / agent host gets `vta-mcp` available as an MCP server (via the session mode). The agent can then call `sign`, `vault_get`, `issue_vp` tools to prove its identity to third-party services. Document the wiring in `docs/SANDBOX-VTI-IDENTITY.md`.

- [ ] **P8-12** VTC community policy for sandbox actions — define a VTC community whose members are registered ONEComputer sandbox instances. Outbound calls to sensitive domains (graph.microsoft.com, cloud APIs) require the sandbox to present a valid community membership VC — enforced by `condition_match.rs`. This is the first real use of `condition_match` since it has been an always-true stub.

---

## Phase 9 — OSS sandbox installs, connector bridge, and ONEVibe as Cowork frontend
**The strategic reframe:** ONEVibe is the **Cowork frontend** — the end-user face of the ONEComputer platform. ONEComputer is the **governed cyber infrastructure layer** beneath it: MITM gateway, connector broker, approval engine, VTI identity, CISO console, policy enforcement. A user opens ONEVibe, picks a task, and the agent runs inside ONEComputer — with every outbound connector call governed, every approval routed through the right manager, and every action leaving a signed audit trail via VTI.

**The connector inventory ONEComputer already has** (from `packages/api/src/apps/`): Google Workspace full suite (Gmail, Drive, Calendar, Docs, Sheets, Slides, Meet, Forms, Photos, Tasks, Admin, Classroom, Search Console, Analytics, YouTube), Microsoft (Outlook mail/calendar, Graph), Atlassian (Jira, Confluence), Notion, Trello, Monday, GitHub, GitLab, Docker, Vercel, Cloudflare, Fly.io, AWS, Supabase, MongoDB Atlas, Dropbox, Vertex AI, Datadog, LinkedIn, Zoom, HubSpot, Affinity, Resend, Telegram, Granola, Todoist + personal connectors (Gmail, Outlook, Calendar, Drive, Notes, WhatsApp/Telegram exports). All are governed through the ONEComputer MITM gateway with VTI-signed step-up approval for write/destructive operations.

**The missing piece:** ONEVibe currently has no connector awareness. It talks to agents but cannot surface "this agent wants to read your Jira" or "approval required: Outlook send." Phase 9 wires those two products together.

### Sandbox backends (parallel Kimi workstream)

- [ ] **P9-01** Install Daytona OSS on Azure VM (23.102.117.5) — self-hosted `github.com/daytonaio/daytona`. Verify: create workspace → exec shell command → stream stdout. Write `docs/SANDBOX-INSTALL-DAYTONA.md`.

- [ ] **P9-02** Install e2b OSS on Azure VM — `github.com/e2b-dev/infra`. If full infra is not Azure-feasible (Firecracker/nested-virt), document why and assess the Desktop/lightweight tier. Write `docs/SANDBOX-INSTALL-E2B.md`.

- [ ] **P9-03** Benchmark Kasm (baseline) + Daytona + e2b — cold-start latency, exec round-trip, idle memory, max concurrent on 4-vCPU. Write `docs/SANDBOX-BENCHMARKS.md` with a comparison table and recommended default.

- [ ] **P9-04** Update P8 adapter priority from benchmark findings.

### Connector bridge: ONEComputer → ONEVibe

- [ ] **P9-05** Connector discovery endpoint — ONEComputer exposes `GET /api/connectors` returning the full registry (id, name, category, icon, auth-status, governed/not). ONEVibe polls this and renders the connector list in a new Connections tab in the Computers view.

- [ ] **P9-06** ONEVibe connector OAuth flow — when a user clicks a connector (GitHub, Jira, Outlook, etc.), ONEVibe opens the ONEComputer OAuth consent flow in a popup/redirect. After consent, the credential is held by ONEComputer's secret store — never in ONEVibe. ONEVibe stores only the `connectionId`.

- [ ] **P9-07** Connector context in runtime tasks — when a task runs in a sandbox, ONEVibe passes the user's active `connectionIds` to ONEComputer's broker. The agent inside the sandbox can call those connectors via the governed gateway; ONEVibe surfaces connector usage in the execution trace (e.g. "Read 3 Jira tickets · Drafted Outlook email · Awaiting approval").

- [ ] **P9-08** Approval notifications in ONEVibe — when ONEComputer's gateway holds a request (step-up approval required), it calls back to ONEVibe via webhook. ONEVibe shows an inline approval card in the active task view: action description, risk label, Approve / Deny buttons. Decision is relayed back to ONEComputer which releases or drops the held request. This is the UX equivalent of the ONEComputer approval console, surfaced directly in the cowork flow.

- [ ] **P9-09** Connector catalogue in ONEVibe home — a Connections section on the home screen shows the user's active connectors with status, last-used, and a "+ Connect" button for the full catalogue. Think Zapier's app list, but governed.

### VTI/VTC connector interoperability (new Phase 10)

> See Phase 10 below for the full spec. Items here reference it.

- [ ] **P9-13** Wire VTI consent envelopes for all OAuth connectors — currently `vti-consent-service.ts` only covers personal connectors (Gmail, Outlook, Drive, Notes). All 48 OAuth connectors need a `consent/request` + `auth/step-up/approve-request` envelope so the VTC step-up gate fires for write operations on any connector, not just personal ones.

- [ ] **P9-14** Surface connector consent status in ONEVibe — when a connector is connected but consent has not been granted to a specific agent, show a "Consent required" state in the Connections tab. Users can pre-approve agents for connectors they regularly use.

- [ ] **P9-15** Live agent workspace right panel — A persistent ~400px right panel alongside the chat column that shows the agent's live working environment. Inspired by Manus (primary reference: `docs/MANUS-COMPUTER-DESIGN-STUDY.md`) + Kimi Web SidePanel. Implementation: `AgentWorkspacePanel` component with a sub-header "Agent is [verb]ing · [truncated action]" fed from the live SSE stream's current tool event. Panel body switches rendering mode per tool type: `file_read`/`file_write` → Editor (Shiki/Prism syntax highlight), `bash`/`shell` → Terminal (`<pre>` or xterm.js, dark bg, monospace), `browser`/`screenshot` → Browser (iframe or `<img>`), `thinking` → Thinking trace (collapsible, from Kimi Web pattern). Panel width: 360–400px. Always visible during active run; collapses to an icon strip when idle. Use CSS `grid-template-columns` to resize chat column. Screenshots: `manus-A-chat-right-panel-editor.png`, `manus-B-right-panel-terminal.png`, `manus-C-right-panel-media.png`.

- [ ] **P9-16** Tool group consolidation in AssistantThread — consecutive tool call events in the chat stream should group under a single collapsible `ToolGroup` wrapper (aggregate status dot + "N tool calls" label + chevron). Individual tool cards remain accessible on expand. CSS: `grid-template-rows: 0fr/1fr` collapse + `inert` on collapsed body. Inspired by Kimi Web ToolGroup pattern. See `docs/KIMI-WEB-DESIGN-STUDY.md`.

- [ ] **P9-17** Thinking block UX: live window + auto-collapse — during streaming show a 5-line scrolling window pinned to bottom; after completion auto-collapse to last paragraph teaser with "View full reasoning" → opens in right panel (P9-15). CSS: `grid-template-rows` collapse. See `docs/KIMI-WEB-DESIGN-STUDY.md`.

- [ ] **P9-18** ContextRing token usage in composer toolbar — compact arc showing context fill (0–100%). At ≥80%: show `/compact` chip. At ≥95%: ring turns warning color. Tooltip: "X / Y tokens · K% context used". Inspired by Kimi Web. See `docs/KIMI-WEB-DESIGN-STUDY.md`.

- [ ] **P9-19** StepTrace: "Completed N steps" collapse with plain-English labels — replace raw tool name + JSON display in the execution trace with human-readable step labels (lookup table + model-provided label override). Default: collapsed behind "✓ Completed N steps" chip. During live run: "Working… step N of ~M" with progress ring. Icons per step type: globe=web, doc=file read, pencil=write, sparkle=think. This is the single most important change for non-technical users. Inspired by Perplexity Computer. See `docs/PERPLEXITY-COMPUTER-DESIGN-STUDY.md`.

- [ ] **P9-20** Artefacts gallery page — promote artefacts to a top-level navigation destination (thumbnail grid, version badge, filter tabs: All / Mine / Shared, search). Artefact cards show: thumbnail preview (renders actual content), title, type icon, version. Inspired by Perplexity Computer Artefacts page. See `docs/PERPLEXITY-COMPUTER-DESIGN-STUDY.md`.

- [ ] **P9-21** Capabilities / Skills discovery page — a page listing what the agent can do for this user. Cards are task-oriented (not system-oriented): title = task the user can ask for; description starts "Use this when you want to…". Tied to ONEComputer's `/onevibe/capabilities` endpoint (P11-05). Filter by category. "+ Create" for custom skills. Inspired by Perplexity Computer Skills page. See `docs/PERPLEXITY-COMPUTER-DESIGN-STUDY.md`.

- [ ] **P9-22** Memory management page — show what the agent knows about the user's context (firm, role, preferences, watched entities). Editable entries. "Learned on: date" per entry. Clear all. Audit trail. Especially important for investment/banking users who need to verify the agent's understanding of their client context before it acts. Inspired by Perplexity Computer Memory. See `docs/PERPLEXITY-COMPUTER-DESIGN-STUDY.md`.

- [ ] **P9-23** Light mode as default — professional audience (bankers, government) expects a clean white interface, not a dark IDE. Add a proper light mode with card-based layout and make it the default for new users. Dark mode remains as an option. Design reference: `docs/PERPLEXITY-COMPUTER-DESIGN-STUDY.md`.

- [ ] **P9-24** Persistent composer everywhere — the composer bar should be accessible from the artefacts page, skills page, and memory page — not just the chat/task view. The mental model: the agent is always listening, wherever you are in the app. See `docs/PERPLEXITY-COMPUTER-DESIGN-STUDY.md`.

- [ ] **P9-25** Video-style replay scrubber with "• Live" indicator — replace the current `← n/m →` checkpoint stepper (P5-14) with a video-player scrubber bar at the bottom of the right panel. Controls: `|<` jump-to-start, `>` / `||` play/pause, filled dot on progress track showing current position, `• Live` red dot at right end indicating real-time state. When scrubbing historical frames: a "Jump to live" pill button overlays the right panel as a CTA. The `• Live` dot turns active (red) when the playhead equals the latest event. ONEVibe already has durable SSE replay — this is the visual control layer on top of it. Inspired by Manus. See `manus-E-task-progress-scrubber.png` and `manus-C-right-panel-media.png`.

- [ ] **P9-26** Task milestone progress panel — below the scrubber in the right panel, a collapsible "Task progress N/N" section shows 3–5 high-level milestones the agent commits to at task start and checks off as it works. Format: "Task progress 2 / 3 ↓ · ✓ Milestone 1 · ✓ Milestone 2 · ○ Milestone 3". These are user-facing deliverable promises (e.g. "Analyse the financials", "Draft the memo", "Send the briefing") — NOT the same as the step trace. Milestones are generated by the model at task start from the user's prompt; each is checked off when the relevant work is committed. Distinct from P9-19 (StepTrace). Inspired by Manus. See `manus-E-task-progress-scrubber.png`.

- [ ] **P9-27** Task completion treatment + follow-up suggestions — when a run ends, the chat column currently just stops. Build: (1) "✓ Task completed" header with green checkmark; (2) inline output file card(s) showing icon + filename + type + size; (3) "View all files in this task" link → files modal (All / Documents / Images / Code files / Links tabs); (4) 2–4 contextual follow-up suggestions generated by the model based on what was produced — each is a full sentence with an icon and `>` chevron, and may include slash command hints (e.g. "Save this as a reusable workflow with /workflow-creator"). Inspired by Manus. See `manus-D-task-complete-suggestions.png` and `manus-F-files-modal.png`.

### ONEComputer as cyber governance engine

- [ ] **P9-10** Live activity feed in ONEVibe — ONEVibe subscribes to ONEComputer's audit event stream for the current user's sandboxes. The execution trace panel shows not just agent steps but also governed gateway events: "Jira read · allowed", "Outlook send · held for approval", "SharePoint delete · blocked by policy". This is the end-user view of the CISO console.

- [ ] **P9-11** Policy visibility in ONEVibe — a read-only Policy tab in the Computers view shows the org-level and user-level governance rules that apply to the current user (sourced from ONEComputer's policy engine). Users can see why an action was blocked; managers can see the rules they set. No policy mutation from ONEVibe — that stays in the ONEComputer CISO console.

- [ ] **P9-12** VTI identity badge in ONEVibe task view — each task that ran in a governed sandbox shows a "Verified execution" badge with the sandbox DID, the VTC community it belongs to, and a link to the audit trail. This is the end-user face of P8-09 (VTA device enrolment) — making VTI/VTC legible to a non-technical user.

---

## Phase 10 — VTI/VTC connector interoperability
**The problem:** ONEComputer has 48+ OAuth connectors (GitHub, Jira, Google Workspace, Outlook, Slack, AWS, Vercel, etc.) that are OAuth-ready but not VTI-governed. Tokens flow through the gateway but:
1. No VTI `consent/request` envelope is produced — the agent just gets the token
2. No `auth/step-up/approve-request` fires before write operations
3. `condition_match::matches()` in the Rust gateway is an always-true stub — no community-membership check on any connector call
4. The VTC community has no representation of which agent is allowed to call which connector on behalf of which user

**The vision:** every connector call an agent makes is a verifiable action. The user consented via VTC (`consent/decision` signed with their key). The manager approved the step-up (`auth/step-up/approve-response` signed with their key). The gateway verified both proofs before forwarding. The audit trail is a chain of signed VTI trust tasks — portable, tamper-evident, exportable for compliance. This is what makes ONEComputer a real cyber governance engine, not just a proxy.

**Current state (honest):** `vti-consent-service.ts` is real and well-designed (builds signed `VtiTrustTaskEnvelope` structs, `failClosedIfUnavailable: true`). `personal-connector-broker-service.ts` wires it for personal connectors only. `authorizePersonalConnectorRetrievalWithVtiConsent` exists but is only called from workflow fixtures, not the live retrieval path. `condition_match::matches()` in Rust is an always-true stub. The seam is ready; the plumbing is not connected.

### Foundation

- [ ] **P10-01** Audit connector VTI coverage — for each of the 48 connectors, document: has `app-permissions` definition (hostPattern/pathPattern/method)? is VTI consent wired? is write step-up wired? Which ops require approval? Produce `docs/CONNECTOR-VTI-AUDIT.md` as the source of truth.

- [ ] **P10-02** Wire `authorizePersonalConnectorRetrievalWithVtiConsent` into the live retrieval path — currently called only from workflow fixtures. It must fire on every real connector retrieval through the broker. This closes the most critical gap: the consent gate exists but is bypassed in production. Write an integration test that proves a retrieval without a valid consent decision returns `consent_required`.

- [ ] **P10-03** Fix `condition_match::matches()` in the Rust gateway — currently returns `true` unconditionally (`apps/gateway/src/condition_match.rs`). Implement at minimum: check that the request's injected VC has `vtiVerified=true`, the issuer DID matches the gateway's own DID, and the credential subject contains a valid `connectorId` claim. Fail closed (deny) when the VC is absent or invalid. This is the most impactful single security fix in the entire codebase.

- [ ] **P10-04** Extend VTI consent envelopes to all OAuth connectors — `vti-consent-service.ts` currently builds envelopes only for personal connectors. Add a `buildConnectorConsentEnvelope(connector, agent, operation, user)` function that works for any `AppDefinition`. Wire it into the OAuth connector retrieval path so every connector call produces a signed consent record.

### Per-connector VTI permission maps

- [ ] **P10-05** Complete `app-permissions` definitions for top-10 enterprise connectors — GitHub, Jira, Confluence, Notion, Google Drive, Gmail, Outlook, Slack (if added), AWS, Vercel. Each definition maps specific API operations to `hostPattern`/`pathPattern`/`method` tuples and marks which ops are `read` vs `write` vs `destructive`. These feed `condition_match` enforcement and the ONEVibe connector permission UI.

- [ ] **P10-06** VTI risk classification per connector operation — extend `AppPermissionDefinition` with a `riskLevel: 'low' | 'medium' | 'high' | 'critical'` field per operation group. `critical` ops (delete, send external email, push to main, deploy) always require VTC step-up approval regardless of user preference. `high` ops require approval unless the user has pre-approved the agent. `medium`/`low` are auto-approved with consent. This is the policy model that makes the governance layer useful rather than just a checkbox.

- [ ] **P10-07** VTC community membership assertion for connector access — a sandbox agent calling a connector must hold a valid VTC community membership VC proving it belongs to the organisation's ONEComputer sandbox community. `condition_match.rs` must verify this claim (using the VC injected by `identity_injection.rs`) before forwarding. No membership VC = request denied. This is the real enforcement of P8-12.

### VTI credential portability

- [ ] **P10-08** Connector consent VC export — users can download a signed `consent/decision` VC for any connector grant as a portable W3C Verifiable Credential. This makes the consent record usable outside ONEComputer (e.g. for compliance audits, external relying parties, or data portability). `GET /api/connectors/:id/consent-vc` returns the signed envelope.

- [ ] **P10-09** `vta-mcp` connector tool bridge — expose connector operations as VTA MCP tools via `vta-mcp`. An agent running inside a sandbox can call `vta_call("connector/github/get_issue", { issue: "ONV-42" })` and the VTA enforces the consent/step-up check before the call reaches the ONEComputer gateway. This means sandbox agents can use connectors without the agent ever holding an OAuth token — the VTA is the credential broker. Requires P8-11 (vta-mcp sidecar in sandbox).

- [ ] **P10-10** ONEVibe connector consent history — in the Connections tab, each connected app shows a scrollable list of past consent grants: agent, operation, approved by, timestamp, VC hash. Clicking a row shows the full signed `VtiTrustTaskEnvelope`. This is the end-user view of the VTI audit trail.

---

## Phase 11 — ONEComputer as hardened ONEVibe middleware
**The problem today:** ONEComputer and ONEVibe are two separate products with no runtime connection. ONEVibe has `ONECOMPUTER_URL` as a planned env var but nothing calls it. ONEComputer has a full web dashboard, approval engine, sandbox lifecycle, audit log, and VTI signing layer — but ONEVibe cannot see any of it. This phase wires the two together at the infrastructure level so that ONEVibe is genuinely backed by ONEComputer's governance engine, not just co-located with it.

**The 5 middleware contracts that must exist:**
1. **Health/discovery** — ONEVibe asks ONEComputer "what are you capable of?" and routes accordingly
2. **Connector brokerage** — ONEVibe says "this task needs GitHub + Jira" and ONEComputer brokers credential release under VTI consent
3. **Sandbox execution** — ONEVibe says "run this agent" and ONEComputer provisions the sandbox, injects the VTA device identity, and streams events back
4. **Approval relay** — ONEComputer holds a request and pushes an approval card to ONEVibe; the user acts in ONEVibe; ONEComputer receives the decision and releases/drops the request
5. **Audit feed** — ONEVibe subscribes to ONEComputer's audit stream and renders governance events inline in the task view

### Middleware contracts

- [ ] **P11-01** `GET /api/middleware/capabilities` — ONEComputer endpoint that returns: connector catalogue (id, name, auth-status per user), sandbox backends (Kasm/Daytona/e2b, reachable/count), VTI status (key loaded, community enrolled), approval queue depth, gateway health. ONEVibe calls this on startup and caches with a 30s TTL. Drives the Computers view "ONEComputer" section.

- [ ] **P11-02** `POST /api/middleware/connector/authorize` — ONEVibe sends `{ userId, agentId, connectorId, operations[], taskId }`. ONEComputer checks: (a) is there an OAuth credential for this user+connector? (b) is there a valid VTI consent grant for this agent+connector+operations? If both yes: returns a short-lived opaque `sessionToken` the agent can use to call the connector through the gateway. If no credential: returns `{ action: 'oauth_required', authUrl }`. If no consent: returns `{ action: 'consent_required', consentRequest: VtiTrustTaskEnvelope }`.

- [ ] **P11-03** `POST /api/middleware/sandbox/run` — ONEVibe sends `{ adapter, spec, agentId, connectorSessionTokens[], taskId }`. ONEComputer provisions the sandbox (Kasm/Daytona/e2b), enrols it as a VTA device, injects the session tokens as governed env vars, and streams `RuntimeEvent`-shaped SSE back to ONEVibe. This replaces ONEVibe's existing local adapter for sandboxed runtimes.

- [ ] **P11-04** Approval webhook — ONEComputer calls `POST {ONEVIBE_WEBHOOK_URL}/api/webhooks/approval` when the gateway holds a request requiring step-up. Payload: `{ approvalId, sandboxId, taskId, action, riskLevel, connectorId, requestDigest, vtcConsentEnvelope }`. ONEVibe renders an inline approval card in the active task view. User taps Approve/Deny. ONEVibe calls `POST /api/middleware/approval/:id/decision` on ONEComputer. HMAC-signed webhook with replay protection.

- [ ] **P11-05** Audit event stream — ONEComputer exposes `GET /api/middleware/audit/stream?taskId=...` as an SSE endpoint. ONEVibe subscribes per active task and projects governance events (connector call allowed/blocked, approval requested/resolved, sandbox created/destroyed) into the execution trace alongside agent events. This is the same data the CISO console shows, scoped to the current task and user.

### Gateway hardening (direct ONEComputer improvements)

- [ ] **P11-06** Fix `condition_match::matches()` — the #1 security gap. Implement the real evaluation: parse the injected VP from the request header, call `vti_signer::verify_trust_task_proof()` on the embedded VC, check `vtiVerified=true`, verify issuer DID matches `ONECLI_GATEWAY_PUBLIC_URL`, verify credential subject `connectorId` matches the request target host/path. Return `false` (deny) on any failure. Add a cargo integration test with a known-bad VC that proves deny fires.

- [ ] **P11-07** Replace cloud stubs with Azure Key Vault — the 13 `cloud/` files are one-line stubs. Wire the `cloud` feature flag to Azure Key Vault (via the `azure_key_vault` crate or `azure-identity` + REST calls) replacing `aws-sdk-kms`. `cloud/crypto.rs` should use AKV for gateway signing key storage. `cloud/cache.rs` should use Azure Cache for Redis. Document the env vars in `docs/AZURE-GATEWAY-CONFIG.md`.

- [ ] **P11-08** Gateway observability — wire `cloud/telemetry.rs` stub to Azure Monitor / Application Insights via `opentelemetry-sdk` + the OTLP exporter. Every gateway decision (allow/deny, approval hold, VC verify pass/fail) emits a span with: `connectorId`, `agentDid`, `decision`, `vtiVerified`, `latencyMs`. This is the data the CISO console needs to be live rather than seeded.

- [ ] **P11-09** Approval flow end-to-end — wire the full `auth/step-up/approve-request` → `auth/step-up/approve-response` → `auth/step-up/verify-actor` chain in production code (not just workflow fixtures). The gateway holds the HTTP request, emits the `VtiTrustTaskEnvelope` to the VTC transport, receives the signed response, calls `verify_trust_task_proof()` on it, and releases/drops the held request. Write an integration test that drives the whole loop with a real (dev) VTA.

- [ ] **P11-10** Gateway request idempotency — currently a held approval request can be double-released if two approval responses arrive within the same TTL window (a replay attack or network retry). Wire the `approvalId` into a Redis/DB idempotency key: first release wins, subsequent attempts return `409 Already decided`. This closes the replay attack surface on approval responses.

### ONEVibe middleware client

- [ ] **P11-11** `server/onecomputer-client.ts` — a typed client in ONEVibe's API server that wraps all five middleware contracts (P11-01 through P11-05). Configured via `ONECOMPUTER_URL` + `ONECOMPUTER_HMAC_SECRET`. Gracefully degrades: if `ONECOMPUTER_URL` is unset, ONEVibe runs in standalone mode (local adapters, no connector brokerage, no governance events). Never import ONEComputer types directly — only the contract shapes defined in `ONECOMPUTER-MIDDLEWARE-CONTRACT.md`.

- [ ] **P11-12** `ONECOMPUTER-MIDDLEWARE-CONTRACT.md` — the versioned API contract document. Every endpoint, request/response shape, error codes, webhook payload, and SSE event type. Semantic versioning on the contract. ONEVibe depends on the contract version, not the ONEComputer implementation. This is the document both teams build against.

---

## Phase 12 — Project board: humans + AI agents sharing a task queue
**Target: ONEVibe becomes a workspace for managing multiple concurrent agent runs, not just a single-chat interface.**
**Design reference: `docs/SYMPHONY-IDEAS-DESIGN-STUDY.md` (Linear/Symphony screenshots)**
**Key insight from screenshots: AI agents are first-class assignees in Linear — tasks can be assigned to agents, and the board filters by agent/agent-session. ONEVibe should do the same.**

- [ ] **P12-01** Project board view — Kanban + List toggle. Tasks grouped by status columns (Todo / In Progress / Done / Blocked). Each column has a count badge and `+` add button. Cards show: priority icon, task ID, truncated title, project tag chip, date, agent-assigned indicator if running. Toggle between Kanban columns and flat list view. Route: `/projects/:id/board`. The board is the primary entry point for investment professionals managing multiple parallel research tasks.

- [ ] **P12-02** Task metadata enrichment — add structured metadata fields to tasks: `priority` (Urgent / High / Medium / Low), `labels` (string array), `projectId` (existing), and `brief` (a structured Scope + Acceptance block replacing the unstructured first message). Expose these in the task creation form and task detail panel. Store in the task record (SQLite + Postgres-compatible). Priority and labels show as chips in the task card and list row.

- [ ] **P12-03** Agent assignment on tasks — tasks can be assigned to: (a) an AI agent (claude / codex / kimi-k3 / etc.), (b) a human user, or (c) both (human reviews agent output). When a task is assigned to an agent and the agent starts running, the card auto-moves to In Progress. When the run completes, the card moves to Done. The board's In Progress column shows all currently-running agent tasks live, with a `● live` indicator. An "Active now" cross-project panel (below the project board) shows all concurrent agent runs at a glance. Filter on the board: `Agent` (which agent) and `Agent Session` (specific run) — matching the Linear filter pattern in `symphony-C-board-agent-filter.png`.

- [ ] **P12-04** Epic / project hierarchy breadcrumbs — when a task belongs to a project (already exists), show the project name as a breadcrumb in the task list and task detail header: `ONEVibe › Q3 Research › Task title`. For tasks nested under an epic (sprint group), show: `Project › Epic › Task`. Low visual weight — small text, no bold.

- [ ] **P12-05** Inline status and priority chip pickers — in the task card (board view) and task list row, the status and priority are clickable chips that open an inline dropdown picker (no modal, no page navigation). Status: Todo → In Progress → Done → Blocked → Cancelled. Priority: Urgent / High / Medium / Low. Update via `PATCH /api/tasks/:id` (status and priority fields). Matching the frictionless Linear interaction model.

- [ ] **P12-06** "Active now" cross-project panel — a persistent section in the ONEVibe home and sidebar showing all currently-running agent tasks across all projects. Each entry: `● live` indicator, agent name, truncated task title, project tag, elapsed time. Clicking opens the task in the board/detail view. Maximum 5 entries visible; "View all" expands. This is how an investment professional sees "what are my agents doing right now" without opening each project individually.

---

## Phase 13 — Wild exploration: agent intelligence, memory, and agent spawning
**Target: before we harden the sandbox, understand the ceiling. What's actually possible? Push the boundary. Prototype fast, learn hard, document everything. All exploration runs on Azure VM (23.102.117.5) — not the local Mac.**
**Key insight: we want ONEVibe to be a platform where you can summon any agent — Hermes, NanoClaw, a custom fine-tune — by name, give it a task, and it runs. That's the vision. This phase proves whether it's real.**

### P13-A — GBrain: TypeScript-native agent memory + knowledge graph
**What it is:** GBrain (github.com/garrytan/gbrain) is a pure TypeScript brain layer for AI agents. Self-wiring knowledge graph that extracts typed relationships (`works_at`, `invested_in`, `founded`) on every write with zero extra LLM calls. Stack: pgvector HNSW + BM25 + reciprocal-rank fusion. 43 built-in skills. +31.4 points P@5 over vector-only RAG. Includes a Minions job queue for durable multi-agent execution.**
**Why this matters for ONEVibe:** it's Postgres-native, TypeScript, MIT, and designed for exactly the multi-agent + multi-user scenario we're building. This could become the memory layer behind every ONEVibe agent.**

- [ ] **P13-01** GBrain spike on Azure — SSH into Azure VM. Clone GBrain. Get it running against the existing Postgres instance. Ingest 5 sample investment research documents. Query: "what companies has analyst X researched?" Verify the relationship graph is populated. Write `docs/GBRAIN-SPIKE.md`: setup steps, what worked, what didn't, latency, memory overhead.

- [ ] **P13-02** GBrain × ONEVibe memory prototype — wire GBrain as an optional memory backend for ONEVibe. When a task completes, auto-ingest the conversation + artefacts into GBrain. New task composer shows "Remembered context" chips (entities GBrain surfaced from prior sessions). Server endpoint: `POST /api/memory/ingest`, `GET /api/memory/context?q=...`. Write `docs/GBRAIN-INTEGRATION.md`.

- [ ] **P13-03** GBrain Minions for durable subagent jobs — use GBrain's Minions queue to dispatch durable background tasks from ONEVibe. A task marked "delegate" spawns a Minion that runs to completion even if the browser closes. Minion status streams back via SSE. This is the first step toward true async agent execution without a sandbox. Write `docs/GBRAIN-MINIONS.md`.

### P13-B — Graphiti: temporal knowledge graph (the "what did the agent used to know?" layer)
**What it is:** Graphiti (github.com/getzep/graphiti, 28,900 stars) stores facts as triplets with temporal validity windows — when a fact changes, the old one is invalidated but preserved. Sub-second hybrid retrieval: semantic + BM25 + graph traversal. Python service (no TS SDK), call via Zep managed API or local proxy. Requires Neo4j or FalkorDB.**
**Why this matters:** investment research context changes. A company's CEO changes. A fund's thesis shifts. Graphiti tracks what was true when — critical for audit and for agents that need to reason about stale vs current context.**

- [ ] **P13-04** Graphiti spike on Azure — install Graphiti + FalkorDB on Azure VM. Ingest 10 episodes of simulated investment research (company updates over 6 months). Query: "what was the thesis on Company X in Q1 vs Q3?" Verify temporal invalidation works. Write `docs/GRAPHITI-SPIKE.md`: setup, latency, storage requirements, FalkorDB vs Neo4j comparison.

- [ ] **P13-05** Graphiti MCP server — Graphiti ships an MCP server. Wire it into ONEVibe's MCP config so agents can call `graphiti_search`, `graphiti_add_episode`, `graphiti_get_entity` as tools during a task run. Test: ask an agent "what do we know about SoftBank's portfolio?" — watch it query the temporal graph. Write `docs/GRAPHITI-MCP.md`.

### P13-C — Agent spawning: summon any agent by name
**What it is:** the A2A Protocol (google/A2A, 24,800 stars, Linux Foundation, Apache 2.0) defines Agent Cards — JSON capability declarations that let you discover and invoke any agent over HTTP. Bedrock AgentCore Runtime is the AWS implementation. Together they sketch what a vendor-neutral agent registry looks like.**
**The wild vision: ONEVibe has a "Summon Agent" button. You pick Hermes (NousResearch Llama fine-tune, great at tool use), NanoClaw (Claude-based, your existing agent), GPT-4o-mini (cheap, fast), or a custom fine-tune. ONEVibe spins it up on Azure via the AgentCore runtime or a self-rolled A2A container, gives it the task brief + GBrain memory context, and streams the result back. Multiple agents can run in parallel on the same task (agent debate / ensemble). This is the multi-agent future.**

- [ ] **P13-06** A2A protocol spike — implement a minimal A2A Agent Card server in TypeScript (express + JSON-RPC 2.0). Register two agents: `claude-sonnet` and `kimi-k3`. ONEVibe's task runner calls the A2A endpoint instead of hitting the runtime adapter directly. Verify: task dispatch, streaming response, capability discovery. Write `docs/A2A-SPIKE.md`.

- [ ] **P13-07** Hermes agent on Azure — deploy NousResearch Hermes-3 (Llama-3.1 fine-tune, strong function calling) via vLLM on Azure VM. Register it as an A2A agent in ONEVibe. Test: assign a task to "hermes" from the project board (P12-03 agent picker). Watch it run via the same runtime adapter interface. Write `docs/HERMES-AGENT.md`.

- [ ] **P13-08** NanoClaw agent card — NanoClaw (your existing Claude-based agent in `~/nanoclaw-v2`) already exists. Give it an A2A Agent Card. Register it in ONEVibe's agent registry. From the project board, you can now assign a task to "nanoclaw" and it routes to the real NanoClaw agent. Write `docs/NANOCLAW-A2A.md`.

- [ ] **P13-09** Agent ensemble / debate mode — on a task, allow assigning 2–3 agents simultaneously. Each runs independently. Their outputs appear as parallel branches in the task view (think: "Agent A says X, Agent B says Y"). A synthesis agent (or the user) picks the best answer. This is the wild one — real multi-agent debate from a single ONEVibe task. Write `docs/AGENT-ENSEMBLE.md`.

- [ ] **P13-10** Agent marketplace page in ONEVibe — a "Summon Agent" page showing all registered A2A agents: name, model, capabilities, latency, cost/token. Click to make it available for task assignment in the project board. One-click deploy from a curated registry (Hermes, NanoClaw, Claude, Kimi, Codex, custom). This is the ONEVibe equivalent of the Hugging Face model hub — but for runnable agents, not weights. Write `docs/AGENT-MARKETPLACE.md`.

### P13-D — Synthesis: what did we learn?
- [ ] **P13-11** Phase 13 synthesis doc — after all spikes complete, write `docs/P13-EXPLORATION-SYNTHESIS.md`: what worked, what didn't, what's production-viable, what needs sandbox hardening first (feeds Phase 8 scoping), and the recommended architecture for the ONEVibe agent intelligence layer going forward. This is the input to Phase 8 — we learn first, harden second.

---

## Phase 14 — Univer SDK: agent-native spreadsheets and slides
**Target: agents in ONEVibe can produce, edit, and stream live spreadsheets and presentations as first-class artefacts — not static file downloads. An agent researching a company outputs a live, editable sheet directly in the task view. Git-style commit history means every agent edit is diffable and reversible.**
**Univer:** `github.com/dream-num/univer` · 13k stars · Apache-2.0 core · React 18 · `@univerjs/*` packages · `univer-mcp` for natural-language sheet control · headless Node.js runtime for server-side agent workflows.**

- [ ] **P14-01** Univer Sheets integration spike — install `@univerjs/preset-sheets-core` and render a basic spreadsheet in the ONEVibe artefact panel (where files currently show). Goal: an agent can produce a `.xlsx`-equivalent workbook as a task artefact and the user sees a live interactive sheet, not a download link. Wire the Univer headless engine on the server side (`@univerjs/core` + Node.js) so agents can manipulate workbooks programmatically. Write `docs/UNIVER-SPIKE.md`.

- [ ] **P14-02** Agent → sheet output — extend the `RuntimeEvent` artefact type to include `univer_sheet` as a workbook payload (JSON snapshot of a Univer workbook). When an agent emits a `univer_sheet` event, the task artefact panel renders it as a live Univer Sheet component instead of a file card. Agents can push incremental updates (row inserts, formula changes) as follow-up events — the sheet updates live without a full reload.

- [ ] **P14-03** `univer-mcp` wiring — wire the `univer-mcp` MCP server into ONEVibe's MCP config so agents can control sheets via natural language tool calls (`create_sheet`, `write_range`, `apply_formula`, `add_chart`). Test: give an agent a research task and watch it produce a formatted comparison table via MCP tool calls. Screenshot evidence. Write `docs/UNIVER-MCP.md`.

- [ ] **P14-04** Univer Slides integration spike — Slides is still maturing in the OSS tier. Evaluate current state: can we render a basic presentation? Can an agent write slides programmatically? If the OSS tier is sufficient: wire `@univerjs/slides` into the artefact panel alongside Sheets. If not: document what's missing and set a revisit date. Write `docs/UNIVER-SLIDES-SPIKE.md` with honest verdict.

- [ ] **P14-05** Git-style sheet history in task artefacts — Univer's collaborative model tracks every edit as a reversible operation. Expose this in the ONEVibe task artefact panel: a "Sheet history" timeline showing each agent edit (timestamp, description, diff summary). User can click any point to restore. This is the artefact audit trail for investment professionals — "show me exactly what the agent changed in this model."

---

## Phase 15 — OpenCowork feature parity
**Target: rigorous study of AIDotNet/OpenCowork (`github.com/AIDotNet/OpenCowork`, 563 stars, Apache-2.0, Electron + React 19) and systematic port of every capability that ONEVibe lacks or does partially. OpenCowork is the most feature-complete open-source AI cowork desktop runtime. ONEVibe's advantage is web-first, multi-user, cloud-connected, and governed — but OpenCowork has deep agent UX patterns worth learning from and matching.**
**Method: study → gap-list → implement in priority order → verify feature parity per item. No shortcuts. Each item gets a screenshot comparison: OpenCowork vs ONEVibe.**

### P15-A — Study and gap analysis
- [ ] **P15-01** Deep feature audit — clone `AIDotNet/OpenCowork`, run it locally (Electron), and produce `docs/OPENCOWORK-AUDIT.md`: full feature inventory with screenshot evidence, mapped against ONEVibe's current state. Column per feature: OpenCowork behaviour → ONEVibe current state → gap size (none / partial / missing). Also reference `Safphere/opencowork` (332 stars) and `opencowork-ai/opencowork` (64 stars, VM-level sandboxing) for any features the AIDotNet version lacks.

### P15-B — Agent modes and plan mode
- [ ] **P15-02** Agent modes — OpenCowork has 4 modes: `clarify` (ask clarifying questions before acting), `cowork` (collaborative, human in the loop), `code` (pure coding agent), `acp` (architecture lead, plans before implementing). Add a mode selector to ONEVibe's task creation flow. Each mode sets the agent's system prompt posture and controls when it pauses for user input vs runs autonomously.

- [ ] **P15-03** Plan Mode — before executing a non-trivial task, the agent enters Plan Mode: writes out its intended approach as a reviewable plan, pauses, and waits for user approval (`EnterPlanMode` / `ExitPlanMode` pattern from OpenCowork). User can edit the plan inline. Only after approval does the agent execute. This is the most important UX safety gate for professional users who need to review before the agent touches anything.

### P15-C — Memory system
- [ ] **P15-04** Global agent memory (SOUL/USER/MEMORY) — implement the OpenCowork memory model: `SOUL.md` (agent's personality/values, operator-set), `USER.md` (what the agent has learned about this user, auto-updated), `MEMORY.md` (indexed knowledge store with per-entry recall score). Expose `USER.md` and `MEMORY.md` in the ONEVibe Memory page (P9-22) as editable entries with "Learned on" timestamps. `SOUL.md` is admin-only.

- [ ] **P15-05** Per-project memory override — each ONEVibe project can have a `.agents/` folder with project-scoped memory that overrides global memory for tasks within that project. Useful for investment research: project "TSMC Q3 Research" has its own context that doesn't bleed into "Portfolio Review."

### P15-D — Team tools and multi-agent messaging
- [ ] **P15-06** Team tools (`TeamCreate`, `SendMessage`, `TeamStatus`) — agents can spawn named sub-agent teams for parallel work within a single task. The task view shows a "Team" panel with each active sub-agent, their current status, and their output stream. Sub-agents report back to the lead agent. This closes the gap with OpenCowork's parallel delegation pattern.

- [ ] **P15-07** Messaging integrations — OpenCowork supports 8 messaging channels (Feishu, DingTalk, Discord, Telegram, WeCom, WhatsApp, WeChat Official, QQ). ONEVibe should support at minimum: **Slack** (most relevant for investment/banking), **Teams** (enterprise), and **Telegram** (personal). Wire these as notification + command channels: agent sends a task completion summary to Slack; user can reply to continue the task from Slack.

### P15-E — Built-in browser and SSH remote
- [ ] **P15-08** Built-in browser tool — OpenCowork's browser tool (`navigate`, `snapshot`, `click`, `type`, `content extract`) runs inside the agent loop as a native tool, not via MCP. ONEVibe should expose the same capability: a `browser` tool that agents can call directly (backed by Playwright headless, which we've already installed). Snapshot returns the accessibility tree; click/type interact with live pages. This enables agents to do web research, form submission, and scraping inline.

- [ ] **P15-09** SSH remote host management — OpenCowork allows registering remote SSH hosts; agents can run `Bash` commands on them directly. Wire this into ONEVibe: a "Remote Hosts" section in Computers view where users can register SSH credentials. The Azure VM (23.102.117.5) is the first entry. Agent tasks can specify `remoteHost: azure` to run bash commands on the registered server instead of local.

### P15-F — Cron agent and goal tracking
- [ ] **P15-10** Cron agent — ONEVibe has scheduled tasks, but OpenCowork's Cron Agent runs persistent background agents on a schedule with full tool access. Wire a `CronAgent` mode into the scheduler: tasks scheduled with this mode get a full agent runtime on each trigger (not just a prompt — a real agentic run with tools, memory access, and artefact output).

- [ ] **P15-11** Goal tracking with token budget — OpenCowork tracks agent goals and token consumption per run. Add a goal statement field to tasks (`goal: "Summarise all Q3 earnings calls for the portfolio"`) and a token budget cap per run. The task view shows goal progress, tokens used vs budget, and a "Goal achieved?" verdict from the agent at completion.

### P15-G — Custom plugins and i18n
- [ ] **P15-12** Custom plugin tools — OpenCowork supports declarative HTTP tools (define a REST endpoint as an agent tool via JSON), sandboxed JS handlers, and custom HTML renderers. Port this as ONEVibe's "Custom Tool" builder: a UI where users define HTTP tools (URL, method, headers, body template) that become available to agents as callable tools. No code required. Investment use case: wire a Bloomberg terminal API as a custom tool.

- [ ] **P15-13** Full i18n parity — OpenCowork supports 13+ languages. ONEVibe has `en` and `zh` in `src/lib/i18n.ts`. Extend to at least: `ja` (Japanese), `ko` (Korean), `de` (German), `fr` (French), `es` (Spanish), `ar` (Arabic, RTL). Wire a language picker in settings. Investment/banking users are global.

### P15-H — Feature parity sign-off
- [ ] **P15-14** Parity sign-off doc — after all items complete, produce `docs/OPENCOWORK-PARITY.md`: side-by-side feature table, screenshot evidence for each item, and a clear statement of where ONEVibe exceeds OpenCowork (web-first, multi-user, OAuth connectors, VTI governance, Univer sheets, A2A agent spawning) and where parity was achieved. This is the document that says "we studied the best open-source reference and matched it."

---

## Phase 16 — Vertical mini-apps: governed AI workflows for knowledge-work sectors
**Business objective: ONEVibe becomes the horizontal platform for AI adoption in sectors where AI has historically been blocked — not by capability, but by missing human-in-the-loop controls, audit trails, and multi-party governance. The sectors with the highest AI potential and the lowest current adoption are Accounting/Audit, Law, Finance/IB, and Compliance. Every one of them is blocked by the same missing layer: named human sign-off with an immutable timestamp, at the right point in the workflow. ONEVibe's governance stack (VTI identity, approval cards, CISO audit console) is exactly that layer. The task is to wrap it in vertical-specific workflow UX.**
**Model: WeChat/Alipay mini-programs for enterprise B2B. Each vertical ships as an extensible mini-app that embeds inside ONEVibe — sharing its IAM (SSO/SAML), permission model, data namespace, and audit trail. The host platform owns the compliance perimeter. Individual mini-apps are domain-specific but never create a shadow audit trail.**
**Key insight from research: the audit trail IS the product. Every sector's human-in-the-loop requirement is legally attached to a named individual. The platform must capture: who reviewed, at what timestamp, what version, what their explicit approval was, and what they saw when they approved. This is the approval card as a compliance artefact.**
**White space: no existing tool combines cross-team kanban (visible to multiple parties), AI agent execution with monitoring, named approval cards with immutable timestamps, and a shared audit trail across org boundaries. Harvey has no workflow. Workiva has no AI agents. GRC platforms have no AI layer. ONEVibe can be all three.**

### P16-0 — Mini-app platform foundation + default app library
- [ ] **P16-00** Default mini-app library — ONEVibe ships a curated set of out-of-the-box mini-apps that cover universal needs. Every org gets these on day one, no configuration required. Defaults activate based on the org's selected vertical profile at onboarding. Universal defaults (all orgs): News & Announcements, My Tasks / Action Queue, People Directory + Org Chart, HR Self-Service (PTO/payslip/leave), IT Service Desk, Company Calendar, Document Library with "verified on [date]" badges, New Employee Onboarding Checklist. Vertical-activated defaults: **Finance** adds Budget vs Actuals, AP/AR queue, Month-End Close Checklist, Regulatory Filing Calendar; **Legal** adds Matter Tracker, Contract Review Queue, NDA Request Form; **Sales** adds Pipeline Widget (Salesforce-connected), Deal Alerts, Commission Tracker; **HR** adds Open Requisitions Dashboard, Performance Review Cycle, Headcount View; **IT** adds Incident Queue, Change Request Calendar, Asset Inventory. Any end user or knowledge worker can "vibe" a new mini-app into existence via the AI builder (see P17). Write `docs/DEFAULT-MINI-APPS.md`.

- [ ] **P16-01** Mini-app host contract — define the extensibility API that all vertical mini-apps share: (1) **Auth contract**: ONEVibe issues scoped JWT to the mini-app encoding user identity, org, role, and data entitlements — the mini-app never manages auth itself; (2) **Data isolation contract**: each mini-app operates within a tenant + module namespace, cross-module data access requires explicit grants; (3) **Audit event bus**: every action in a mini-app emits a structured event to ONEVibe's audit log — the host owns the immutable trail; (4) **Approval card protocol**: mini-apps can request a named human approval via a standard `POST /api/approvals` call — the approval is rendered as an ONEVibe card, timestamped, signed with VTI, and stored as a compliance artefact. Document in `docs/MINI-APP-CONTRACT.md`.

- [ ] **P16-02** Mini-app shell component — a `MiniAppShell` React component that hosts any vertical module: title bar with breadcrumb (`ONEVibe › [Vertical] › [Workflow]`), permission boundary indicator, audit trail sidebar (collapsible: last 10 events with timestamps and actor), and an approval queue strip at the top when pending approvals exist for this session. This is the chrome every mini-app inherits. No vertical implements its own nav or auth.

- [ ] **P16-03** Workflow agent template — a server-side `WorkflowAgent` class that wraps any `RuntimeAdapter` with workflow-specific behaviour: step definitions, required approvals per step, who can approve each step (role-based), blocking logic (step N cannot start until step N-1 has a signed approval), and receipt generation (VTI-signed record of each approval event). This is what makes an AI agent safe for regulated workflows — it cannot proceed past a gate without the signed approval artefact.

### P16-A — Legal mini-app
**Target users: law firm associates, partners, in-house counsel. Biggest pain: multi-party contract redlining, court filing certification, engagement letter sign-off.**
**Gap vs Harvey AI: Harvey has no cross-party kanban, no structured attorney sign-off card, no shared audit trail visible to client. ONEVibe adds the governance layer Harvey is missing.**

- [ ] **P16-04** Contract redlining workflow — a mini-app for multi-party contract negotiation. A matter is a project on the ONEVibe board. Each round of redlines is a task assigned to an agent (`redline-agent`). The agent proposes changes; a responsible attorney reviews the diff in a side-by-side view (original left, proposed right, tracked changes highlighted). The attorney approves each position change individually — each approval is timestamped, signed with the attorney's VTI identity, and immutably stored. When all positions are approved, the agent sends the revised document to the counterparty. No draft leaves the firm without a named attorney approval. Write `docs/LEGAL-REDLINING-WORKFLOW.md`.

- [ ] **P16-05** Court filing certification workflow — before any court filing is submitted, the mini-app requires: (1) agent drafts the document; (2) responsible attorney reviews the full text in an inline viewer; (3) attorney clicks "Certify under FRCP Rule 11" — this creates a signed VTI artefact recording: attorney DID, document hash, timestamp, certification statement. The filing cannot be submitted without this artefact. The artefact is stored as evidence in the task. Write `docs/LEGAL-FILING-WORKFLOW.md`.

- [ ] **P16-06** Conflict check and matter opening — when a new matter is opened, the mini-app runs a conflict check agent (searches existing matters and client lists), surfaces potential conflicts, and requires a partner to review and clear each flag before the matter opens. The clearance is a signed approval card. No matter opens without a cleared conflict record.

### P16-B — Accounting / Audit mini-app
**Target users: audit associates, seniors, managers, engagement partners, Engagement Quality Reviewers (EQRs). Biggest pain: tiered workpaper review chain, EQR sign-off, management rep letter, SOX certification.**
**Gap vs Workiva: Workiva is strong on document approvals but has no AI agent layer and no real-time task board. ONEVibe adds agents + monitoring.**

- [ ] **P16-07** Tiered workpaper review workflow — each workpaper is a task on the audit kanban board. An AI agent prepares the workpaper and initial commentary. It then moves to the review queue: senior → manager → partner, each level requiring a dated sign-off with review notes. The agent can address review comments automatically (e.g. "recalculate the ratio per the manager's note") but cannot advance the workpaper to the next stage without the current reviewer's signed approval. The board shows the full audit file as a kanban: Prepared / Senior Review / Manager Review / Partner Review / EQR / Signed Off. Write `docs/AUDIT-WORKPAPER-WORKFLOW.md`.

- [ ] **P16-08** Engagement Quality Review (EQR) gate — the final stage before an audit opinion is issued. The EQR is a named partner who has not been involved in the engagement. The mini-app presents the EQR with: a summary of significant judgments, the workpaper evidence for each, and any open issues. The EQR must individually review and sign off each significant judgment. The audit opinion cannot be released until all EQR sign-offs are recorded. Each sign-off is a VTI-signed artefact. Write `docs/AUDIT-EQR-WORKFLOW.md`.

- [ ] **P16-09** SOX 302/906 certification workflow — for public company clients. The agent assembles the internal controls evidence package (ICFR documentation, testing results, deficiency summaries). The CFO and CEO review in the mini-app and click "Certify under SOX Section 302/906." The certification creates a signed artefact including: executive DID, evidence package hash, timestamp, and the statutory certification statement. False certification risk is surfaced explicitly at the point of signing — the UI shows the criminal penalty text. Write `docs/AUDIT-SOX-WORKFLOW.md`.

### P16-C — Finance / Investment Banking mini-app
**Target users: analysts, associates, VPs, MDs, credit officers, fairness opinion committees. Biggest pain: credit memo approval chain, pitch book sign-off, FINRA-supervised communications.**
**Gap vs existing tools: no tool covers the deal approval chain (credit memo → credit committee → term sheet → commitment letter) with agent-assisted drafting + named human sign-off + counterparty collaboration.**

- [ ] **P16-10** Deal workflow kanban — a deal is a project. Stages: Origination → Due Diligence → Credit/IC Approval → Term Sheet → Commitment Letter → Closing. Each stage is a column on the board. Tasks within each stage can be assigned to AI agents (research, drafting, modelling) or humans (review, negotiation, sign-off). The board is visible to the deal team — no more email threads to track who has reviewed what. Write `docs/IB-DEAL-WORKFLOW.md`.

- [ ] **P16-11** Credit memo and credit committee workflow — the agent drafts the credit memo from deal data and diligence artefacts. A named credit officer reviews, annotates, and submits it to the credit committee queue. Credit committee members each record their vote (approve / approve with conditions / decline) as signed approval cards. The commitment letter cannot be issued until a quorum of credit committee approvals is recorded. OCC SR 11-7 model risk validation step is built in: if the credit memo uses an AI risk score, a model risk manager must validate the model before the memo is submitted. Write `docs/IB-CREDIT-WORKFLOW.md`.

- [ ] **P16-12** FINRA-supervised communications workflow — all client-facing communications (pitch materials, research notes, marketing emails) must be approved by a registered principal before distribution. The agent drafts the communication; the registered principal reviews it in the mini-app and clicks "Principal Approval — FINRA Rule 3110." The approval is signed, timestamped, and stored. The communication cannot be sent without the approval artefact. FINRA exam requests for these records can be fulfilled by exporting the artefact log. Write `docs/IB-FINRA-WORKFLOW.md`.

### P16-D — Compliance / RegTech mini-app
**Target users: CCOs, compliance analysts, BSA officers, AML teams, DPO, GRC managers. Biggest pain: SAR decisions, KYC re-certification, policy exception approvals, regulatory filings.**
**Gap vs existing tools: ComplyAdvantage flags for review but has no integrated sign-off workflow. GRC platforms have no AI agent layer. ONEVibe connects the AI screening to the human sign-off in one place.**

- [ ] **P16-13** SAR decision workflow — the AML monitoring agent flags a suspicious transaction and produces a preliminary SAR filing recommendation with supporting evidence. A named compliance officer reviews the recommendation, the underlying transaction data, and the agent's reasoning. They click "Authorize SAR Filing" or "Decline to File with documented basis." Both decisions are signed artefacts. The filing cannot be submitted or suppressed without the compliance officer's signed decision. Civil penalty exposure ($1M/violation) is displayed at the decision point. Write `docs/COMPLIANCE-SAR-WORKFLOW.md`.

- [ ] **P16-14** Policy exception approval workflow — when a transaction or client activity triggers a policy exception, the agent documents the exception basis and routes it to the named compliance officer. The officer reviews, approves or denies, and records the basis in writing — all within the mini-app. The exception record is a signed artefact. Regulatory examiners can query the exception log by date range, policy, and approving officer. Write `docs/COMPLIANCE-EXCEPTION-WORKFLOW.md`.

- [ ] **P16-15** KYC/CDD re-certification workflow — the agent identifies high-risk customers due for periodic re-certification, pulls the updated risk signals, and prepares a re-certification package. A compliance officer reviews the updated risk profile and clicks "Re-certify" or "Escalate." The re-certification is a signed artefact. The customer record is not updated until the sign-off is recorded. FinCEN CDD rule compliance is the explicit framing. Write `docs/COMPLIANCE-KYC-WORKFLOW.md`.

### P16-E — Cross-vertical infrastructure
- [ ] **P16-16** Multi-party workspace — extend ONEVibe's project model to support cross-org collaboration: an audit firm and its client share a workspace with scoped visibility (auditors see everything; client sees only their deliverables and their own sign-off queue). Each party authenticates with their own SSO. The audit trail records which org each action came from. This is the first ONEVibe feature that spans organisational boundaries — the foundation for the platform network effect.

- [ ] **P16-17** Compliance artefact export — a single "Export for regulators" action on any workflow produces a structured package: all approval artefacts (VTI-signed), the document versions they approved, the agent's reasoning log, and a manifest with timestamps and actor DIDs. Format: PDF/A (for human reviewers) + JSON-LD (for machine ingestion). FINRA, PCAOB, SEC, and FinCEN examiner requests are answered by running this export. Write `docs/COMPLIANCE-ARTEFACT-EXPORT.md`.

- [ ] **P16-18** Vertical workflow template library — a curated library of pre-built workflow templates for each sector (Audit EQR, FINRA principal approval, credit committee, SAR decision, etc.). New firms onboard by selecting a template and configuring: approver roles, escalation paths, deadline rules, and notification channels. The template defines the approval card sequence; the `WorkflowAgent` enforces it. Write `docs/WORKFLOW-TEMPLATE-LIBRARY.md`.

---

## Phase 17 — ONEVibe as the world's best intranet: AI-powered super-app for every employee
**Business objective: replace SharePoint, Confluence, and every fragmented intranet portal with a single, beautiful, AI-native super-app that every employee actually uses. The intranet has been broken for 30 years — SharePoint is navigated like an IT storage system, Confluence is a digital landfill, Viva Connections requires SPFx developers to add a single card type. ONEVibe fixes all of this by making the whole platform customisable through vibe. A business administrator — not a developer, not IT — can open ONEVibe, describe what they want, and the AI builds it.**
**Model: WeChat/Alipay mini-programs × Salesforce Experience Builder × Framer AI. The platform owns the component library and the compliance perimeter. The admin vibes the layout. The employee personalises within their role defaults. No code, ever, for configuration.**
**Why we win: SharePoint fails on navigation (IT storage metaphor, 5-7 click depth), search (zero typo tolerance, mixes docs/people/tools), personalisation (same page for everyone), and authoring (requires SPFx developer for any custom card). ONEVibe solves all four structurally: task-based nav, semantic search, role-based defaults with user override, and AI vibe-to-build for any new widget.**

### P17-A — Portal canvas and vibe builder
- [ ] **P17-01** Portal canvas — the ONEVibe home page becomes a fully customisable portal canvas. Layout: a 12-column responsive grid (Retool-style snap-to-grid). Admins drag widgets from a component library panel onto the canvas, resize by dragging corners, and reorder by dragging. Each widget is a mini-app card or a standalone data widget. The canvas has three breakpoints: Desktop, Tablet, Mobile — the admin can set different layouts per breakpoint. Changes are live-previewed before publishing. Write `docs/PORTAL-CANVAS.md`.

- [ ] **P17-02** AI vibe builder — a business admin can open the portal editor, type a natural language request ("show my finance team's month-end close checklist, the AP/AR queue, and the regulatory filing calendar in a three-column layout with our brand colours"), and the AI: (1) selects the relevant widgets from the component library; (2) proposes a grid layout; (3) applies the org's brand tokens. The admin can accept, tweak, or reject. No code involved at any point. This is Framer AI applied to enterprise portals. The AI acts as a layout configurator, not a code generator — it assembles from the existing component library, it never invents new components. Write `docs/VIBE-BUILDER.md`.

- [ ] **P17-03** Role-based default layouts — five persona archetypes ship out of the box: **Frontline Worker** (mobile-first, quick links, HR self-service, shift calendar), **Knowledge Worker** (tasks, docs, search, team feed), **Manager** (team pipeline, approval queue, headcount widget, performance cycle), **Executive** (company metrics, cross-org activity feed, compliance status), **IT Admin** (incident queue, change calendar, asset inventory, patch status). At first login, the user is assigned a persona based on their HR record / role. Their portal opens with the matching default layout. They can then personalise within it — add, remove, reorder widgets — without affecting the org-wide template. Admins can "push" an updated default to a persona without wiping individual customisations. Write `docs/PERSONA-DEFAULTS.md`.

- [ ] **P17-04** Brand theming by admin — a non-technical admin can set the entire portal's visual identity in under 5 minutes: upload logo (PNG/SVG), enter or pick primary colour (hex or colour wheel), choose a font pair from a curated list of 12 (no arbitrary font loading — security boundary), select a border-radius preset (Sharp / Rounded / Pill), and set a background tone (Light / Warm / Dark). All widgets and mini-apps inherit these five tokens globally via the ONEVibe CSS token system. No per-component overrides. One panel, five inputs, done. Write `docs/BRAND-THEMING.md`.

### P17-B — Navigation and search (fixing what SharePoint broke)
- [ ] **P17-05** Task-based navigation — replace the default hierarchy-based sidebar (Sites > Libraries > Folders) with a task-based navigation model. Primary nav items are verbs: **Do** (my tasks + action queue), **Find** (unified search), **Learn** (docs + policies + onboarding), **Connect** (people directory + org chart + messaging), **Build** (mini-app builder + workflows). Secondary nav is role-scoped: Finance employees see Finance-specific items; Legal employees see their matter tracker. Navigation labels are in plain employee language, not IT/admin jargon. Write `docs/TASK-BASED-NAV.md`.

- [ ] **P17-06** Unified semantic search — a single search bar searches across: documents, people, mini-app data, task history, announcements, and connected system data (Jira tickets, Salesforce records, etc.). Search is semantic (not keyword-literal) with full typo tolerance. Results are separated into lanes with clear labels (People · Documents · Tasks · Apps · External). The search box opens with a recent items list and AI-suggested queries based on the user's role and recent activity. "I need to..." prompt mode: type a task description and the AI surfaces the right mini-app or document, not a search results list. Write `docs/UNIFIED-SEARCH.md`.

- [ ] **P17-07** Content freshness system — every document and page in the portal has an owner and an expiry date. Owners receive a monthly prompt: "Is this content still current?" One click to re-verify, which updates the "Verified on [date]" badge. Content that hasn't been verified in 6 months is visually flagged as "May be outdated" (amber badge). Content older than 12 months without verification is archived (not deleted — accessible via search but not surfaced in primary navigation). This kills the digital landfill problem structurally. Write `docs/CONTENT-FRESHNESS.md`.

### P17-C — Employee self-service and personalisation
- [ ] **P17-08** Employee widget gallery — a curated gallery of ~50 pre-built widgets that any employee can add to their personal portal view. Categories: Productivity (tasks, calendar, notes), HR (PTO balance, pay, benefits), Tools (quick links to any OAuth-connected app), Data (live numbers from connected sources — budget, pipeline, ticket count), Social (team feed, announcements, recognition). Adding a widget: click "+", browse gallery, click to add — instant, no refresh. The gallery is the employee-facing equivalent of the admin's component library. Write `docs/WIDGET-GALLERY.md`.

- [ ] **P17-09** Personal portal vibe — any employee (not just admins) can type a natural language request to personalise their own view: "show me my open Jira tickets, my PTO balance, and the team announcements." The AI configures their personal widgets without touching the org-wide layout. This is the individual vibe layer on top of the role default. Permission boundary: personal vibing only affects the user's own view, never the org template. Write `docs/PERSONAL-VIBE.md`.

- [ ] **P17-10** Mobile-first portal — the portal canvas renders natively on mobile with a dedicated mobile layout mode (distinct from desktop). On mobile: bottom tab bar (Do / Find / Connect / Me), swipeable card stack for tasks and announcements, large-tap targets for HR self-service actions, and offline access for key widgets (last-synced data shown with a timestamp when offline). Frontline workers who never sit at a desktop are first-class citizens. Write `docs/MOBILE-PORTAL.md`.

### P17-D — Knowledge base and announcements
- [ ] **P17-11** AI-powered knowledge base — every policy document, process guide, and FAQ is searchable and queryable. An employee can ask "what is the travel expense policy for flights over 6 hours?" and get a direct answer sourced from the relevant policy document, with a citation link. The knowledge base agent reads the current, verified documents — not a training snapshot. It surfaces the "Verified on [date]" badge alongside every answer. When a document expires (P17-07), the knowledge base agent surfaces a disclaimer until it is re-verified. Write `docs/KNOWLEDGE-BASE.md`.

- [ ] **P17-12** Targeted announcements — admins publish announcements with audience targeting (all company / by persona / by department / by location). Announcements appear in the portal news widget and as a notification. Urgent announcements (IT outage, emergency, critical policy change) have a separate "Alert" type that appears as a banner across all portal views regardless of layout. Read receipts are tracked per announcement (useful for compliance-required communications like policy updates). Write `docs/ANNOUNCEMENTS.md`.

### P17-E — Integrations and extensibility
- [ ] **P17-13** Connected data widgets — any OAuth-connected app (from ONEVibe's 48 connectors) can surface live data as a portal widget without writing code. Examples: Salesforce pipeline as a live widget (last 5 deals, stage, close date), GitHub open PRs for engineering teams, JIRA sprint board, Outlook calendar. The widget configuration UI: select connector → select data type → configure fields shown → done. Data refreshes every 60s. Write `docs/CONNECTED-WIDGETS.md`.

- [ ] **P17-14** Custom mini-app vibe — any power user or business admin can build a new mini-app entirely through the vibe builder. They describe what they want ("I need a form where employees can request a new laptop, it goes to IT for approval, and they can track the status"), and the AI generates: the form fields, the approval workflow (using P16's WorkflowAgent), the status tracker widget, and the notification rules. The result is a fully functional mini-app deployed to the portal in minutes. No developer involved. This is the end state of the WeChat/Youzan model: the platform provides the runtime, the user provides the intent. Write `docs/CUSTOM-MINI-APP-VIBE.md`.

- [ ] **P17-15** Mini-app marketplace — a curated catalog of community and partner-built mini-apps that any admin can install into their portal with one click. Categories: HR, Finance, Legal, IT, Sales, Compliance, Operations. Each app has a screenshot preview, a "required permissions" declaration, and a security review badge (reviewed by ONEVibe). Apps in the marketplace go through the same auth/data isolation contract as first-party mini-apps — no shadow compliance perimeters. This is ONEVibe's AppExchange. Write `docs/MINI-APP-MARKETPLACE.md`.

### P17-F — The best intranet sign-off
- [ ] **P17-16** Intranet parity and differentiation doc — produce `docs/INTRANET-COMPARISON.md`: side-by-side comparison of ONEVibe vs SharePoint, Confluence, Viva Connections, and ServiceNow Employee Center on the five dimensions that matter (navigation model, search quality, personalisation, admin customisation effort, AI capability). For each dimension, evidence: either a screenshot or a concrete capability statement. This is the document that answers "why ONEVibe instead of SharePoint" for an enterprise buyer.

---

## Phase 18 — ONEVibe Mobile: the world's most secure corporate super-app + supercharged Okta
**Business objective: a beautiful, powerful, admin-customisable mobile app that is also the org's authenticator, identity wallet, and approval device. Think Okta Verify meets the company intranet — but with the security foundations of a hardware-rooted VTI identity stack, not a shared-secret OTP generator. Every employee carries it. Every agent action can require it for approval. Every connector auth flows through it.**

**What already exists in `verifiable-trust-infrastructure/vta-mobile-core` (real, not stubs):**
- **UniFFI cross-platform engine** — single Rust codebase compiles to iOS xcframework + Android AAR. Both platforms call identical APIs.
- **Secure Enclave / StrongBox key custody** — private keys never leave the hardware security module. The signing key is identified by its `did:key`, never a raw pubkey. Biometric gate (Face ID / fingerprint) is enforced at the enclave level, not the app level.
- **WebAuthn / passkey assertions via DID document** — `vti-webauthn` verifies FIDO2 assertions where the credential's public key is resolved from a DID Document `verificationMethod`, not a server-side credential registry. The DID document is the source of truth — no server-side passkey database needed.
- **AAL step-up approve-response** — `stepup.rs` builds the `auth/step-up/approve-response` Trust Task document for both WebAuthn (`build_approve_response_webauthn`) and DID-signed (`build_approve_response_did_signed`) gates. This is the signed approval artefact that ONEVibe's approval cards require.
- **DIDComm v2 pack/unpack** — `didcomm.rs` wraps the Affinidi DIDComm stack; the mobile agent can receive push-delivered approval requests over DIDComm from the VTA mediator.
- **Push wake-up** — `push.rs` handles APNs (iOS) / FCM (Android) registration so the VTA can wake the app for a pending approval even when it is backgrounded.
- **DID resolution** — `resolver.rs` resolves `did:key` / `did:peer` offline; `did:web` / `did:webvh` networked.
- **VTA session auth** — `session.rs` wraps `vta-sdk::DIDCommSession` (connect + receive_next) for mediator-connected DIDComm sessions.

**This is Okta Verify with a hardware-rooted DID identity, W3C Verifiable Credentials, and a full company intranet on top.**

### P18-A — Mobile app foundation
- [ ] **P18-01** React Native shell + VTA mobile engine bridge — bootstrap a React Native app that wraps `vta-mobile-core` via the UniFFI-generated Swift/Kotlin bindings. The app is the ONEVibe mobile client: intranet portal on the bottom half, authenticator functions on the top. The bridge exposes: `libraryVersion()`, `initLogging()`, `challengeLenBytes()`, `signChallenge()` (Secure Enclave-backed), `buildApproveResponseWebauthn()`, `buildApproveResponseDidSigned()` — the minimal FFI surface already implemented in slice 1. Write `docs/MOBILE-APP-FOUNDATION.md`.

- [ ] **P18-02** Biometric-gated DID identity setup — on first launch, the app guides the employee through: (1) org QR code scan to join the VTC community; (2) Secure Enclave / StrongBox key generation for their personal `did:key`; (3) Face ID / fingerprint enrolment as the biometric gate on the signing key; (4) passkey registration against the org's VTA (DID document updated with the new WebAuthn `verificationMethod`). After setup, the employee has a hardware-rooted DID identity that is their company identity. No shared secret. No OTP seed. Write `docs/MOBILE-IDENTITY-SETUP.md`.

- [ ] **P18-03** Admin customisation layer — corporate admins can customise the mobile app's look and feel from the ONEVibe portal admin panel (P17-04 brand theming, extended): logo, primary colour, font, background. They can also configure: which mini-apps appear on the mobile home screen, which widgets are visible, whether dark mode is forced, and which features are locked/unlocked per employee group. Changes push to all enrolled devices within 60s via the DIDComm push channel. No app store update needed for layout or branding changes. Write `docs/MOBILE-ADMIN-CONFIG.md`.

### P18-B — Supercharged authenticator (the Okta replacement)
- [ ] **P18-04** Push approval notifications — when any system (ONEVibe workflow, ONEComputer gateway, connected app) requires step-up authentication or approval, a DIDComm push message arrives on the employee's phone via APNs/FCM. The app wakes, displays the approval request with full context (what is being approved, which agent, which data, risk level), and presents a biometric-gated Approve / Deny action. The signed `auth/step-up/approve-response` Trust Task is sent back to the relying party. This is the mobile approval artefact that P16's `WorkflowAgent` gates are waiting for. Write `docs/MOBILE-PUSH-APPROVAL.md`.

- [ ] **P18-05** Passkey SSO for all org apps — employees use the mobile app as their universal passkey for every org app: ONEVibe, connected OAuth apps (GitHub, Jira, Outlook, Salesforce), and any app that supports FIDO2/WebAuthn. When a browser on any device visits an org app and requires login, the browser shows a QR code or Bluetooth proximity trigger; the mobile app biometrically confirms and returns the signed WebAuthn assertion. No password. No OTP code. No Okta Verify app. This is the app that replaces Okta for the org. Write `docs/MOBILE-PASSKEY-SSO.md`.

- [ ] **P18-06** AAL2 step-up for high-risk actions — certain agent actions and workflow approvals (SAR filing, SOX certification, credit committee vote, court filing certification) require AAL2 authentication — biometric on the enrolled device, not just a session token. The `auth/step-up/approve-request` arrives on the mobile app; the employee performs Face ID / fingerprint; the `approve-response` carries the WebAuthn assertion as evidence. The signed artefact is the legally-defensible proof that the named individual authenticated at AAL2 before approving. This is the "named individual bears personal liability" requirement from P16 solved at the authentication layer. Write `docs/MOBILE-AAL2-STEPUP.md`.

- [ ] **P18-07** Verifiable Credential wallet — the app holds the employee's W3C Verifiable Credentials issued by the org's VTC: employment credential, role credentials, community membership credentials. These are presented automatically when the VTI consent gate requires them (ONEComputer connector calls, agent actions). The employee can see all their credentials, when they were issued, and which services have requested them. This is the identity wallet that makes the VTI governance layer tangible to the end user — not invisible plumbing, but something they can inspect and understand. Write `docs/MOBILE-VC-WALLET.md`.

### P18-C — Mobile intranet portal
- [ ] **P18-08** Mobile portal canvas — the intranet portal (P17) runs natively in the mobile app, not in a webview. The bottom tab bar follows the task-based navigation model: Do / Find / Connect / Me. The home screen is the employee's role-based default layout (P17-03) rendered as a card stack optimised for mobile — large tap targets, swipeable cards, pull-to-refresh. The same widgets and mini-apps from the desktop portal are available on mobile, rendered in a mobile-appropriate layout. Write `docs/MOBILE-PORTAL.md`.

- [ ] **P18-09** Mobile mini-app runtime — vertical mini-apps (P16) run inside the mobile app via the same `MiniAppShell` contract, but with a mobile-native rendering path. Legal redlining, audit workpaper review, deal approval, SAR decision — all available on mobile. When an approval card arrives (push notification from P18-04), tapping it opens directly to the relevant mini-app with the document pre-loaded and the approval action front and centre. Write `docs/MOBILE-MINI-APPS.md`.

- [ ] **P18-10** Offline-first with secure local storage — critical data (pending approvals, personal credentials, last-synced portal content) is available offline. Sensitive data (VCs, signing keys) is encrypted at rest using the Secure Enclave key. When connectivity is restored, any offline actions (approval decisions recorded offline) sync back to the server with their timestamps preserved. This is important for investment bankers in deal rooms or lawyers in court who cannot always guarantee connectivity. Write `docs/MOBILE-OFFLINE.md`.

### P18-D — Device management and enterprise security
- [ ] **P18-11** Device enrolment and MDM integration — the app supports enterprise device management (MDM) via standard protocols (Apple Business Manager / Android Enterprise). Corporate-owned devices can be pre-provisioned with the org QR code baked in. MDM can enforce: screen lock requirements, app version pinning, remote wipe of the VTA mobile identity on device loss. The VTA `device disable` call (from `vta-mobile-core`) revokes the device's DID credential on the VTA — all approvals and SSO from that device stop working immediately. Write `docs/MOBILE-MDM.md`.

- [ ] **P18-12** Security audit trail for mobile actions — every approval, SSO event, VC presentation, and step-up authentication on the mobile app emits a structured event to the ONEVibe audit log (P16-01 audit event bus). The CISO console in ONEComputer shows: which employee, which device DID, which action, at what timestamp, with what biometric evidence type. This closes the gap that consumer authenticator apps have — Okta Verify gives you a log of authentications, but not a full audit trail tied to the specific agent actions and workflow approvals that required them. Write `docs/MOBILE-AUDIT.md`.

### P18-E — Sign-off
- [ ] **P18-13** vs. Okta comparison doc — produce `docs/MOBILE-VS-OKTA.md`: capability table comparing ONEVibe Mobile against Okta Verify, Microsoft Authenticator, and Duo Mobile. For each capability: what the competitor does, what ONEVibe Mobile does, and the structural advantage (hardware-rooted DID vs shared-secret OTP, W3C VC vs proprietary token, DIDComm push vs HTTPS polling, AAL2 artefact vs session flag). This is the document that answers "why replace Okta" for a security-conscious enterprise buyer.

---

## Phase 22 — Government ERP Modules
> Added 2026-07-18. Derived from GeBIZ procurement data: 18,464 tender awards analysed to find what government agencies buy repeatedly. The pattern is clear — the same 8 workflow categories appear across every agency, every year, procured independently each time. These modules are the shared platform that replaces that fragmentation.
>
> Each module runs on the Phase 20 ERP Core engine (same as Phase 21 private-sector modules). The government configuration layer is: structured approval chains with named officers, tamper-evident audit trail on every decision, and configurable retention schedules. No new infrastructure required.
>
> **Reference:** `docs/GEBIZ-GOVERNMENT-ERP-ANALYSIS.md`

### P22-01 — Training & Course Management
> **Why:** 911 tenders, SGD 784M — highest tender count in the entire GeBIZ dataset. Every agency independently procures a training system to do the same three things: manage course calendars, track who attended, issue completion certificates. The Civil Service College alone runs hundreds of courses per year for officers across all agencies, yet every agency maintains its own training record silo.

- [ ] **P22-01a** Course catalogue and nomination — searchable catalogue of courses with provider, dates, prerequisites, and certification type. Officers nominate via a card. Supervisor approves. Course coordinator sees a confirmed attendance list. No email chains, no spreadsheet sign-ups.
- [ ] **P22-01b** Attendance and completion tracking — QR code or manual check-in. Completion certificate auto-generated on pass. CPE hours accumulated on the officer's profile. Expiring certifications flagged before they lapse.
- [ ] **P22-01c** Training record portability — an officer's training history travels with them across postings and agencies. No manual transfer request, no PDF hunting.

### P22-02 — Duty Roster & Shift Scheduling
> **Why:** 842 tenders, SGD 2.0B — highest spend volume in the dataset. Uniformed services (SPF, SCDF), public hospitals (nursing, pharmacy, allied health), and public transport operations all run on the same Excel-WhatsApp cycle: supervisor builds the weekly roster in Excel on Sunday night, screenshots it into a WhatsApp group, manages swaps by DM. The official HR system is updated days later or not at all.

- [ ] **P22-02a** Scheduling canvas — drag-and-drop weekly roster view. Role and certification constraints enforced at assignment (only officers with the right qualifications appear as eligible for a given slot). Auto-fill from last week's pattern. One-tap publish to all staff.
- [ ] **P22-02b** Shift swap and recall — staff request swaps in-app; supervisor approves. Emergency recall broadcasts an open slot to all eligible available staff; first to respond gets it. Every action logged — no WhatsApp.
- [ ] **P22-02c** Overtime and rest-period alerts — configurable minimum rest rules (e.g. MOH healthcare worker guidelines). Violations flagged before the roster is published, not after a complaint.

### P22-03 — Inspection & Enforcement
> **Why:** 267 tenders, SGD 874M. NEA, BCA, PUB, LTA, and AVS each run separate field inspection systems for officers doing the same job: arrive at premises, log findings, issue a notice, follow up. Each agency built its own tool; none share data or formats.

- [ ] **P22-03a** Daily assignment dispatch — inspection assignments pushed to officer's mobile: premises details, previous visit history, outstanding follow-up items, today's checklist template (configurable per establishment type).
- [ ] **P22-03b** Field finding log — officer logs findings inline: category picker, severity, photo, free-text. The log auto-drafts the inspection report. No transcription back at the office.
- [ ] **P22-03c** Notice issuance and follow-up — advisory notices generated and served immediately on submission. Enforcement actions (warnings, fines, stop-work orders) routed to a supervisor for sign-off before issuance. Follow-up inspection auto-scheduled when findings require re-check.

### P22-04 — Procurement & Budget Control
> **Why:** 249 tenders, SGD 738M. Government procurement has rigid WOG rules (Waiver of Competition, ITQ, ITT thresholds) that officers must follow but rarely memorise. The result: procurement either goes through the wrong procedure (audit risk) or is avoided entirely by routing around the system (shadow procurement). A system that routes automatically based on value removes both failure modes.

- [ ] **P22-04a** Purchase request workflow — officer describes what they need; system generates a purchase card, auto-resolves the correct procurement procedure (waiver / ITQ / ITT) based on value, and routes to the approver with the correct financial authority. Officer never needs to know the procurement manual.
- [ ] **P22-04b** Quotation management — for ITQ-level purchases: system tracks the required minimum quotations, flags when minimum is not met, and records the basis for selection. Audit trail complete at point of approval.
- [ ] **P22-04c** Budget commitment view — approved commitments tracked against each department's budget head in real time. Finance sees committed vs actual vs available without extracting from the finance system. Overspend flagged before approval, not at year-end.

### P22-05 — Survey & Public Consultation
> **Why:** 245 tenders, SGD 491M. Resident satisfaction surveys, policy consultation exercises, employee engagement surveys, and service quality assessments are each procured separately by each agency. The data never connects back to any action — results sit in a PowerPoint deck rather than triggering the workflow that should follow.

- [ ] **P22-05a** Survey builder — Likert, multiple choice, ranking, open text, NPS. Logic branching. Distribute via link (no login required for residents/citizens) or restricted to authenticated officers.
- [ ] **P22-05b** Results dashboard — real-time response rate, score trends, free-text sentiment summary (AI-synthesised). Configurable threshold alerts: when a score drops below a defined level, an action task is automatically created and assigned.
- [ ] **P22-05c** Consultation lifecycle — formal public consultation periods with open/close dates, submission acknowledgement, and structured response report. Designed for policy consultations (REACH, agency-specific) where submissions need to be catalogued and responded to, not just counted.

### P22-06 — Case & Correspondence Management
> **Why:** 718 tenders (compliance/regulatory) + large volume of undercounted correspondence-management tenders. Every agency handles citizen correspondence, regulatory cases, and ministerial queries through a mix of email, shared drives, and bespoke case systems. The same case touches multiple officers across its lifecycle with no structured handoff or audit trail.

- [ ] **P22-06a** Case intake and assignment — cases created from email, web form, or internal referral. AI classifies case type, suggests the responsible team, and pre-drafts the acknowledgement. Officer assigned in one action.
- [ ] **P22-06b** Case lifecycle — structured states (received → under review → pending information → decision made → closed). Each transition logged with the officer's name and timestamp. SLA countdown visible; overdue cases escalated automatically.
- [ ] **P22-06c** Correspondence drafting — AI drafts outgoing letters and emails from the case record. Officer reviews and approves before sending. Draft + approved version both retained in the case history.
- [ ] **P22-06d** Ministerial query tracking — special case type for queries routed from ministers' offices. Strict SLA (typically 3–5 working days), escalation path to PS-level, and response quality review built into the workflow.

### P22-07 — HR & Leave Management
> **Why:** 417 tenders, SGD 834M. Every ministry and statutory board runs a separate HR system, most on SAP HCM or a bespoke SI-maintained tool. Leave requests, performance nominations, and long-service awards all follow the same approval pattern but are managed in disconnected systems.

- [ ] **P22-07a** Leave request and approval — officer submits leave via card. System checks balance, flags public holidays and team conflicts, routes to direct supervisor. Supervisor approves in one tap. Calendar updated automatically.
- [ ] **P22-07b** Leave types pre-configured for public service — annual leave (PSD schedule), sick leave, childcare, NS leave, marriage, paternity/maternity. Agencies with different entitlement schedules (SAF, Police) configure their own variant without touching the base module.
- [ ] **P22-07c** Performance and staff movement workflows — promotion nominations, acting appointments, and inter-agency transfers as structured approval cards. Each step has a named approver and a signed receipt. HR records updated on completion — no separate data entry.

### P22-08 — Asset & Facilities Management
> **Why:** 274 tenders, SGD 2.7B. HDB (town council maintenance), PUB (utility infrastructure), NParks (parks and greenery), NEA (waste management assets), and LTA (transport infrastructure) all run asset registers and maintenance schedules. Most are Excel-based or use disconnected tools that predate the smartphone.

- [ ] **P22-08a** Asset register — every asset has a card: asset ID, location, purchase date, warranty expiry, maintenance schedule, last inspection result. Search and filter by location, type, or maintenance status. Bulk import from existing Excel registers.
- [ ] **P22-08b** Maintenance scheduling — preventive maintenance tasks generated automatically from the schedule. Assigned to a technician. Completion logged with photos and findings. Overdue tasks escalated.
- [ ] **P22-08c** Fault reporting and work orders — staff or public report a fault (broken equipment, damage). AI classifies urgency and type. Work order created and assigned. Requester receives status updates. Closure triggers a satisfaction prompt.

---

## Phase 21 — The 12 Core ERP Modules (80/20 product stack)
> Added 2026-07-18. Cross-referenced from docs/ICP-APAC-TOP20.md (20 APAC ICP profiles) and docs/ERP-MODULES-80-20.md (full module spec with ideal user journeys and ICP coverage matrix).
>
> **The principle:** ONEVibe ships 12 pre-built modules covering 80% of enterprise workflow pain across all 20 ICPs. Each module is a manifest (entity schema + state machine + form template + permissions + connector bindings) that runs on the Phase 20 ERP Core engine. The customer's 20% is adjusting field labels, approval thresholds, routing rules, and branding — all via the vibe builder, no developer needed. Total admin setup time per module: 30–45 minutes.
>
> **Each module must ship with:** default manifest, demo dataset, ideal UJ walkthrough (documented in module spec), mobile push integration (P18-04), Approvals Inbox aggregation (Module 1), and a comparison note vs the incumbent (Concur/Workday/ServiceNow/SAP).
>
> **Reference docs:** `docs/ERP-MODULES-80-20.md` (full UJ + ICP matrix), `docs/ICP-APAC-TOP20.md` (customer profiles).

### P21-01 — Module 1: Approvals Inbox
**Serves:** All 20 ICPs. Every pending decision in one place, with one tap to act.
**Pain replaced:** Approvers context-switch between Concur, Workday, ServiceNow, SAP, email, and WhatsApp to clear their queue. High-value approvers lose hours per week.
**Ideal UJ:** Open ONEVibe → card stack shows all pending decisions (expense, leave, PO, contract, IC vote) → tap to approve/reject, AAL2 biometric for above-threshold → queue cleared → audit trail written. 4 minutes to clear 5 decisions.
- [ ] **P21-01a** Aggregation layer — unified approval card model that accepts events from all other modules (expense, leave, PO, contract, IC approval, compliance decision). Each card carries: what is being approved, who requested it, key decision data, policy context, and required auth level.
- [ ] **P21-01b** Mobile push integration — when a new approval arrives, the approver receives a push notification (P18-04). The notification deeplinks to the specific card. Approve or reject without opening the app.
- [ ] **P21-01c** Priority sort + SLA countdown — cards sorted by: deadline (SLA breach first), amount/impact (highest first), module type (configurable). SLA countdown visible on each card. Overdue cards are red.
- [ ] **P21-01d** Delegation — approver can delegate their queue (full or specific card types) to a named delegate for a date range. Delegate actions are flagged in the audit trail as "approved on behalf of."

### P21-02 — Module 2: Expense & Reimbursement
**Serves:** 10/20 ICPs. Replaces SAP Concur's 14-step, 23-minute flow.
**Pain replaced:** Mandatory travel agent, GL code lookup from 40 options, hotel itemisation, no calendar integration, separate system for finance re-entry.
**Ideal UJ:** Photo receipt → AI extracts merchant/amount/date → AI fills cost centre + GL code + approver → employee confirms in 45 seconds → manager push-approves → queued for next payroll cycle.
- [ ] **P21-02a** AI receipt extraction — photograph or email-forward receipt, AI extracts: merchant, amount, currency, date, category suggestion. Confidence score shown for each field. Low-confidence fields highlighted for manual confirmation.
- [ ] **P21-02b** Policy engine — per-category spending limits, per-trip limits, preferred vendor rules, personal vs corporate card rules. Policy check runs at submission time, not at approval time. Violations flagged with plain-language explanation.
- [ ] **P21-02c** Approval routing — org-chart-aware: routes to direct manager by default. Above-threshold (configurable): routes to Finance Director. Manager OOO: escalates to skip-level automatically after configurable delay.
- [ ] **P21-02d** Payroll/finance sync — approved expenses queue for the next payroll run. Finance connector (configurable: Xero, QuickBooks, SAP FI, or CSV export). Employee receives push confirmation when reimbursement is queued.
- [ ] **P21-02e** Customer 20% config layer — category list, per-category limits, approval thresholds, GL code mapping table, payroll cycle day, connected finance system.

### P21-03 — Module 3: Investment / IC Committee Approval
**Serves:** 8/20 ICPs (GIC, Temasek Trust, Mapletree, CapitaLand, OCBC private banking, Ayala, Tokio Marine reinsurance). Highest AUM per ICP.
**Pain replaced:** IC memo in PowerPoint, circulated by email, decision in meeting minutes (Word doc), legal chases "who approved this?"
**Ideal UJ:** Deal card created → routes to correct IC per fund → members pre-vote on mobile → meeting: live tally + comment thread → chairperson seals decision → all IC members AAL2 biometric → signed artefact delivered to legal → next workflow state auto-triggered.
- [ ] **P21-03a** Deal card with multi-fund routing — entity resolves the correct IC committee from which fund the deal belongs to. Wrong routing is architecturally impossible — the manifest defines fund-to-IC mapping.
- [ ] **P21-03b** Pre-vote + comment thread — IC members can review and pre-vote before the meeting. Comments thread on the card for questions/concerns. All pre-vote activity is part of the permanent record.
- [ ] **P21-03c** AAL2 final decision — when the chairperson submits the final decision, all voting members receive an AAL2 biometric prompt. The signed receipts are the legally-defensible evidence of who voted, when, with what authentication level.
- [ ] **P21-03d** Legal workflow trigger — on approval, auto-creates a Contract & Document Sign-off card (Module 7) pre-populated with the deal terms. Closes the loop between IC approval and legal execution.

### P21-04 — Module 4: Leave & Absence Management
**Serves:** All 20 ICPs. Replaces Workday's 4-sub-menu leave request flow.
**Pain replaced:** Opaque balance calculation, no team coverage visibility, manager approves blindly, shift workers manage swaps via WhatsApp.
**Ideal UJ:** "I want Mon–Tue off" → card shows balance + team calendar overlay → submit → manager push-approves → calendar blocked → HR updated.
- [ ] **P21-04a** NL + calendar picker — employee enters dates in natural language or calendar. AI resolves: leave type (annual, sick, childcare, NS — configurable per jurisdiction), balance remaining, any conflicts.
- [ ] **P21-04b** Team coverage check — manager approval card shows: team calendar for the requested period, existing approved leaves, configurable minimum coverage threshold. Conflict alert (not block) if approving would breach threshold.
- [ ] **P21-04c** Jurisdiction-aware leave types — leave types, balance rules, and accrual logic configurable per country. Singapore defaults: annual, sick, childcare, NS, maternity/paternity (MOM-compliant). Extensible to Malaysia, Indonesia, Thailand, Philippines.
- [ ] **P21-04d** Shift swap workflow (for hourly workers) — employee A proposes swap with B → B accepts → supervisor approves → both calendars updated → HR record updated. Full trail. No WhatsApp.

### P21-05 — Module 5: Procurement & Purchase Orders
**Serves:** 8/20 ICPs. Replaces SAP ME21N's 14-minute, 9-field manual PO flow.
**Pain replaced:** Material number, vendor code, plant code, storage location, purchasing org, GL account, cost centre — all manually entered. Most orgs have a parallel "email procurement" shortcut that bypasses the system.
**Ideal UJ:** "500 units industrial solvent, preferred Jakarta supplier, end of month" → AI resolves vendor/material code/GL/cost centre → pre-filled PO card → confirm 2 fields → submit → one-tap approval → PO sent to vendor → goods receipt workflow triggered on delivery.
- [ ] **P21-05a** Preferred vendor catalogue — searchable vendor list with pre-loaded material codes, unit pricing, and delivery lead times. AI matches NL description to catalogue entries.
- [ ] **P21-05b** Approval threshold matrix — configurable by amount and by requester role. Below threshold: auto-approved. Above threshold: routes to department head, then Finance Director, then CFO (configurable levels).
- [ ] **P21-05c** Goods receipt confirmation — on expected delivery date, supplier and requester both receive a confirmation card. Requester confirms receipt. PO status updated. Three-way match (PO → goods receipt → invoice) documented for audit.
- [ ] **P21-05d** ERP connector — optional sync to SAP MM, Oracle Procurement, NetSuite, or Xero. ONEVibe is the workflow layer; the ERP remains the ledger. Connector is configurable, not mandatory.

### P21-06 — Module 6: Compliance & Regulatory Decisions
**Serves:** 9/20 ICPs. Highest compliance forcing function of all 12 modules.
**Pain replaced:** SAR filings in PDF + email. EUDR supply chain decisions undocumented. ITAR export checks in email threads. Shariah compliance sign-offs missing named-individual accountability.
**Ideal UJ (SAR):** Transaction flag → case card pre-populated → officer drafts SAR narrative → MLRO reviews + AAL2 signs → regulator export → 10-year retention enforced. **Ideal UJ (EUDR):** New supplier → satellite deforestation check → decision card → sustainability officer approves/rejects with AAL2 → signed artefact = EUDR compliance evidence.
- [ ] **P21-06a** Case management state machine — configurable decision types (SAR, EUDR, ITAR, Shariah, policy exception, KYC re-cert). Each type has its own state machine, routing rules, and evidence requirements.
- [ ] **P21-06b** AAL2 for high-risk decisions — decisions above a configurable risk threshold require AAL2 biometric (P18-06). The authentication evidence is part of the signed artefact.
- [ ] **P21-06c** Regulator export — sealed decision packages exportable in configurable formats (PDF with signature chain, structured JSON, XBRL for financial regulators). Hash verification ensures export integrity.
- [ ] **P21-06d** Long-term retention — configurable retention periods (7 years, 10 years, permanent). Records locked after sealing — cannot be edited or deleted. Retention expiry generates a destruction certificate.

### P21-07 — Module 7: Contract & Document Sign-off
**Serves:** 10/20 ICPs. Adds governed internal approval chain before DocuSign.
**Pain replaced:** DocuSign sits at the end of a 6-email internal approval chain with no audit trail. Legal reviews in email threads.
**Ideal UJ:** Upload draft → AI summarises key terms + risk flags → internal review workflow (legal → commercial → board) → each step is a signed card → AAL2 for board members → external e-sign sent only after all internal approvals sealed → full trail: draft → reviewed → approved → signed.
- [ ] **P21-07a** Document hash on upload — SHA-256 hash recorded on upload. Any modification to the document after upload is detectable. Tamper evidence is part of the audit trail.
- [ ] **P21-07b** AI contract summary + risk flag — AI reads uploaded contract, produces: key obligations, unusual clauses (non-standard indemnity, uncapped liability, automatic renewal), and a risk rating. Flags are shown to the first reviewer, not suppressed.
- [ ] **P21-07c** Internal review state machine — configurable review roles and sequence. Legal annotates inline → commercial approves terms → board committee ratifies (for material contracts). Each step is a signed card.
- [ ] **P21-07d** External e-sign connector — DocuSign, Adobe Sign, or Singpass e-sign (Singapore). Sign link generated only after all internal approvals are sealed. Counterparty signature attached to the internal approval chain as the final state.
- [ ] **P21-07e** Contract register with expiry alerts — all executed contracts stored in a searchable register. Expiry/renewal dates generate reminder cards at configurable lead times (90 days, 30 days, 7 days).

### P21-08 — Module 8: Shift Scheduling & Workforce Management
**Serves:** 6/20 ICPs (SIA, Grab, Lazada, Prudential, CIMB, Jardine). Very high employee counts.
**Pain replaced:** Workday one-at-a-time shift assignment. WhatsApp rosters. Excel Sunday-night builds. HR sees a disconnected record.
**Ideal UJ:** Scheduling canvas for the week → "Auto-fill based on last week" → AI fills, flags conflicts (rest requirements, certifications) → one-tap publish → all staff receive push schedules → swap requests via app, not WhatsApp.
- [ ] **P21-08a** Scheduling canvas — week/fortnight view with all staff. Drag-and-drop shift assignment. Role/certification filter. Bulk operations: copy week, auto-fill, clear day.
- [ ] **P21-08b** Constraint engine — configurable rules: minimum rest between shifts, maximum hours per week, required certifications per shift type. AI enforces on auto-fill. Manual overrides flagged (not blocked) with compliance note.
- [ ] **P21-08c** Swap request workflow — staff member proposes swap → counterpart accepts → supervisor approves (or auto-approved if both parties consented and no constraint violation) → both calendars updated → HR record updated.
- [ ] **P21-08d** Push schedule publishing — on publish, all affected staff receive push notifications with their schedule for the period. Changes to published schedule also trigger push notifications to affected staff.

### P21-09 — Module 9: Audit & Workpaper Management
**Serves:** 8/20 ICPs. Replaces shared drives + email review + PDF certifications.
**Pain replaced:** Workpaper in shared drive, reviewer comments in email, EQR sign-off in email, SOX cert as a PDF with no authentication evidence.
**Ideal UJ:** Create workpaper package → preparer completes each section → reviewer annotates inline, raises threaded queries → EQR reviews + AAL2 signs → CFO receives SOX cert card + AAL2 signs → sealed package exported with full signature chain.
- [ ] **P21-09a** Workpaper package structure — configurable section templates by standard (Singapore Standards on Auditing, PCAOB, ISAE 3000). Preparer assigns sections, tracks completion status, submits for review.
- [ ] **P21-09b** Inline annotation + query resolution — reviewer comments attach to specific sections. Each comment is a threaded conversation tracked to resolution. Open queries block advancement to next state.
- [ ] **P21-09c** EQR + SOX certification cards — EQR and CFO/CEO certification are separate workflow steps, each requiring AAL2. The authentication evidence is embedded in the sealed package.
- [ ] **P21-09d** Sealed export — completed workpaper package exported as a structured PDF with embedded signature chain and document hashes. External auditors receive the export, not ZIP files of individual PDFs.

### P21-10 — Module 10: IT Service & Incident Management
**Serves:** All 20 ICPs. Replaces ServiceNow's 6-click employee portal and untrained AI chatbot.
**Pain replaced:** 6 clicks to report a broken laptop. Status updates as email digests. Employees call IT directly, defeating the ticketing system.
**Ideal UJ:** "My VPN won't connect from Singapore office" → AI classifies + checks known issues → walks employee through fix → fixed in 3 minutes, no ticket → if AI fails: structured ticket with full diagnostic context, routed to correct team → employee gets push updates at each status change.
- [ ] **P21-10a** AI first-responder — NL incident description classified and matched against knowledge base. Self-service resolution walked through step-by-step. Resolution logged for IT visibility even if no ticket created.
- [ ] **P21-10b** Structured ticket generation — when AI can't resolve, creates a ticket pre-populated with: device model (from asset register), OS version, error message, steps already tried, priority classification. No "please provide more details" back-and-forth.
- [ ] **P21-10c** SLA + push updates — SLA timers by priority (P1: 1hr, P2: 4hr, P3: 8hr — configurable). Breach escalates to next tier. Employee gets push notification at each status change (assigned, in progress, resolved).
- [ ] **P21-10d** Asset register integration — employee's device profile pre-loads from asset register. Reduces diagnostic questions. Connects to CMDB if available; standalone asset register if not.

### P21-11 — Module 11: Performance Reviews & Goals
**Serves:** 8/20 ICPs. Replaces SuccessFactors' blank-page year-end reviews.
**Pain replaced:** Goal module built for top-down cascade. Year-end review starts from blank text box. No continuous feedback record. Manager has no structured data.
**Ideal UJ (goals):** Employee describes goal in NL → AI structures as SMART goal, suggests OKR alignment → manager confirms → mid-year check-in push card with progress prompt. **Ideal UJ (review):** Review card pre-populated with goals + outcomes + feedback received + projects worked on → employee writes 3-sentence narrative → manager rates with same pre-populated card.
- [ ] **P21-11a** SMART goal vibe builder — NL goal description → AI proposes SMART structure → employee and manager collaboratively refine → goal card visible on employee's home screen.
- [ ] **P21-11b** Continuous feedback card — manager or peer sends a 2-sentence feedback card attached to a specific project or task. Recipient sees it in their development timeline. Aggregates at year-end.
- [ ] **P21-11c** Pre-populated review card — at review time, card contains: all goals with tracked outcomes, all feedback received, all tasks/projects from the period (from task history). Employee writes narrative; they are not reconstructing from memory.
- [ ] **P21-11d** Calibration workflow — after manager reviews are submitted, HR runs a calibration session (group of managers, one view). Ratings and narratives visible side-by-side. Calibration decisions recorded as a separate signed step.

### P21-12 — Module 12: Grant & Fund Disbursement
**Serves:** 6/20 ICPs (Temasek Trust, EDB, GIC co-investments, MAS AFIN grants, Ayala capital allocation, Mapletree fund capital calls). Highest average transaction value.
**Pain replaced:** Grant workflow entirely email-based. Approval vs disbursement reconciliation requires tracing 4 inboxes. Post-disbursement monitoring via quarterly email nudges.
**Ideal UJ:** Structured application card → eligibility check (auto-score) → committee vote + AAL2 → legal agreement auto-drafted + e-signed → disbursement instruction generated → finance confirms → post-disbursement KPI check-ins as scheduled cards.
- [ ] **P21-12a** Structured application form — configurable fields: organisation profile, project description, budget breakdown, impact KPIs. Application card replaces PDF forms and email attachments.
- [ ] **P21-12b** Eligibility scoring — configurable criteria with weights. Applications scoring above threshold auto-advance. Borderline applications route to committee. Below threshold auto-declined with explanation.
- [ ] **P21-12c** Committee vote + AAL2 — committee members vote on application card. Configurable quorum rules. Final decision requires AAL2 from all voting members. Decision sealed.
- [ ] **P21-12d** Legal agreement auto-generation — approved terms populate a legal agreement template. Sent for e-sign via Module 7 connector. Disbursement instruction unlocked only after signed agreement is sealed.
- [ ] **P21-12e** Post-disbursement monitoring — KPI check-in cards sent to grantee at configurable intervals (6 months, 12 months, final report). Responses attached to the original grant record. Full lifecycle in one place.

---

## Phase 21 reference docs
- Full module specs + ideal UJs: `docs/ERP-MODULES-80-20.md`
- ICP coverage matrix: `docs/ICP-APAC-TOP20.md`
- Engine underneath all 12 modules: Phase 20 (ERP Core)
- Mobile push and AAL2: Phase 18 (ONEVibe Mobile)
- Vibe builder for customer 20%: Phase 17-A (P17-09 vibe builder)

---

## Phase 20 — ONEVibe ERP Core: the extensible engine all mini-apps are built on
> Added 2026-07-18. Key insight: every mini-app in P16–P19 needs the same four primitives — a typed entity (Expense, Leave Request, PO, Ticket, Goal), a state machine (Submitted → Approved → Paid), an approval chain (org-chart-aware, threshold-driven, AAL2-capable), and an immutable audit trail. Building them separately means writing that substrate 18 times. Phase 20 extracts those primitives into a single AI-native ERP Core engine. Each mini-app becomes a **manifest** (entity schema + workflow definition + form template + permission rules) that the engine runs. P16–P19 mini-apps retroactively become the first-party reference apps that validate the engine's abstractions. This is the same engine SAP/Oracle built — except theirs was built in the 1970s around database transactions made visible to the user; ours captures intent in NL, resolves structure invisibly, and treats the audit event bus as the primary store (not a side effect).

**North star: a business administrator defines a new workflow in plain language ("I need a capital expenditure approval process for anything over $50k with CFO sign-off and audit trail"). The engine generates the entity schema, state machine, form cards, and approval routing. No developer needed. No IT ticket.**

### P20-0 — Entity registry
- [ ] **P20-01** Typed entity registry — define any business object (Expense, Leave Request, Purchase Order, Asset, Ticket, Contract, Goal, Workpaper) with typed fields (string, number, date, enum, file, user-ref, entity-ref), validation rules, and tenant-isolated storage. Field types are small and strict — no "text area with 400 characters" as the universal answer. Entity schemas are vibe-configurable: admin describes the object in NL and the AI drafts the schema for confirmation. Schema changes are versioned — no migration breaks existing records. Write `docs/ERP-ENTITY-REGISTRY.md`.

- [ ] **P20-02** Entity relationships — entities can reference other entities (Expense belongs to Employee, belongs to Cost Centre; PO references Vendor and GL Code; Task references Project). Relationships are typed (one-to-one, one-to-many, many-to-many) and traversable in queries. The AI can resolve relationship chains from NL ("show me all open POs for the Singapore office for Q3") without the user knowing the schema. Circular references and orphaned references are handled gracefully. Write `docs/ERP-ENTITY-RELATIONSHIPS.md`.

- [ ] **P20-03** Entity permissions layer — access to entity types and individual records is governed by roles (resolved from the org chart and VTC membership credentials). Role-based visibility: a manager sees their team's leave requests; finance sees all expense reports above threshold; an individual sees only their own payslip. Field-level visibility: salary fields visible only to HR and the employee's manager. Permission rules are defined in the mini-app manifest — not hardcoded. Write `docs/ERP-PERMISSIONS.md`.

### P20-1 — Workflow engine
- [ ] **P20-04** State machine engine — every entity type has a defined lifecycle: states (Draft, Submitted, Under Review, Approved, Rejected, Paid, Archived) and transitions (Submit: Draft → Submitted, Approve: Under Review → Approved). Transitions have: preconditions (balance available, policy check), actions (send push notification, call connector, create linked entity, set field), SLA timers (escalate after 24h of no response), and required approvers. State machines are defined in the mini-app manifest, not code. Write `docs/ERP-STATE-MACHINE.md`.

- [ ] **P20-05** Approval engine — generic, org-chart-aware approval routing. Approval chains are resolved at runtime from: entity field values (amount, category, risk level), policy rules (anything above $10k needs Finance Director), org chart (route to direct manager unless manager is the submitter), and AAL2 requirements (mapped from P18-06). Approver absence triggers automatic escalation with configurable delay. Parallel approval (all approvers must approve) vs sequential (any one approver sufficient) is configurable per transition. Approval decisions are VTI-signed receipts — the approver's identity is a cryptographic artefact, not a database row. Write `docs/ERP-APPROVAL-ENGINE.md`.

- [ ] **P20-06** SLA and escalation engine — every workflow transition can have a deadline (respond within 24h, resolve within 5 business days). When a deadline is breached: escalate to the next approver in the chain, send a push alert to the submitter, flag the record in the admin dashboard. SLA clocks are business-hours-aware (configurable calendar per org). Breached SLAs are visible in the CISO console as a governance signal. Write `docs/ERP-SLA-ENGINE.md`.

### P20-2 — Form and card UI generator
- [ ] **P20-07** Form/card generator — given an entity schema and the current workflow state, generate the correct form card UI automatically. Submission state: show all required fields + AI pre-fill from context. Review state: show read-only summary + approval action. Approved state: show confirmation card + next steps. Card layout follows the ONEVibe design system (CSS tokens, no inline styles). Field types map to UI components (date → date picker, enum → chip selector, file → receipt upload, user-ref → people picker). Forms are rendered in both desktop and mobile-native layouts. Write `docs/ERP-FORM-GENERATOR.md`.

- [ ] **P20-08** AI pre-fill layer — when an employee starts a new entity submission, the AI pre-populates fields from available context: calendar events (travel dates for expense), email receipts (amount, merchant), org chart (cost centre, approver), recent similar submissions (same vendor, same GL code). Employee sees a pre-filled card, not a blank form. Pre-filled fields are visually distinguished (AI-suggested vs user-confirmed). Confidence score: fields below 80% confidence are shown but not auto-confirmed. Write `docs/ERP-AI-PREFILL.md`.

- [ ] **P20-09** Vibe-to-manifest builder — admin describes a new workflow in plain language; AI generates the full mini-app manifest (entity schema, state machine, form template, permission rules, approval routing). Admin reviews and edits each section in a structured UI (not raw JSON). One-click deploy: manifest is validated and registered in the entity registry. This is the "admin just vibes" north star from P17 applied to ERP workflow creation. Write `docs/ERP-VIBE-MANIFEST.md`.

### P20-3 — Audit and connector layer
- [ ] **P20-10** Immutable audit event bus — every state transition, field edit, approval decision, connector call, and AI pre-fill action emits a structured event to the audit bus. Events are append-only (never deleted, never edited), tenant-isolated, and exported to the ONEComputer audit trail. Each event carries: entity type + ID, transition name, actor identity (VTC-resolved DID), timestamp (server-authoritative), field delta, and the VTI-signed receipt if an approval was involved. The audit bus is the source of truth — the entity's current state is derived by replaying its events, not stored as mutable rows. Write `docs/ERP-AUDIT-BUS.md`.

- [ ] **P20-11** Connector binding layer — any workflow transition can trigger a connector action: create a Jira ticket on submission, sync approved expense to payroll system, post to Slack channel on rejection, call a webhook on approval. Connector bindings are defined in the mini-app manifest (not hardcoded), governed by VTI consent (P10-02), and executed via the ONEComputer connector broker. Connector failures are non-blocking: they retry with backoff and are surfaced in the admin dashboard, never silently dropped. Write `docs/ERP-CONNECTOR-BINDINGS.md`.

- [ ] **P20-12** Report and query layer — any admin or authorised user can query any entity collection in NL ("show me all expense reports submitted by the Singapore team in Q2 that were flagged for policy review") or via a structured filter UI. AI translates NL to a structured query, executes against the entity store, and returns a formatted report (table, summary stats, export to CSV/PDF). Report definitions can be saved and shared. Scheduled reports (weekly summary, month-end reconciliation) are a workflow step — no separate reporting module. Write `docs/ERP-QUERY-LAYER.md`.

### P20-4 — Mini-app manifest and marketplace
- [ ] **P20-13** Mini-app manifest format — standardise the manifest format used by all P16–P19 mini-apps: `{ entityTypes[], workflows[], formTemplates[], permissions[], connectorBindings[], defaultData[] }`. Manifest is a JSON document validated against a published schema. First-party mini-apps (P16–P19) are manifests in the ONEVibe repo. Third-party mini-apps are manifests distributed via the marketplace (P17-15). The engine runs any valid manifest — the mini-app is pure configuration, not code. Write `docs/ERP-MANIFEST-FORMAT.md`.

- [ ] **P20-14** Migrate P16–P19 mini-apps to manifest model — refactor the P16 (legal/audit/finance/compliance), P17 (intranet widgets), P18 (mobile approval flows), and P19 (expense/HR/IT/procurement) mini-apps to be manifest-driven. Each mini-app should have zero bespoke engine code — all behaviour defined declaratively in the manifest. This validates the engine's abstractions: if a first-party mini-app needs to escape the manifest, the manifest format is incomplete. Write `docs/ERP-MANIFEST-MIGRATION.md`.

- [ ] **P20-15** ERP Core vs SAP/ServiceNow architecture comparison — produce `docs/ERP-CORE-VS-SAP.md`: side-by-side comparison of ONEVibe ERP Core against SAP S/4HANA, ServiceNow, and Salesforce Platform (Force.com). For each: data model philosophy (database-first vs event-sourced entity registry), workflow definition (procedural code vs declarative manifest), approval routing (hardcoded chains vs policy-resolved), audit trail (side-effect log vs primary store), and extensibility story (ABAP/Apex developer vs admin vibe builder). This is the technical architecture brief that justifies the engine as a platform, not just a feature collection.

---

## Phase 19 — Enterprise app replacement: ONEVibe vs SAP / Workday / Concur / ServiceNow
> Added 2026-07-18. Root-cause analysis of six dominant enterprise platforms (SAP S/4HANA, Workday, SAP SuccessFactors, SAP Concur, ServiceNow, Oracle HCM) reveals six structural failures shared across all of them: (1) buyer-user divorce — procurement evaluates features, not usability; (2) database-first design — T-codes, form-per-table, component hierarchies expose the data model to the user instead of the job-to-be-done; (3) compliance-owned workflows — every step exists for an auditor, not the employee; (4) acquisition archipelagos — six different data models stitched by SSO sold as a "platform"; (5) customisation as design strategy — implementation partners bespoke-configure what the base product couldn't handle; (6) mobile and async were never design constraints. The result: employees escape to Excel, WhatsApp, and shadow SaaS for every real workflow. ONEVibe's answer: mini-apps built for the job-to-be-done, AI executes compliance invisibly, vibe-to-build so employees self-serve, and push approvals on mobile so the audit trail is never the bottleneck.

### P19-0 — Foundation
- [ ] **P19-00** Enterprise pain-point audit doc — produce `docs/ENTERPRISE-PAIN-POINTS.md`: six-platform gap table (each platform → top 3 user complaints → structural root cause → shadow IT escape hatch → how ONEVibe solves it). This is the internal reference for every P19 mini-app design decision and the sales comparison foundation.

### P19-A — Expense reporting (Concur → ONEVibe)
> Concur forces employees through 14 steps for a $12 lunch because it is a compliance tool for auditors, not a submission tool for employees. ONEVibe collapses it to: capture → confirm → done.

- [ ] **P19-01** Receipt capture + AI expense mini-app — employee photographs a receipt (or forwards an email receipt); AI extracts merchant, amount, date, and suggests expense category from company policy. Employee confirms or edits in a single card view. No manual GL coding. No "expense type from 40 options." GL code is resolved by the AI from policy rules; if ambiguous, the card shows the two most likely options. Reimbursable vs non-reimbursable is surfaced immediately, not at approval time. Write `docs/EXPENSE-MINI-APP.md`.

- [ ] **P19-02** Smart approval routing — after employee confirms, the expense routes to the correct approver (resolved from org chart + policy, not a manually-configured email chain). Approver receives a push notification (P18-04 mobile push) showing: amount, merchant, category, policy status (compliant/flagged), employee name. One-tap approve or reject. No email thread. No logging into Concur to see a queue. If the approver is out of office, the system escalates automatically after 24h — no employee needs to chase. Write `docs/EXPENSE-APPROVAL.md`.

- [ ] **P19-03** Direct payroll sync — approved expenses queue for reimbursement in the next payroll cycle. Finance sees a daily reconciliation report (structured export matching GL codes) without touching the original expense cards. Employee gets a push confirmation when the reimbursement is queued. No re-entry into a finance portal. The audit trail (receipt, AI extraction confidence, employee confirmation, approver identity + timestamp, AAL2 evidence if above threshold) is written automatically to the ONEVibe audit event bus. Write `docs/EXPENSE-PAYROLL-SYNC.md`.

### P19-B — HR self-service (Workday → ONEVibe)
> Workday requires employees to submit requests to HR who processes them on behalf of employees. ONEVibe makes every HR transaction self-service in under 60 seconds.

- [ ] **P19-04** Leave request mini-app — employee says "I want 3 days off next week" (NL or calendar picker); AI checks leave balance, flags public holidays or team conflicts, and surfaces the result before submission. One-tap submit. Manager receives a push card showing: dates, balance impact, team coverage. One-tap approve. Calendar event created on approval. No training required. No navigating HR module sub-menus. Write `docs/LEAVE-MINI-APP.md`.

- [ ] **P19-05** Team scheduling and shift management — for managers of hourly workers (manufacturing, retail, operations): a single scheduling canvas shows the full team for the week. Drag-and-drop shift assignment. AI detects conflicts (double-booked, insufficient rest, skill mismatch against shift requirements). Bulk operations: copy last week's schedule, auto-fill gaps, swap two employees. Publish in one action — all affected employees receive push notifications. This is the feature Workday cannot do (one person at a time), which drives managers to WhatsApp. Write `docs/SCHEDULING-MINI-APP.md`.

- [ ] **P19-06** Payslip + benefits self-service — employee views current and historical payslips, tax documents, benefits elections, and total compensation breakdown in a mobile-native card view. Benefits enrolment (open enrolment period) walks through choices in plain language with AI explanations ("if you choose Plan B, your monthly cost is X and your family deductible is Y — here is how it compares to Plan A"). No benefits-broker portal login. No PDF hunt. Write `docs/PAYSLIP-BENEFITS.md`.

### P19-C — IT service desk (ServiceNow → ONEVibe)
> ServiceNow's employee portal is a read-only consumer layer grafted onto an IT-operations platform. ONEVibe makes the agent the first-responder, with a human ticket as the fallback, not the default.

- [ ] **P19-07** Natural language incident submission — employee types "my laptop screen has dead pixels" or "I can't connect to the VPN from the Singapore office". The AI classifies the incident (hardware fault / connectivity / access / software), checks the knowledge base for a self-service fix, and either (a) walks the employee through the fix with step-by-step instructions, or (b) creates a structured ticket routed to the correct IT queue with all diagnostic context pre-filled. No form. No drop-down classification. No "priority" field the employee has to guess. Write `docs/IT-INCIDENT.md`.

- [ ] **P19-08** AI first-responder — for the 90% of IT incidents that have a known resolution (password reset, VPN config, printer driver, account unlock), the agent resolves the issue directly without creating a human ticket: it initiates the password reset flow, pushes the correct VPN profile, links the correct driver download with installation steps. Human ticket created only when AI resolution fails or the employee explicitly requests it. This inverts the ServiceNow model (every request is a ticket) to: most requests are resolved before a ticket exists. Write `docs/IT-AI-FIRSTRESPONDER.md`.

- [ ] **P19-09** Transparent ticket status with push updates — when a human ticket is created, the employee receives push notifications at each status transition (assigned → in progress → resolved), not a daily email digest. The status card shows: assigned technician, expected resolution time, current step. Employee can add context or mark resolved from the push card — no login to a portal required. Notification volume is controlled: one push per status change, not 12 emails per ticket. Write `docs/IT-TICKET-STATUS.md`.

### P19-D — Performance and learning (SuccessFactors → ONEVibe)
> SuccessFactors is six acquisitions stitched by SSO. Each module has a different data model. Goals don't connect to learning. Learning doesn't connect to performance. Performance doesn't connect to career. ONEVibe treats them as one continuous employee development loop.

- [ ] **P19-10** Goal vibe builder — employee describes their work goals in plain language ("I want to become a team lead by end of year" or "reduce my team's incident response time by 30%"). AI structures them into SMART goals, suggests alignment with team OKRs (pulled from project board), and flags goals that are too vague to measure. Manager reviews a card — not a form with 12 fields — and confirms or suggests refinement. Mid-year check-in is a push card with the original goals and a "how is this tracking?" prompt. Write `docs/GOAL-VIBE-BUILDER.md`.

- [ ] **P19-11** Continuous feedback widget — micro-feedback between formal review cycles: employee or manager sends a 2-sentence feedback card ("great work on the client presentation — next time, lead with the data") attached to a specific project or task. Recipient sees it in their development timeline, not buried in an email thread. At year-end, the structured feedback history is available in the performance review — not "what did you achieve this year?" starting from a blank text box. Write `docs/CONTINUOUS-FEEDBACK.md`.

- [ ] **P19-12** Personalised learning path mini-app — AI recommends courses, articles, and skills based on the employee's role, stated goals (P19-10), recent feedback (P19-11), and skill gaps relative to their target role. Learning content is aggregated from the org's LMS plus curated external sources (Coursera, LinkedIn Learning, internal video library). Employee sees a prioritised "3 things to learn this week" card, not a static catalogue of 10,000 items. Completion syncs to the performance record automatically. Write `docs/LEARNING-PATH.md`.

### P19-E — Procurement and approvals (SAP → ONEVibe)
> SAP forces employees to think in data structures (material master, cost centre, plant code, GL code) for tasks that are conceptually simple. ONEVibe captures intent and resolves structure invisibly.

- [ ] **P19-13** Intent-to-purchase mini-app — employee types "I need a standing desk for the Singapore office, budget around $800." AI drafts the purchase request: suggests vendor(s) from preferred vendor list, fills in GL code from cost centre policy, sets the approval threshold check, and presents a single confirmation card. Employee confirms. Manager (or finance, if above threshold) receives a push approval card. On approval, the structured PO is generated and sent to procurement — employee never touches a SAP form. Write `docs/PURCHASE-MINI-APP.md`.

- [ ] **P19-14** Unified approval card stack — every pending approval (expense, leave, purchase, document sign-off, agent action, access request) surfaces in a single card inbox — mobile-native, with push notifications. Cards are sorted by urgency and deadline. Each card shows: what is being approved, who requested it, the key decision data, and the policy context ("this is within budget policy" / "this requires AAL2 step-up"). Approve or reject with a single tap (AAL2 biometric where required by P18-06). No context-switching between five separate portals to clear an approval queue. Write `docs/APPROVAL-INBOX.md`.

### P19-F — Platform engine (AI-in-loop)
> The above mini-apps share two reusable engine components: an intent-to-workflow interpreter (NL → structured process) and a shadow-IT migration kit (existing Excel/email workflows → ONEVibe mini-apps). These are platform primitives, not vertical features.

- [ ] **P19-15** Intent-to-workflow engine — NL task description from an employee ("submit my travel expenses for the Singapore trip") is parsed into a structured workflow: identify workflow type → select mini-app template → pre-fill context from available data (calendar events, email receipts, org chart) → present to employee for confirmation. Employee sees a pre-filled card, not a blank form. This engine generalises across all P19 mini-apps and is the foundational capability that makes self-service possible without training. Write `docs/INTENT-TO-WORKFLOW.md`.

- [ ] **P19-16** Shadow IT migration kit — when an employee uploads an Excel file or shares a Google Sheet that is clearly acting as a workflow tracker (expense log, shift rota, leave tracker, purchase log), the AI offers to convert it to an ONEVibe mini-app: "This looks like an expense tracker. Want me to create a proper expense submission flow for your team?" Migration preserves existing data, maps columns to mini-app fields, and sets up the approval chain from the org chart. This converts shadow SaaS back to governed ONEVibe workflows without IT involvement. Write `docs/SHADOW-IT-MIGRATION.md`.

### P19-G — Sign-off
- [ ] **P19-17** vs. SAP Concur / Workday / ServiceNow / SuccessFactors comparison doc — produce `docs/ENTERPRISE-VS-COMPARISON.md`: for each of the five platforms (SAP S/4HANA, Workday, SAP SuccessFactors, SAP Concur, ServiceNow), a capability table: what each platform does, what ONEVibe does, and the structural advantage. Key claim to substantiate per platform: (Concur) 14 steps → 3 steps + AI; (Workday) one-at-a-time bulk ops → single scheduling canvas; (ServiceNow) every request is a ticket → agent resolves before ticket exists; (SuccessFactors) six-acquisition data silos → one connected employee development loop; (SAP) T-code data model exposed → intent captured, structure resolved invisibly. This is the document that answers "why replace SAP" for an enterprise CIO.

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
