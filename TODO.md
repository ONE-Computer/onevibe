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
