# ONEVibe Changelog

---

## [Unreleased]

### Added
- A2A (Agent-to-Agent) JSON-RPC runtime adapter (`server/a2a-adapter.ts`): Agent Card discovery backs `health()`; `tasks/sendSubscribe` SSE frames map to durable RuntimeEvent projections with an explicit `payload` on every EventInput; `input-required` routes through the existing UserInputBroker and the run continues on the same A2A task id; a stream ending without a terminal state fails closed with a reconciliation-required `run_failed`. Registered as provider `'a2a'` (server/src type unions, runtime registry, readiness, zod input, `'A2A Agent'` label) when `ONEVIBE_A2A_BASE_URL` is set. Contract-tested only — no live A2A endpoint proof yet
- Streaming cursor (`src/components/AssistantThread.tsx`, `src/index.css`): blinking caret (`.streaming-cursor`) rendered at the end of the actively-streaming assistant text part, replacing the always-on bottom typing dots while text streams; respects `prefers-reduced-motion`
- Computers view i18n (`src/components/Computers.tsx`, `src/lib/i18n.ts`): user-visible strings routed through the typed en/zh dictionary with `{minutes}`/`{time}`/`{healthy}`/`{total}`/`{count}`/`{latency}` interpolation; technical identifiers (LiteLLM, MCP, env vars, placeholders, server-provided detail strings) intentionally untranslated
- Capability cards on the home view (`src/components/CapabilityCards.tsx`): starter prompt list replaced by three icon cards (Research/Build/Automate) whose en/zh titles, descriptions, and prompts come from the i18n dictionary; token-only styling with a reduced-motion-safe hover lift; also passes the `locale` prop through to `Computers`

### Changed
- Add CSS motion tokens (`--duration-instant/fast/normal/slow`, `--ease-standard/decelerate/accelerate/spring`) to `:root` in `src/index.css`
- Microanimations on sidebar nav items (translateX + spring), task rows (scale hover), buttons (scale active), running status dot (pulse), send button (lift on hover)
- Skeleton shimmer class (`.skeleton`) for loading states; `@keyframes slide-in-toast` for toast/modal enter
- All motion wrapped in `@media (prefers-reduced-motion: no-preference)` — degrades gracefully

### Tests
- `server/theme-package.test.ts`: added slot-fallback, no-package-selected null, missing-manifest throw, and caller-catch rollback simulation tests. Gate: 315 tests / 63 files ✓

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
