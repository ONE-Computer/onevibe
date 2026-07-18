# ONEVibe Changelog

---

## [Unreleased]

### Added
- StepTrace plain-English tool labels (P9-19) (`src/lib/runtime-labels.ts`, `src/components/AssistantThread.tsx`): tool-call cards and the working trace render human labels via a case-insensitive `STEP_LABEL_MAP` (bash→"Running command", file_read→"Reading file", file_write→"Writing file", web_search→"Searching the web", browser→"Browsing page", think→"Thinking", fallback "Working") — raw tool JSON is never shown; live runs show the "Working" trace, completed runs collapse to a "Review working trace (N steps)" disclosure
- DVR scrubber transport + live indicator (P9-25) (`src/components/ComputerTimeline.tsx`, `src/components/computer-timeline-activity.ts`, `src/index.css`, `src/lib/i18n.ts`): the checkpoint stepper is replaced by a transport bar — jump-to-start, play/pause, a range scrubber on the track, and a Live button with a red pulsing dot while following the latest event; a "Jump to live" pill overlays the stage when scrubbed away from latest; en/zh labels, reduced-motion-safe pulse, token-compliant styling (literal radii/hex from the initial land were mapped to `--radius-*`/`--accent-ink` in the follow-up fix)
- Task milestone progress panel (P9-26) (`src/lib/milestones.ts`, `src/components/MilestoneProgress.tsx`, `src/components/SidePanel.tsx`, `server/types.ts`, `src/types.ts`): collapsible "Task progress N/N" panel in the side rail (grid-rows 0fr/1fr + inert); consumes `milestone_set`/`milestone_complete` runtime events when present, otherwise derives four fixed phases (understand/gather/draft/finalize) from run state — no runtime emits milestone events yet, so the SSE contract is type-level only
- Task completion summary + file cards + follow-ups (P9-27) (`src/components/AssistantThread.tsx`, `src/index.css`): completed tasks render a green "Task completed" header with inline file cards, a "View all files" modal (All/Docs/Images/Code/Links tabs, backdrop-click close), and 2–4 follow-up suggestion chips that submit a new turn; a follow-up fix resolved undefined `--border`/`--surface`/`--font-mono` token references to the canonical scale
- `GET /onevibe/capabilities` endpoint (P11-05) (`server/index.ts`, `server/capabilities.test.ts`): versioned capabilities stub for the ONEComputer middleware contract — `{version:'1', sandboxBackends:[kasm available / daytona unavailable], connectors:[], features:{vtiConsentGate:false, approvalWebhook:false}}`; Bearer-authorized via `walletService.authorize` like the other protected routes, 503 when the wallet service is unconfigured; contract-tested with a spawn-and-fetch vitest suite
- Docker-first production stack (P4-04) (`docker-compose.prod.yml`, `SELF-HOSTING.md`, `.env.example`): app + postgres:16-alpine with named volumes, health checks on `/api/health/live` + `/api/health/ready`, env via `.env`; five-step self-hosting deploy guide; `.env.example` now documents `DATABASE_URL`, `POSTGRES_PASSWORD`, `ONECOMPUTER_URL`, `ONECOMPUTER_HMAC_SECRET`
- Contextual right panel + thinking-block UX (P9-15) (`src/components/SidePanel.tsx`, `src/components/AssistantThread.tsx`, `src/lib/stores.ts`, `public/boot.js`, `index.html`): 360px slide-in reasoning panel driven by a `useSidePanelStore`; ThinkingBlock renders `reasoning` message parts — 5-line live window during streaming, auto-collapsed teaser + "Open reasoning trace" link after completion (grid-rows 0fr/1fr + inert, reduced-motion safe); `public/boot.js` applies the persisted theme before the bundle loads, fixing theme flash. Dormant until a runtime emits reasoning parts
- Tool group consolidation (P9-16) (`src/components/AssistantThread.tsx`, `src/index.css`, `src/lib/i18n.ts`): consecutive tool-call parts render under a collapsible ToolGroup header — aggregate status dot, i18n `{count}`-interpolated "N tool calls" (en/zh), chevron — collapsing via grid-template-rows 0fr/1fr + inert, replacing the `<details>` pattern; expanded while any call runs, auto-collapsed once all complete. The max-height collapse-hack audit found no instances to migrate
- Gateway VC condition evaluation (P10-03) — companion repo `onecomputer-integration`, branch `codex/azure-e2e-openvtc` (commits `7e24ca4`, `d592085`): `condition_match` parses the `x-onecomputer-vp` header and verifies the trust-task proof for `vti_vc:<did>` targets, failing closed on missing header, bad signature, wrong issuer, or connectorId mismatch
- Typed ONEComputer middleware client stub (P11-11) (`src/lib/onecomputer-client.ts`): `OneComputerClient` wraps all five `/onevibe/*` contract endpoints (capabilities, connector authorize, sandbox run, approval webhook, audit SSE) with native fetch, the `X-ONEComputer-API-Version: 1` header, bearer auth, a typed `OneComputerApiError` (status/code) on non-2xx, abort propagation, and an async-generator SSE consumer with `Last-Event-ID` resume; matches the schemas in `docs/ONECOMPUTER-MIDDLEWARE-CONTRACT.md`. Typecheck-only stub — no live ONEComputer routes exist to call yet
- A2A (Agent-to-Agent) JSON-RPC runtime adapter (`server/a2a-adapter.ts`): Agent Card discovery backs `health()`; `tasks/sendSubscribe` SSE frames map to durable RuntimeEvent projections with an explicit `payload` on every EventInput; `input-required` routes through the existing UserInputBroker and the run continues on the same A2A task id; a stream ending without a terminal state fails closed with a reconciliation-required `run_failed`. Registered as provider `'a2a'` (server/src type unions, runtime registry, readiness, zod input, `'A2A Agent'` label) when `ONEVIBE_A2A_BASE_URL` is set. Contract-tested only — no live A2A endpoint proof yet
- Streaming cursor (`src/components/AssistantThread.tsx`, `src/index.css`): blinking caret (`.streaming-cursor`) rendered at the end of the actively-streaming assistant text part, replacing the always-on bottom typing dots while text streams; respects `prefers-reduced-motion`
- Computers view i18n (`src/components/Computers.tsx`, `src/lib/i18n.ts`): user-visible strings routed through the typed en/zh dictionary with `{minutes}`/`{time}`/`{healthy}`/`{total}`/`{count}`/`{latency}` interpolation; technical identifiers (LiteLLM, MCP, env vars, placeholders, server-provided detail strings) intentionally untranslated
- Capability cards on the home view (`src/components/CapabilityCards.tsx`): starter prompt list replaced by three icon cards (Research/Build/Automate) whose en/zh titles, descriptions, and prompts come from the i18n dictionary; token-only styling with a reduced-motion-safe hover lift; also passes the `locale` prop through to `Computers`
- Chat UX overhaul (`src/components/AssistantThread.tsx`, `src/components/MarkdownText.tsx`, `src/index.css`): auto-scroll is now owned by `ThreadPrimitive.Viewport` (`autoScroll` + `scrollToBottomOnRunStart`) with the manual sticky/ResizeObserver tracking removed, so the view follows the response after a run completes; smooth streaming via the `MarkdownTextPrimitive` `smooth` prop (auto-disabled under reduced motion); branch navigation (`BranchPickerPrimitive`, hidden for single-branch threads); composer cancel button (`ComposerPrimitive.Cancel`, shown only while running); stall warning after 15s via `unstable_useMessageStallDetection`; composer input history (↑/↓) via `unstable_useComposerInputHistory`. Cancel and branch nav degrade invisibly until the ExternalStoreRuntime adapter exposes cancel/branch APIs
- Kimi Code CLI runtime adapter (`server/kimi-runner.ts`): poll-based REST integration (the CLI server has no SSE on prompts) — creates or reuses a session (`KIMI_SESSION_ID`), submits the prompt, pages `GET /messages?after_id=…` every 400ms until the session reports `busy=false` with no pending interaction, then archives operator-created sessions; native message envelopes persist under the `kimi_cli` source with redaction and project assistant text deltas plus activity-lane tool call start/completion records; terminal state comes from `last_turn_reason`; abort best-effort posts `:abort` before the supervisor's durable `run_cancelled`. Registered as provider `'kimi'` (server/src type unions, runtime registry, readiness, zod input, `'Kimi Code CLI'` label) when `KIMI_SERVER_URL` is set. Contract-tested against a stubbed fetch — no live Kimi server proof yet
- `GET /api/models` endpoint + model picker: the server queries the LiteLLM relay's `/v1/models` (server-side only — the LiteLLM boundary is unchanged, the browser never sees relay credentials) and decorates each id with display metadata from `server/model-registry.ts` (label, provider group, context window, capability tags); failures return `503`. `PromptComposer` gains a model picker next to the runtime picker — grouped by provider with tag pills and context sizes, a "Server default" option, persisted to localStorage `onevibe.selected-model`; the chosen `task.model` is threaded through task creation and fork, and injected as `ONEVIBE_LITELLM_MODEL` for Claude SDK and Codex runs. Caveat: Postgres persistence currently drops `task.model` (no column); the run_started evidence event records the model for both drivers
- Agent assignment on tasks (P12-03) (`server/types.ts`, `src/types.ts`, `server/db/schema.ts`, `server/persistence/postgres-metadata.ts`, `server/index.ts`, `src/lib/api.ts`, `src/App.tsx`, `src/components/BoardView.tsx`, `src/components/Workspace.tsx`, `src/components/HomeHero.tsx`, `src/lib/i18n.ts`, `src/index.css`): optional `assignedAgent` on Task (SQLite via task.json, Postgres via new `assigned_agent` column + migration 0015); `PATCH /api/tasks/:id/agent` (zod-validated slug, `null` clears, owner-scoped); board cards render an agent chip and a red `● live` marker when the assigned task is running; Workspace settings gains an "Assigned agent" dropdown (Unassigned/claude/kimi-k3/codex/human); the home view gets an en/zh "Active now" strip listing running+assigned tasks with jump-to-task chips. Browser-QA'd with Playwright (chip, live dot, dropdown value/options, strip) — evidence in `docs/browser-screenshots/qa-P12-03-*.png`

### Changed
- Add CSS motion tokens (`--duration-instant/fast/normal/slow`, `--ease-standard/decelerate/accelerate/spring`) to `:root` in `src/index.css`
- Microanimations on sidebar nav items (translateX + spring), task rows (scale hover), buttons (scale active), running status dot (pulse), send button (lift on hover)
- Skeleton shimmer class (`.skeleton`) for loading states; `@keyframes slide-in-toast` for toast/modal enter
- All motion wrapped in `@media (prefers-reduced-motion: no-preference)` — degrades gracefully
- Execution trace checkpoint UX (P5-14) (`src/components/ComputerTimeline.tsx`, `src/components/computer-timeline-activity.ts`, `src/index.css`): the `.computer-rail-scrubber` range input and "Scrub evidence" label are removed; the artifact rail is now a virtualized checkpoint list of 44px rows with a colour-coded status dot (completed / failed / approval-pending / skipped), type icon, label, timestamp, and latency badge, plus a `← n / m →` stepper for step-through navigation. Consecutive tool calls group under a collapsible LLM-turn header with failed/pending/duration aggregates, and the right-hand stage panel is the detail pane for the selected step. Filter bar, run comparison, search, and Replay/Live are unchanged

### Fixed
- Follow-up composer refresh (`src/App.tsx`): `followUpMutation` now mirrors `retryMutation` with an `onSuccess` that awaits `Promise.all([refreshSnapshot(), refreshTasks()])` — after sending a follow-up the conversation snapshot and task list update immediately instead of waiting for the next poll interval
- Board contained scroll (UI-01/UI-06, `src/index.css`, `src/components/BoardView.tsx`): `.board-view` is now a fixed-height flex column (`calc(100vh - 64px)`, `60px` topbar ≤960px) with `overflow:hidden` — kanban columns scroll independently (`grid-auto-rows:minmax(0,1fr)`, per-column `overflow-y:auto`) instead of body-scrolling the page; the stale `max-width:1200px` is removed so the board fills the available width; list mode renders inside a `.board-list-scroll` region so it cannot clip under the contained layout
- View padding standardization (UI-02, `src/index.css`): new `:root` layout tokens `--layout-content-max:960px`, `--layout-view-pad-top:48px`, `--layout-view-pad-x:48px`, `--layout-view-pad-bottom:80px`; all eight nav content views (skills, computers, appearance, homepage-editor, artefacts, capabilities — plus schedules and library, which shared the old `68px 7vw 80px` pattern) now consume one padding/max-width system, ending the jarring 68px/7vw vs 28px/32px split; a consolidated `≤640px` override keeps the existing `34px 20px` mobile padding on appearance/homepage/artefacts/capabilities

### Tests
- `server/theme-package.test.ts`: added slot-fallback, no-package-selected null, missing-manifest throw, and caller-catch rollback simulation tests. Gate: 315 tests / 63 files ✓
- `src/components/ComputerTimeline.test.ts`: replaced `virtualRailRange` coverage with `virtualRailRows` mixed-row windowing plus a checkpoint-rail suite — approval/tool/live status derivation (pending, completed, failed, skipped), LLM-turn grouping aggregates and split rules, and `railRowsFor` run-divider/depth/collapse flattening. Gate: 343 tests / 66 files ✓

### Docs
- `docs/AUTONOMOUS-ROADMAP.md`: autonomous 7-day sprint roadmap (ONEVibe × ONEComputer × OpenVTI platform vision, honest what-is-real audit, sprint sequencing) — source of truth for autonomous planning while the product owner is away
- `docs/ONECOMPUTER-MIDDLEWARE-CONTRACT.md` (P11-12): versioned HTTP contract between ONEVibe and the ONEComputer middleware — five endpoints (`GET /onevibe/capabilities`, `POST /onevibe/connector/authorize`, `POST /onevibe/sandbox/run`, `POST /onevibe/approval/webhook`, `GET /onevibe/audit/stream` SSE) with TypeScript schemas, common error shape, sequence diagrams, real `VtiTrustTaskType` mappings from `vti-consent-service.ts`, fail-closed rules, and an honest status table (no `/onevibe/*` routes exist upstream yet)
- `.kimi-code/`: Kimi Code standing instructions (`AGENTS.md`) and sprint-resume skill now versioned with the repo

---

All notable changes to ONEVibe are documented here.
Format: `## [version] — date` · sections: Added / Changed / Fixed / Security / Tests / Docs

---

## [0.1.1] — 2026-07-17

### Security
- **SVG sanitization** (`src/lib/svg-sanitize.ts`): regex-based sanitizer strips `<script>`, `<foreignObject>`, inline `on*` event handlers, `javascript:`/`data:` URI payloads in `href`/`src`, and `<use>` references to external documents. Applied server-side on logo upload and client-side on remote logo fetch. Best-effort pass; used alongside MIME/size/integrity checks, not as a substitute.
- **CSP headers** on theme preview and direct asset routes (`server/index.ts`): `default-src 'none'; script-src 'none'; object-src 'none'; base-uri 'none'`.
- **Fail-closed theme package loader** (`server/theme-package.ts`): operator allow-list enforced, symlink escape detection, SHA-256 integrity pin required.

### Added
- **WCAG programmatic acceptance tests** (`server/theme-wcag-acceptance.test.ts`): 8 tests covering contrast ratio ≥4.5:1 for nav/body/surface text pairs, CSS token completeness in `:root` and `[data-theme=light]` blocks, font allow-list, and detection of invalid `var(...)` concatenation.
- **Reference tenant theme profiles** (`docs/fixtures/themes/reference-profiles.json`): institutional, financial, philanthropic visual systems. Schema-validated, fixture-only, disabled in production.
- **`organizationId` on Task** (`server/types.ts`, `server/store.ts`): tasks created within an org-owned project now carry the `organizationId` from their parent project.
- **Computers: stale health UX** (`src/components/Computers.tsx`): shows "Last checked X min ago — click Test again to refresh" when `healthCheckedAt` is older than 2 minutes.
- **Computers: empty state** (`src/components/Computers.tsx`): "No runtimes configured" message when all providers report `not_configured`.
- **PM roadmap** (`docs/ROADMAP.md`): phase status table, sprint plan, acceptance criteria, risk register.
- **ONEComputer improvement plan** (`docs/ONECOMPUTER-IMPROVEMENTS.md`): 5 prioritised infrastructure gaps (local Postgres, Kimi stability, Playwright, API keys).

### Tests
- `server/theme-config.test.ts`: 7 SVG attack-vector tests (script injection, foreignObject, on* handlers, javascript:/data: URIs, external use references, benign passthrough)
- `src/lib/svg-sanitize.test.ts`: 6 unit tests for the sanitizer
- `server/theme-reference-profiles.test.ts`: 6 WCAG tests against the default dark profile
- `server/store.test.ts`: org membership + organizationId propagation project→task
- **Gate: 311 tests / 63 files** ✓

### Docs
- `THEMING_EXTENSIBILITY.md`: multi-tenant white-labeling extensibility design
- `HANDOVER.md`, `TODO.md`, `docs/IMPLEMENTATION-LOG.md` updated for P7 completion

---

## [0.1.0] — 2026-07-16

### Foundation release

Full local-first foundation implemented across 6 phases:

**Phase 1 — Stop the bleeding**
- Backend-offline banner, SSE event buffering, reconnection backoff, provider auto-detect, env validation, static file serving, typed `ApiError`, demo-mode labelling, crash-safe metadata writes, full golden e2e (15-min deadline, 86 replay frames).

**Phase 2 — Runtime abstraction**
- Hardened `RuntimeAdapter` interface (canonical lifecycle contract), `CodexRuntimeAdapter` (LiteLLM-routed), `AgentCoreRuntimeAdapter` (governed SSE), runtime capability declaration, per-task working directory, delta coalescing, draft queuing, fork/edit-message, `waiting_for_user_input` UX, permission approval panel.

**Phase 3 — Runtime routing**
- `RuntimeRegistry` with capability-based suggestions, runtime health dashboard, explicit fallback chain, `ONEVIBE_DEFAULT_PROVIDER` env var, provider-neutral event schema.

**Phase 4 — Cloud infrastructure (local proofs)**
- Better Auth email-OTP (loopback fixture), 14-migration Drizzle/Postgres schema, non-root Dockerfile, `fly.toml`, org/member scaffolding, dependency audit gate (zero moderate vulnerabilities).

**Phase 5 — Professional UI**
- Full assistant-ui conversation rendering, artifact panel (download/open/replay), workspace file viewer/diff/restore, approval panel, SSE reconnection UI, demo-mode banner, skill marketplace, scheduled tasks, MCP config panel, library, provider picker.

**Phase 6 — MCP + Extensions**
- Governed MCP facade (search_capabilities + execute_capability), per-task MCP injection, health dashboard, secret-free declarations.

**Phase 7 — Tenant theming (95%)**
- Token foundation, typed `TenantThemeConfig` schema (injection-safe), Postgres-backed theme store + audit, `ThemeProvider`/`ThemeSlot` runtime, Appearance editor (palette/font/radius/logo), homepage content config, reference profiles, WCAG acceptance matrix, CSP, SVG sanitization, fail-closed package loader. Manual responsive QA open (no Playwright).

**Gate at release: 288 tests / 61 files** (grown to 311/63 by end of P7)
