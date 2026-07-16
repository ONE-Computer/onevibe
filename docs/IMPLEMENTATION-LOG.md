# Implementation log

## 2026-07-17 — fail closed on known first-party model endpoints

- Expanded the shared `isLiteLlmRelayUrl` guard used by the Claude SDK and ONEComputer worker to reject known Anthropic, OpenAI, Bedrock, Gemini, Groq, Mistral, Cohere, xAI, and DeepSeek first-party hosts when they are mislabeled as LiteLLM relays.
- Added regression coverage for OpenAI, Bedrock, Gemini, and Groq endpoints. A relay must remain an operator-controlled HTTP(S) endpoint without embedded credentials; the server never silently falls back to a first-party provider.
- Focused provider tests, lint, build, and the full test suite pass (51 files / 257 tests).

## 2026-07-17 — enforce the hardened container contract in CI

- Added a separate GitHub Actions container job that builds the multi-stage image, starts it with a read-only root filesystem, no-new-privileges, dropped capabilities, and an ephemeral writable data mount, then verifies `/api/health` and UID 10001.
- Local verification passed with `docker build`, the same security flags, `/api/health`, Compose config validation, and explicit non-root identity checks. The data mount is deliberate: persistence is writable, while the image root remains immutable.
- This improves the P4-03 container release gate but does not claim Postgres runtime support, cloud deployment, or sandbox isolation.

## 2026-07-17 — add bounded MCP health probing

- Added `GET /api/mcp/:id/health`, scoped through the authenticated owner inventory, which starts the declared stdio server with the existing secret-free environment boundary, performs initialization and `tools/list`, and returns only `online`/`offline`, bounded latency, tool count, and generic failure detail.
- Added a real Test action in Computers and regression coverage proving a healthy fixture catalog, an offline process, and cross-owner `404` isolation. The probe closes its child process and does not return stderr, tool results, environment values, or credentials.
- This closes the local MCP health visibility slice only. Production secret brokering, external-server attestation, rate limiting, and protected provider materialization remain open.
- Fresh temporary API verification also covered `POST /api/mcp` followed by `GET /api/mcp/:id/health`: an unavailable fixture returned a bounded `offline` response without process output or credentials.

## 2026-07-17 — drain MCP stderr at the process boundary

- MCP child stderr is now continuously drained and capped at 256 KiB. A noisy or malformed server fails the pending request instead of filling the pipe and deadlocking initialization; stderr content is never returned to the browser or persisted as evidence.
- Added a regression fixture that emits 300 KiB of stderr and verifies the bounded probe fails offline promptly. Focused MCP tests, lint, and build pass.

## 2026-07-17 — include MCP health in authenticated diagnostics

- `/api/diagnostics` now probes only the current owner's MCP declarations and returns bounded per-server health/tool-catalog metadata plus healthy/configured counts. Computers displays the aggregate state while the per-server Test action remains available for detail.
- The authenticated owner harness verifies that an unavailable owner-scoped server is reported as `0/1` healthy and that the result does not include process output. Production secret brokering, external-server attestation, rate limiting, and protected provider materialization remain open.

## 2026-07-17 — validate legacy import relationships before Postgres writes

- Moved Postgres legacy-import relationship validation into `server/persistence/import-validation.ts` so it can be tested without importing or executing the CLI entrypoint.
- The importer now rejects a task or schedule whose project reference is missing or whose owner differs from the referenced project owner before opening a Postgres transaction. This closes a concrete cross-owner foreign-key association risk in the legacy path; it does not replace database constraints or complete the Postgres repository/runtime switch.
- Added regression coverage for valid same-owner relationships and missing/cross-owner task/schedule references. `npm run db:import -- --dry-run` remains owner-gated, and the release gate now type-checks the importer with the server's `skipLibCheck` policy.

## 2026-07-17 — expand authenticated owner-scope HTTP proof

- Fixed the server error mapper so cross-owner project, project-file, schedule, and other resource misses return `404` instead of leaking as generic `500` responses. The ownership check still happens before the resource operation; the status correction makes the boundary truthful and avoids revealing whether another user's record exists.
- Extended `scripts/auth-owner-e2e.ts` to cover two-user inventory isolation and cross-user project update/file read, schedule deletion, MCP deletion, task read/movement/tag mutation. The real Better Auth email-OTP flow still uses only a loopback delivery fixture in this local proof.
- `npm run e2e:auth-owner`, `npm run lint`, `npm run check:e2e-harness`, and the full `npm run check` pass. Production email, organization membership, Postgres ownership, and exhaustive route coverage remain open.

## 2026-07-17 — handover consistency audit and LiteLLM policy reaffirmation

- Re-read `HANDOVER.md`, `TODO.md`, the local parity roadmap, the phase plans, and the live ONEVibe Linear project. The handover now reflects the current 915-line API server, the 1,427-line SQLite TaskStore, the completed Zustand boundary, ordinary-collection TanStack Query migration, and the intentionally open active-task/SSE mutation boundary.
- Clarified the handover policy: LiteLLM is the only permitted model-routing boundary for every agentic turn. Direct first-party Anthropic traffic is prohibited as a fallback, development shortcut, test fixture, emergency path, or release path; an unavailable relay must fail closed.
- Reaffirmed the non-negotiable routing rule: every model request must cross the server-controlled LiteLLM boundary for data-sovereignty, routing, cost, and optimization. No direct first-party Anthropic endpoint, key, or fallback is permitted; the Claude SDK receives only derived LiteLLM-compatible configuration.
- Reconciled the board snapshot at 46 scoped issues: 10 Done, 26 In Progress, and 10 Backlog. ONE-260 is now Done for the local Query mutation boundary; Postgres remains a target contract/import proof rather than the running application driver.

## 2026-07-17 — opt-in MCP capability facade

- Added `server/mcp-facade.ts`: a server-owned, bounded stdio JSON-RPC client that lists configured MCP tools, token-scores capability searches, and executes only an exact capability ID returned by the same catalog. It uses `shell: false`, a secret-free child environment, 5-second request deadlines, bounded frames/results, and explicit cleanup.
- Hardened mixed MCP stdio framing: the client now recognizes `Content-Length` headers before newline parsing, and the fixture test exercises both framed tool discovery and newline-delimited initialization/execution responses.
- Integrated the facade into non-chat Claude Agent SDK tasks behind `ONEVIBE_MCP_FACADE_ENABLED=true`. When enabled, raw configured MCP servers are not exposed to the SDK; only `search_capabilities` and `execute_capability` are registered. It does not grant approval authority or bypass LiteLLM.
- Added a deterministic child-process fixture test covering search, exact-ID execution, unknown-capability rejection, and abort handling. `npm run lint`, `npm run test` (50 files / 247 tests), `npm run build`, `npm run db:check`, and `npm run check:e2e-harness` pass. Production MCP health, secret brokering, authenticated ownership, and protected provider acceptance remain open.

## 2026-07-17 — active-task Query mutation gate

- Closed the remaining local P5-02 boundary. Active task stop/retry/follow-up/branch/share/guidance/project/tag actions already use TanStack Query mutation hooks; this pass makes share requests and queued-guidance removal visibly pending, keeps the composer disabled during active mutation requests, and preserves toast-based mutation errors.
- `useTask` remains the sole server-authoritative SSE/replay snapshot. Successful mutations either refresh that snapshot or reconcile server-derived task/conversation/library caches; no second browser-owned transcript store was introduced. `npm run lint`, `npm run test` (50 files / 247 tests), and `npm run build` pass.

## 2026-07-17 — browser-found desktop grid overflow

- Browser QA at a 1,280×900 viewport found that Sonner's notification region was being rendered inside `.app-shell` as an extra CSS-grid child. That pushed the main shell onto a second row, compressed the task view to the first grid track, and produced a 9px horizontal overflow despite the mobile layout appearing healthy.
- Moved `<Toaster>` outside the application grid and pinned `.main-shell` to the second grid column. Rechecked the current Vite app at 1,280×900 and 390×844: both report no horizontal overflow; the 390px task flow completed an explicit simulation chat (`task_81887ee319804a`) with the conversation surface visible. The protected Claude/LiteLLM browser acceptance remains open because no relay credentials were present in this local session.

## 2026-07-17 — owner scope propagation for task mutations

- Closed a concrete local multi-tenancy gap: authenticated task routes already asserted task ownership, but `moveTaskToProject` and `updateTaskTags` discarded the actor scope when entering `TaskStore`. Both APIs now accept and enforce `ownerUserId`; task-to-project movement cannot target another user's project, and tag mutation cannot address another user's task.
- Added negative coverage for both cross-user cases in `server/store.test.ts`. Focused store tests, lint, and build pass. HTTP-level negative coverage, Postgres ownership, and organization membership remain open under P4-06/ONE-253.

## 2026-07-17 — authenticated owner-scope HTTP proof

- Added `scripts/auth-owner-e2e.ts` and `npm run e2e:auth-owner`. A loopback mail-catcher receives the OTP generated by the real Better Auth email-OTP plugin; the harness then signs in two users through `/api/auth/sign-in/email-otp` and retains only their session cookies.
- The proof covers unauthenticated `401`, owner A task creation/read access, owner B empty task inventory, and `404` isolation for task read, project movement, and tag mutation. It passed with separate Better Auth user IDs and a completed owner task. This is a local SQLite/HTTP proof only; it does not claim real email delivery, Postgres runtime ownership, org membership, or production auth acceptance.

## 2026-07-17 — reject mislabeled direct Anthropic relay URLs

- Hardened `claude-provider-config.ts` with a shared `isLiteLlmRelayUrl` check. The server now refuses invalid/credential-bearing URLs and known first-party Anthropic hosts even when an operator supplies them through `ONEVIBE_LITELLM_URL`; the child SDK receives no Anthropic credential in that case.
- Applied the same validation to `ONEVIBE_SANDBOX_LITELLM_URL` before constructing the ONEComputer worker command. Added regression coverage for direct Anthropic rejection and a valid internal relay URL. Protected live provider acceptance remains open.

## 2026-07-17 — handover evidence reconciliation

- Reconciled the phase checklist against the current implementation and regression evidence: P1-01 backend-offline recovery, P1-08 permanent simulation disclosure, and P2-07 durable guidance queueing are complete and now marked as such in `TODO.md`.
- P2-08 conversation branching/edit-message was the next Phase 2 gap and is now complete in the following implementation slice. The release gate still requires `npm run check`, and all model traffic remains LiteLLM-only; a direct first-party Anthropic route is not an accepted fallback.

## 2026-07-17 — durable conversation branching

- Completed P2-08 locally. `POST /api/tasks/:id/fork` validates a terminal source conversation and user-message boundary, creates a new task with parent lineage, copies the path-confined workspace, truncates durable history before the selected message, and schedules the edited prompt as a new provider turn.
- Added assistant-ui inline editing for user messages. “Edit” is explicit and creates a new branch; the original conversation is never rewritten. Branch evidence records the source task/message and source evidence head, and cloned message/turn IDs are independent.
- Added persistence/reload and mutable-workspace isolation coverage. This is local SQLite/host-workspace evidence only; cloud auth, multi-user authorization, and sandbox isolation remain open.

## 2026-07-17 — hardened local container boundary

- Added a multi-stage `Dockerfile` that builds the SPA and runs the API on Node 22 as non-root UID 10001. It keeps the server-side LiteLLM configuration boundary intact and includes the runtime source/assets needed by the current TypeScript API.
- Added `docker-compose.yml` with a named SQLite data volume, API healthcheck, read-only root filesystem, no-new-privileges, dropped capabilities, and bounded `/tmp`. A Docker build and 22-second smoke run returned `/api/runtime` and `/` successfully; the container became healthy and ran as user `onevibe`.
- This is a deployable local container shape, not completion of cloud Phase 4: Postgres/Drizzle, auth/session middleware, multi-user isolation, managed deployment, and sandbox attestation remain open. The Compose file intentionally does not advertise an unused Postgres service.

## 2026-07-17 — close two professional-UI dead ends

- Completed P5-04 locally: removed non-functional Settings affordances, made the workspace refresh control reload the authoritative task file list, and replaced the hardcoded Skills badge with the live catalog count.
- Completed P5-05 locally: the sidebar search input debounces server-backed conversation search so unloaded history is discoverable through `/api/conversations?q=...`; short queries retain the loaded-summary filter and empty/error states remain explicit.
- Verification: `npm run lint` and `npm run build` pass. This slice does not claim auth-backed search isolation; that remains part of Phase 4.

## 2026-07-17 — make schedule deletion real

- Completed P5-06 locally: added durable `DELETE /api/schedules/:id`, a confirmed trash action in the Schedules view, and regression coverage proving schedule removal persists while previously dispatched tasks remain intact.
- Verification: focused store suite passes (40 tests), lint passes, and the production build passes. The confirmation is a user-intent guard, not an authorization boundary; auth and multi-user ownership remain open.

## 2026-07-17 — make skill capacity explicit

- Completed the remaining P5-13 skill-capacity UX slice: once four guides are selected, unselected skill buttons are disabled and explain how to make room. This makes the existing server/client four-skill limit visible instead of silently ignoring the fifth click.
- Full `npm run check` passes with 43 test files and 226 tests, lint, production build, and E2E harness typecheck.

## 2026-07-17 — close history and evidence-log dead ends

- Completed P5-08: workspace history restore now requires explicit confirmation, shows a disabled in-flight state, refreshes authoritative files after the server restore, and exposes success/error status without pretending a browser-only mutation occurred.
- Completed P5-09: the evidence rail keeps a concise latest-six default but now offers an explicit all-events toggle with durable sequence/hash identifiers, so older evidence is not hidden behind an irreversible slice.

## 2026-07-17 — canonical UI status language

- Completed P5-10 in the primary task and runtime surfaces. `statusLabel`, `providerLabel`, and `tokenLabel` now own user-facing run/provider/mode/boundary labels instead of raw underscore-enum strings leaking into badges, dashboards, activity summaries, or runtime inventory.
- Verification: lint and production build pass; the next full gate will include this presentation-only slice.

## 2026-07-17 — make working traces reviewable

- Completed P5-12: the assistant-ui working trace has a visible disclosure chevron, stays open while a provider turn is running, and renders long operational summaries through a nested Show more disclosure instead of discarding content after 240 characters.
- The trace remains an operational projection only; it never exposes hidden chain-of-thought, raw credentials, or unbounded provider payloads.

## 2026-07-17 — accessibility metadata pass (partial)

- Added machine-readable `dateTime` to the sidebar, Library, runtime health, and Computer inventory timestamps; runtime latency is now rendered as a duration rather than a misleading `<time>`; screenshot thumbnails receive meaningful alt text.
- P5-11 remains open for the remaining Workspace activity timestamp and the full keyboard/screen-reader browser audit; this slice is intentionally not marked complete from source inspection alone.

## 2026-07-17 — auth/Postgres architecture decision

- Added `docs/AUTH-POSTGRES-ADR.md` after reviewing the current Better Auth Drizzle and email-OTP contracts. It defines the migration sequence, ownership/session boundaries, production OTP transport requirement, cross-user negative tests, and the explicit `ONEVIBE_AUTH_ENABLED` deployment policy.
- This is a design artifact only. No auth or Postgres ticket was marked complete, and the current Docker Compose path remains a single-instance SQLite deployment. The LiteLLM-only model-routing rule is carried into the target architecture.

## 2026-07-17 — auditable Library removal

- Completed P5-07 locally: `DELETE /api/library/:taskId` hides a completed artifact from the Library view, records an evidence event, and preserves the originating task, workspace, conversation, and evidence chain. The UI requires explicit confirmation and explains that removal is non-destructive.
- Focused store suite passes with 41 tests; lint and production build pass. The next full gate will reconcile the repository total.
- Full `npm run check` passes with 43 test files and 227 tests, lint, production build, and E2E harness typecheck.

## 2026-07-16 — runtime routing browser acceptance

- Browser-checked the local Vite app at `http://127.0.0.1:5173/` after the RuntimeRegistry/routing pass. The home composer truthfully reports that no governed runtime is configured and labels the active path `Simulation only · no model call`.
- Verified the runtime picker in Chat mode: Simulation is the only configured/recommended option; ONEComputer, Claude SDK, Codex-compatible, Remote, and AgentCore entries are visibly disabled with configuration reasons rather than presented as usable.
- Verified mode-aware capability filtering in Slides mode: Simulation is disabled with `Missing capability: tool_use`, while the governed alternatives remain disabled with their own setup requirements. This prevents an incompatible runtime from being selected for a mode that needs tools/files.
- This browser evidence covers local selector truthfulness and capability messaging only. It does not claim live LiteLLM provider availability, startup health attestation, sandbox isolation, or production deployment.

## 2026-07-16 — RuntimeRegistry startup health cache

- Completed P3-01. `RuntimeRegistry` now probes every configured/available adapter on first API readiness access, warms the same path during API startup, and caches provider-owned health results for 15 seconds by default.
- `/api/runtime` now exposes only provider-neutral health status, bounded latency, and an ISO probe timestamp alongside capabilities; provider response bodies and credentials remain server-only.
- An explicitly offline or not-configured runtime is no longer considered routable by capability suggestions, but remains visible with its health/configuration explanation for operator diagnosis. Manual `POST /api/runtime/test/:provider` probes refresh the cache.
- Added regression coverage for startup warming, cache reuse, health metadata projection, and offline-provider exclusion. Full `npm run check` passes with 43 test files and 225 tests, lint, production build, and E2E harness typecheck.

## 2026-07-16 — handover Phase 1: backend-offline boundary

- Re-read `HANDOVER.md`, `TODO.md`, the phase plans, the local parity roadmap, and the current Linear project before changing code. The active sequence is now the handover's Phase 1 foundation; platform promotion remains deferred.
- Added a typed `ApiError` boundary in `src/lib/api.ts`. HTML SPA fallbacks and non-JSON responses no longer surface as an unhandled JSON parse failure; structured JSON HTTP errors retain status and error code.
- Added a persistent, retryable backend-offline banner to `App.tsx`. The banner is driven by the runtime readiness request and also recognizes network-level fetch failures; readiness recovery removes it.
- Added focused API error tests. Full `npm run check` passes with 38 test files and 209 tests, lint, production build, and E2E harness typecheck.
- This slice is local browser/API failure-path work only. It does not claim auth, multi-user isolation, microVM enforcement, OpenVTC approvals, or production deployment.

## 2026-07-16 — mandatory LiteLLM routing policy

- Updated `HANDOVER.md`, `AGENTS.md`, and `TODO.md`: all model traffic must traverse the server-controlled LiteLLM relay for data sovereignty, routing, cost, and optimization. Direct first-party Anthropic traffic is prohibited; the Claude SDK fallback is tracked as the follow-up enforcement slice below.

## 2026-07-16 — LiteLLM-only Claude enforcement

- Removed the direct `ANTHROPIC_API_KEY` provider fallback from `server/claude-provider-config.ts`. A Claude SDK task is now unavailable unless both server-controlled LiteLLM endpoint and relay credentials are present.
- Fail-closed configuration strips inherited `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, and `ANTHROPIC_AUTH_TOKEN` values when the relay is not configured, preventing an ambient direct route from reaching the child SDK.
- Updated Claude run-limit defaults, runtime readiness, local E2E fixtures, security/runbook material, and phase plans to describe LiteLLM as the only accepted model path. The SDK still receives Anthropic-compatible variable names only when they point at the relay.
- Focused provider, readiness, run-limit, and Claude SDK tests pass (16 tests), lint, production build, and E2E harness typecheck pass. Codex/AgentCore adapters are not yet implemented, so ONE-245 remains open for those future harnesses.

## 2026-07-16 — handover Phase 1: SSE pre-snapshot replay

- Fixed P1-02 in `src/hooks/useTask.ts`: runtime events received while the initial REST snapshot is still loading are buffered and merged into the snapshot once it arrives.
- The merge is ID-deduplicated and preserves the latest durable status; events already present in the REST snapshot are not appended a second time.
- Added focused tests for buffered replay, status convergence, and persisted/live duplicate suppression.

## 2026-07-16 — handover Phase 1: bounded SSE reconnect

- Replaced the browser-native EventSource reconnect loop with an explicit task-bound connection lifecycle. Failed connections close before retry, use 500ms/1s/2s/4s/8s backoff, stop after five attempts, and expose a manual Retry connection action.
- Terminal task states stop reconnect scheduling; stale EventSource callbacks are ignored after handoff or cleanup.
- Focused reconnect tests and the full `npm run check` pass: 38 test files and 212 tests, lint, production build, and E2E harness typecheck.

## 2026-07-16 — handover Phase 1: runtime startup, selection, and serving

- P1-04 now selects the first available governed runtime in explicit order (Claude SDK, ONEComputer, remote) and refuses to submit the home composer until runtime readiness has loaded. If no governed runtime is available, the setup state names the protected LiteLLM configuration rather than silently choosing simulation.
- P1-05 adds `scripts/dev-check.ts`, loads `.env` for validation without logging values, updates the development API process to load `.env`, and reports when only explicitly labelled simulation is available. The development command now runs the check alongside API and Vite.
- P1-06 adds path-confined production static serving with SPA fallback. API routes remain JSON routes, unknown SPA routes resolve to `dist/index.html`, and traversal attempts are rejected. Production smoke verification returned HTTP 200 for `/`, `/tasks/task_demo`, and JSON for `/api/runtime`.
- The P1-08 simulation disclosure is now visible in the task conversation and offers a new governed task only when a governed runtime is actually available. Browser acceptance of this state remains open.
- Full `npm run check` passes with 39 test files and 214 tests, lint, production build, and E2E harness typecheck.

## 2026-07-16 — Phase 2 capability boundary

- Added a canonical runtime capability vocabulary and required provider metadata to the existing adapters. `/api/runtime` now returns capability declarations without credential material.
- The provider picker surfaces capabilities, and the Workspace uses capability declarations to gate Files and Live X11 surfaces rather than inferring them from provider identity or sandbox state.
- Claude host execution is explicitly not labelled sandboxed/computer-use; ONEComputer development runtime declares those capabilities only when that provider is configured.
- This is the capability slice of P2-04. The broader P2-01 lifecycle contract and new Codex/AgentCore adapters remain open.

## 2026-07-16 — Phase 3 registry and capability routing slice

- Added `server/runtime-registry.ts` as the provider construction and routing boundary. The server no longer selects adapters through a provider-specific conditional; registered factories, effective default selection, and mode-aware suggestions are centralized.
- `RuntimeRegistry.suggest(mode)` ranks only capability-compatible providers ahead of simulation, explains missing capabilities/unavailability, and prefers a sandboxed provider when the mode can use it. `/api/runtime` now returns the effective default plus suggestions for every supported task mode.
- Added `ONEVIBE_DEFAULT_PROVIDER`; it is honored only when the requested provider is registered, available, and compatible, then falls back to the highest-ranked governed provider and finally the explicitly labelled simulation runtime.
- Added focused registry tests for ranking, operator-default fallback, capability explanations, and readiness snapshots. The server create/schedule/follow-up paths now use the registry's generic availability contract rather than provider-specific error branches.

## 2026-07-16 — Phase 3 runtime health probe slice

- Added provider-owned runtime health probes to the registry boundary and `POST /api/runtime/test/:provider`. Claude probes only the configured LiteLLM `/health` endpoint, ONEComputer uses its authenticated health route, and the demo runtime reports its explicit simulation boundary; unsupported probes return `unknown` rather than claiming connectivity.
- Health responses are bounded to status, latency, and generic detail. Endpoint URLs, credentials, provider response bodies, and control-plane payloads never enter the browser response.
- Full `npm run check` passes with 41 test files and 219 tests, lint, production build, and E2E harness typecheck. The Computers → Runtimes health dashboard is now wired; user-consent fallback remains open P3 work.

## 2026-07-16 — Phase 3 runtime health dashboard

- Added a read-only Computers → Runtimes registry panel. Each provider exposes its current availability, generic detail, and an explicit server-side Test action; the UI never receives endpoint URLs, credentials, raw provider bodies, or sandbox claims.
- Added responsive health-card styling for desktop/mobile and preserved the observation-only boundary: testing a runtime cannot provision, restart, terminate, or approve infrastructure.

## 2026-07-16 — Phase 2 per-task workspace lifecycle

- The canonical adapter initializer now creates the task-specific working directory before provider execution. Every current adapter receives the same path, and file/preview hooks plus the API file projection remain rooted there.
- This closes the P2-05 workspace ownership contract without claiming cross-task isolation beyond the current host-process/development-provider boundaries; production microVM evidence remains separately tracked.

## 2026-07-16 — Phase 2 frame-batched live event projection

- `useTask.ts` now buffers live events into a frame-sized UI queue and applies one snapshot update per animation frame (with a 16 ms fallback where `requestAnimationFrame` is unavailable). The append-only event ledger, event IDs, replay cursor, and pre-snapshot buffer remain unchanged, so batching cannot erase evidence or create duplicate history.
- Terminal status and reconnect handling remain immediate; only React presentation updates are batched. This closes P2-06 without changing server SSE semantics.

## 2026-07-16 — Phase 2 waiting/input and approval presentation

- Moved the durable task timeline before the assistant-ui composer so user-input and wallet-approval cards are actionable above the composer rather than below it.
- Removed `waiting_for_user_input` from assistant-ui's `isRunning` state. The composer now says it is waiting for the user's answer, disables attachment/send controls while the request is pending, and preserves the external wallet as the approval authority.
- Fixed a release-gate flake exposed by the full test run: PPTX normalization now sorts ZIP entries and pins container timestamps to the durable task creation time. Focused and full gates are green after the fix: 43 test files / 222 tests, lint, production build, and E2E harness typecheck.

## 2026-07-16 — Phase 3 runtime choice and explicit fallback

- Replaced the flat composer runtime list with a ranked, mode-aware provider selector. It now shows the advisory recommendation, availability, capability badges, execution boundary, and the registry's reason; providers missing required capabilities are visible but disabled rather than silently hidden.
- Added the explicit fallback contract. A failed provider run can project a compatible alternative as `runtime_fallback_available`; the user must choose the alternative, and the retry API records the provider switch plus a reset execution boundary before starting the retry. No runtime substitution happens automatically.
- Tightened mode requirements so artifact and agent modes require governed tool use and file access where their workflows depend on it. The canonical runtime event schema remains provider-neutral; provider-specific metadata stays in bounded payloads/native envelopes.
- The full release gate remains the acceptance check; browser confirmation of the new selector/fallback card is still required before closing the remaining visual QA work.

## 2026-07-16 — Phase 2 Codex-compatible LiteLLM adapter

- Added `server/codex-runner.ts` as a real OpenAI-compatible streaming adapter that calls only the configured LiteLLM `/v1/chat/completions` route. It normalizes streamed text and bounded workspace tool calls into the ONEVibe event ledger and confines reads/writes to the task workspace.
- Added the `codex` provider to the shared task/runtime contract, readiness projection, registry factory, server task/schedule routes, provider labels, and native-event source vocabulary. It is available only when the server-controlled LiteLLM relay is configured.
- This adapter does not claim a sandboxed execution capability; host workspace operations are path-confined but still require the later sandbox boundary. Live provider acceptance remains pending a configured Codex-compatible LiteLLM alias and E2E run.

## 2026-07-16 — Phase 2 AgentCore LiteLLM-routed remote boundary

- Added `AgentCoreRuntimeAdapter` as a named provider over the governed remote SSE contract. It reuses the normalized remote event path but sends `provider=agentcore` and records `agentcore_runtime` as the native source.
- AgentCore is advertised only when `AGENTCORE_RUNTIME_URL` is configured and `ONEVIBE_AGENTCORE_LITELLM_ROUTED=true`. ONEVibe never accepts AWS static credentials or a direct model endpoint for this path, and it does not infer sandbox isolation from the provider name.
- The adapter is source-level and contract-tested through the shared remote path; live AgentCore endpoint, LiteLLM route, AWS identity-chain, and isolation evidence remain required before production acceptance.

## 2026-07-16 — Phase 2 runtime lifecycle contract

- Added `RuntimeAdapterBase` and the canonical lifecycle surface: `initialize(task, workingDir, mcpConfigs)`, `run(prompt, context, signal)` as an async stream, `cancel`, `destroy`, `getFiles`, and `getPreviewUrl`.
- Migrated Demo, Claude SDK, ONEComputer, and Remote adapters onto the shared lifecycle base. Their existing append-only store writes are exposed through a persisted event stream, so the server drains provider-neutral `RuntimeEvent` values without duplicating evidence or changing the current E2E semantics.
- Added cancellation routing from the API and turn deadline into the active adapter, plus a focused contract test proving initialization, event streaming, no duplicate persistence, file access, and preview behavior.
- Provider execution no longer exposes the legacy one-argument overload; `LegacyRuntimeContext` is an internal implementation context only. Runtime registry extraction and Codex/AgentCore remain open.

## 2026-07-16 — light-mode Claude calibration (Phases 11–15)

User feedback ("prefer a light color; motion too cheesy; want
Claude UX") triggered a third five-phase pass. Each phase is one
commit on `main` with `npm run lint` + `npm run test` (207/207)
green. Full acceptance screenshots in
`docs/evidence/2026-07-16-ux-overhaul-v3-light/`.

- **Phase 11 — light-mode default:** default theme flips light;
  Anthropic-warm paper palette (#faf9f5 canvas, #2b2b28 text, #c96442
  restrained terracotta); every decorative animation neutralized.
- **Phase 12 — Claude-style home + composer:** HomeHero collapses to
  a single greeting line; composer swaps rotating placeholder for a
  static "How can I help you today?"; keyboard hint row removed;
  three ghost suggestion chips; recent/library home strips retired.
- **Phase 13 — sidebar restraint:** rows drop mode icons and time
  column; status dots hidden; preview line hidden; new-task pill
  becomes a plain ghost row; nav-item active bar retired for a
  neutral surface fill.
- **Phase 14 — typography + spacing:** greeting clamp(24–30) 500wt;
  view h1s 28px 500wt; view eyebrows lose uppercase-tracking;
  library/skills/computers/schedules cards flatten to white panels
  with hairline borders.
- **Phase 15 — acceptance sweep:** full desktop + mobile screenshot
  matrix; docs updated.

## 2026-07-16 — aesthetic-reset pass (Phases 6-10)

A second five-phase pass rebuilt the visual layer on top of the
earlier polish pass. Each phase is one commit against `main` with
`npm run lint` + `npm run test` (207/207) green. Full acceptance
screenshots in `docs/evidence/2026-07-16-ux-overhaul-v2/`.

- **Phase 6 — aesthetic reset:** default theme flipped from system →
  dark; new dark palette (charcoal canvas, warmer emerald primary,
  amber second accent for governance/approval states); ambient
  drifting glow behind composer; 3.6s brand-mark heartbeat as the
  signature motion moment; gradient-fill Inter 900 hero (still
  sans-serif); mode/provider pickers rendered as real pill buttons.
- **Phase 7 — living-workspace home:** corporate "What will you build
  safely?" replaced with a time-of-day greeting, a live activity
  line, a Recent-conversations strip, and a From-your-library strip
  showing the newest artifacts. New `src/components/HomeHero.tsx`.
- **Phase 8 — composer as hero:** rotating placeholder cycles 6
  concrete task examples every 4.2s; global ⌘K focus hook; keyboard
  hint row (⌘K/↵/⇧↵); Attach and Reference promoted to labeled 32px
  pill buttons; redundant "governed" pill removed.
- **Phase 9 — sidebar personality:** conversations group under
  Today / Yesterday / This week / Older; mode icon per row; compact
  relative time in a tabular-nums right column; two-line title +
  preview.
- **Phase 10 — polish sweep:** unified button transitions, sharpened
  focus rings, new-task pill now a real emerald CTA with ⌘K badge,
  simplified eyebrow copy across Skills/Library/Computers/Schedules,
  Schedules empty state made directive.

## 2026-07-16 — five-phase assistants-ui polish overhaul

Executed the outstanding P0/P1 items in
`docs/ONEVIBE-ASSISTANTS-UI-UX-OVERHAUL.md` in five bounded commits
against `main`. Each commit is independently green under
`npm run lint` + `npm run test` (207/207) and each was screenshotted at
1440x900 (welcome). Full acceptance matrix (desktop + mobile for
welcome, skills, library, computers, schedules) stored in
`docs/evidence/2026-07-16-ux-overhaul/`.

- **Phase 1 — mono purge:** 66 `'IBM Plex Mono'` declarations in
  `src/index.css` and 2 in `src/timeline.css` replaced with the same
  Inter / system sans-serif stack. Removed the last visible
  typography-contract violation from the P1 workstream.
  `.claude/launch.json` is now gitignored.
- **Phase 2 — home density:** dropped the composer's nested
  three-card template gallery, the "Before you delegate" accordion,
  the home-badge, and the assurance-bullet strip. Hero clamps
  88px → 64px so the composer sits above the fold. Unused template
  arrays removed.
- **Phase 3 — message polish:** removed the "ONEVibe" sender label
  from every assistant turn; renamed tool-call fallback "Governed
  runtime" → "Secure runtime"; bumped tool-call and artifact-card
  typography (11→12/10.5/11.5/10, 10→12/10.5/10); working trace
  collapses to "Review working trace (N steps)" post-completion.
- **Phase 4 — sidebar hierarchy:** relocated the "OpenVTC protected"
  card from the sidebar footer to a compact topbar trust-chip;
  bumped conversation-row and section-label sizing so the list reads
  as content, not chrome.
- **Phase 5 — copy audit:** removed "governed" only where cosmetic
  ("Loading governed workspace…" → "Loading task…", composer aria
  label, mode-picker detail, workspace placeholder). "Governed" is
  preserved wherever it references the durable evidence ledger.

Follow-ups still open (unchanged from the previous entry): active-task
screenshot on a live provider run, exact-width visual-regression
baseline harness in CI.

## 2026-07-16 — mobile Computer inspector handoff

- Added an explicit mobile inspector handoff: at widths below 960px the conversation remains the primary screen, `View computer` opens the full-height Computer inspector, and `Back to conversation` returns without rendering two compressed panes at once.
- Browser acceptance at the available 390px-class viewport (effective CSS width 487px in the in-app browser) passed both directions: opening set `.task-view.mobile-inspector-open`, hid the conversation, showed the inspector bar, and kept `scrollWidth === clientWidth`; closing restored the conversation and hid the workspace. No console errors or warnings were recorded.
- Desktop behavior is unchanged: conversation and Computer inspector remain side-by-side. The visual regression suite still needs a stable CI screenshot harness across exact 390px/tablet/desktop dimensions.

## 2026-07-16 — assistant-ui grouped tool disclosure

- Replaced the flat assistant message part renderer with `MessagePrimitive.GroupedParts` and `groupPartByType`, grouping adjacent tool calls under a collapsible `Tool activity` disclosure while retaining the same custom bounded tool card.
- Browser verification on `task_f8d51a10de4f4d`: the assistant thread exposes one collapsed `Tool activity · 3 calls` group, and the Computer inspector independently opens on the paired Bash command/result. The two surfaces now have clear roles instead of repeated rows.
- Full `npm run check` passes with 37 test files / 207 tests, build, lint, and E2E harness typechecks. The group is a projection only; durable SQLite/SSE/evidence ownership is unchanged.

## 2026-07-16 — sans-serif evidence surface contract

- Applied a late-bound sans-serif contract to the visible ONEVibe surface, including conversation metadata, terminal/code previews, rail labels, controls, and timeline surfaces. Evidence remains distinguishable through hierarchy, spacing, color, and panels rather than a mono font.
- Browser verification on the real Bash task reports `Inter, ui-sans-serif, system-ui, sans-serif` for both body and terminal/code elements, with the CLI Bash card still selected by default.
- Verification: `npm run check` passes with 37 test files / 207 tests, production build, and E2E harness typechecks. This is the visual-system slice for ONE-244; responsive desktop/mobile regression remains open.

## 2026-07-16 — unified tool narrative and mode-aware Computer inspector

- Removed tool-call rows from the assistant-ui working summary when the same `(runId, toolUseId)` is already rendered as a native assistant-ui tool part and a durable Computer-rail card. The assistant message now carries the operational/control summary; the detailed command/result appears once in the tool card and once in the side evidence inspector.
- General tasks with a real CLI command now open the Computer inspector on the latest command/result by default. Website/document/slide tasks retain deliverable-first behavior, while manifest and validation receipts are excluded from the default selection.
- Browser verification on `task_f8d51a10de4f4d`: the selected rail card is `CLI command · Bash`, showing `$ wc -c NOTES.md` and `333 NOTES.md`; the assistant working summary fell from 14 to 11 steps and no longer repeats Bash.
- Focused verification: 29 ComputerTimeline/assistant-projection tests passed and lint is green. Full repository gate and the live Claude acceptance rerun remain required before this slice is considered release-ready.

## 2026-07-16 — browser truthfulness pass for internal skill evidence

- Browser QA caught a gap that API-only acceptance could not: selected `.claude/skills/*/SKILL.md` runtime guides appeared in a normal chat's workspace count as if they were portable user artifacts, and provider `thinking tokens` telemetry appeared as repeated user-facing trace steps.
- Added an explicit internal-workspace path boundary for `.claude/`, `.claude-state/`, `.onevibe-*`, and `node_modules/`. Task snapshots, the Files API, Library, and direct file access now keep those runtime internals out of the user-visible file surface while the provider can still use them.
- Filtered provider thinking-token telemetry from the operational rail and assistant-ui trace. The UI continues to show bounded operational/tool evidence and explicitly states that hidden chain-of-thought is not exposed.
- History now labels deterministic conversations as `Simulation · no model call`, so older demo records cannot be mistaken for provider-backed conversations.
- Browser verification after reload: real Claude chat showed a direct answer, 0 portable artifacts, no thinking-token cards, and no console errors. Full `npm run check` passed with 37 test files / 207 tests.
- Post-fix live rerun: chat `task_4ec98deee76e41`, demo `task_a01f60f606c349`, and artifact/Bash `task_9ea262fa183949` passed with 23 live SSE frames, 46 replay frames, two chat turns, one bounded Bash call, valid evidence, and restart recovery.

## 2026-07-16 — repeatable truthful Claude acceptance gate

- Added `scripts/claude-chat-e2e.ts` and `npm run e2e:chat` as a release-oriented local acceptance harness. It starts an isolated API/data root, uses the protected LiteLLM route without printing credentials, and exercises real Claude Agent SDK chat rather than frontend fixtures.
- Passing run: chat `task_51d0f590186c49`, demo `task_18883e55f8f544`, and artifact/Bash `task_61e96e4a3c514c`. The run observed 8 live SSE frames, 36 replay frames, two persisted chat turns, two bounded Bash calls, valid evidence, and successful recovery after an API restart.
- The artifact task generated a Markdown file and exposed the Bash command/result through the terminal evidence projection. `pwd` is now included in the bounded local command policy because it is required for workspace orientation and remains non-networked.
- Verification: the focused Claude runner suite passed (5 tests), the harness typechecked, and `npm run e2e:chat` passed. Boundary: `executionBoundary=host_process`; this is not evidence of ONEComputer, microVM, OpenVTC, or production egress enforcement.

## 2026-07-16 — website shell contract and browser review

- Strengthened generated Website/App/Game artifacts with a portable `app/index.html` shell: language metadata, viewport metadata, description/title, root mount, and Vite entry wiring.
- Extended server validation to require the HTML shell and verify that `app/src/main.tsx` imports the generated `App` and stylesheet. This catches an incomplete scaffold before it is presented as a finished artifact.
- Browser-reviewed a real persisted Website task (`task_82dc25cf69d24c`) through an isolated local API/Vite pair. The task completed with 5/5 plan steps, 29 static checks, 16 files, a generated preview, the artifact rail, the activity/plan surface, and the separate VTI Wallet approval boundary.
- At 390×844, the browser review found no horizontal overflow (`scrollWidth=375`), the sidebar was hidden/collapsed, and the composer/task content remained usable. This is shell/UI evidence only; it does not claim that dependencies were installed, the generated app was built, or browser-tested inside the generated artifact itself.
- The remaining website parity gate is to install/build a generated project in a bounded runtime, capture browser/a11y evidence from that built output, and automate the new-task → stream → artifact → follow-up → reload flow.

## 2026-07-16 — delegated follow-up audits

- The backend audit found no new local P0, but identified three P1 hardening tracks: atomic task-file writes and cross-store crash windows, generation/CAS fencing for late adapter writes after cancellation, and multi-worker SSE delivery/cursor-gap semantics. Existing tests prove the current single-process contracts; they do not prove those distributed/crash boundaries.
- The Manus-parity audit identified the next UI priorities: typed inline previews and turn-level bundles in the Computer rail, causal screenshot-or-explicit-miss records for browser actions, deep links from task checkpoints into the selected evidence card, and variable-height virtualized replay tests. These are now the next UI execution queue rather than claims of feature parity.
- A worker was assigned the bounded generated-Website build proof. It may add only a dedicated E2E script and minimal package wiring; it may not change shared runtime contracts, Linear, or security boundaries. The main agent will review its diff and rerun the full gate.
- A separate platform observation remains deferred: the ONEComputer adapter can still over-report completion when provider-side artifact validation fails. This is a real production-provider risk, but it is not allowed to expand the local-first ONEVibe POC scope before the local creation and conversation gates are stronger.

## 2026-07-16 — bounded generated Website build proof

- Accepted the worker's isolated `scripts/website-build-e2e.ts` slice and added `npm run e2e:website-build` plus harness typecheck wiring. It creates a temporary demo Website task, extracts only the portable app files, verifies the static report/HTML/React entry/build-script contracts, and optionally performs a bounded temporary `npm install` when explicitly requested with `--install`.
- The proof fails closed when required generated packages are missing: the current run passed all static checks but returned build `unavailable` for `@tailwindcss/vite` and `tailwindcss` without attempting external installation. This is useful negative evidence, not a generated-project build pass.
- No browser automation, external provider, Linear call, secret, or deployment claim is part of this script. The Website gate remains open until an explicitly authorized dependency-install/build run produces `dist/index.html`, followed by browser/a11y evidence from the generated output.

- The authorized `npm run e2e:website-build -- --install` run initially exposed two real portability defects: the harness extracted an incomplete app file set, and the generated TypeScript project lacked Vite's CSS type declaration. The harness now extracts every portable `app/` file from the task snapshot, and Website/App/Game scaffolds include `app/src/vite-env.d.ts` with the validator/test contract updated accordingly.
- The corrected run passed all static checks and compiled the generated project in a temporary directory, producing `dist/index.html` and Vite assets. This closes the generated source/build gate locally; generated-project browser/a11y evidence and deployment remain open.

## 2026-07-16 — product-lead queue and delegation cadence

- Reframed the next phase as five bounded workstreams: a local API golden flow, document round-trip, quoted-CSV/data lineage, website build/review, and browser golden-flow coverage.
- The P0 next slice is the local golden flow: create task → real Claude/LiteLLM streaming → durable artifact → follow-up → restart/reload → server-side search/open. It will be assigned to a worker with ownership limited to its script/package entry point and focused documentation/tests.
- Earlier delegated reliability findings are now implemented and covered by the local check; their original NO-GO wording is retained only as historical regression context. The current default local slide gate and rendered browser QA are green.
- Worker protocol remains strict: one disjoint write scope, explicit acceptance evidence, no shared-contract changes without main-agent review, no secrets, and no Linear Done transitions by sub-agents.
- The agent pool is currently saturated by earlier threads, so redundant delegation was refused; completed worker reports were recovered and incorporated into the roadmap. The next worker will be spawned only when capacity is available.

## 2026-07-16 — local golden flow implemented and passed

- Added `scripts/onevibe-golden-e2e.ts` and `npm run e2e:golden`. The harness starts a temporary isolated API/data root, passes only the server-side LiteLLM route configuration, and never prints credentials.
- Passing run: primary task `task_b6b320da756747`, separate task `task_e81422d4ca1541`. The primary completed two Claude SDK/LiteLLM turns, emitted 5 live SSE frames and 75 suffix-only replay frames, retained a session identity, preserved `README.md`, verified the evidence chain, survived API restart, and was found through task/global/conversation search. The separate task received a distinct task identity and workspace contract.
- The first attempt exposed a real environment mismatch: the handover file's raw model alias was rejected by the local router (`claude-sonnet-4-5`). The passing run explicitly used the documented compatible `claude-sonnet-5` alias. This is recorded as provider configuration evidence, not hidden in the harness.
- Boundary: this is host-process local proof through the protected LiteLLM route. It makes no ONEComputer, microVM, OpenVTC, wallet, or production egress claim.
- Verification: focused lint/typecheck passed; the full `npm run check` is the final integration gate for this commit.

## 2026-07-16 — source-derived document review/export

- Document mode now derives the responsive HTML preview and parseable `document.pdf` from the governed `document.md` source, with deterministic PDF metadata and a common artifact manifest entry.
- Successful native Claude document turns run the same source-derived projection before static validation. Editing `document.md` through the server-owned file route regenerates the preview, PDF, and manifest; version restore rehydrates the derived review outputs as well.
- Document validation now requires a parseable non-empty PDF. Focused mode-artifact/Claude tests passed (17 tests); full `npm run check` remains green with 35 test files / 198 tests.
- Remaining limitation: this proves the local source/projection contract; native document live-provider evidence and richer layout/Markdown semantics remain open.
- Added `npm run e2e:document-roundtrip` for the HTTP-level proof. Task `task_9c72a7cd51ee4f` passed source edit, derived preview/PDF change, immutable pre-edit restore, exact source/preview/PDF restoration, PDF content type, and evidence-chain verification.

## 2026-07-16 — bounded CSV parsing and lineage

- Replaced the workspace data table's naïve comma split with the shared bounded parser in `src/lib/csv.ts`. Quoted commas, embedded newlines, escaped quotes, CRLF input, row/column limits, malformed quoting, and inconsistent columns are covered by tests.
- Server artifact validation now uses the same parser and rejects malformed data clearly. Deterministic data artifacts record bounded schema, row count, and source lineage in `analysis.json`; the UI surfaces parse failures as “Dataset needs review”.
- Full local check passes with 36 test files / 201 tests. This is local artifact/data-contract evidence; connectors, live sources, chart editing, and provider-derived data lineage remain open.

## 2026-07-16 — local-first Manus parity pivot and activity rail

- Re-scoped the active release gate to ONE-230: local ONEVibe reliability and Manus parity. Azure, ONEComputer, OpenVTC/VTI, and attested microVM work remain tracked but are explicitly deferred until the local gate is green.
- Added a default Activity workspace view that projects plan progress and the latest bounded durable runtime events beside the assistant conversation. It is a review surface, not a sandbox control plane; hidden reasoning and credentials remain excluded.
- Completed a clean local Claude Agent SDK + LiteLLM two-turn proof against a temporary data directory: the provider session was recorded, the follow-up conversation persisted, and the evidence chain verified.
- Added `docs/ONEVIBE-LOCAL-PARITY-ROADMAP.md` and updated `AGENTS.md` with the product-lead/delegation model, disjoint write scopes, release gates, and local POC metrics.
- Verification: `npm run check` passed with 33 test files / 174 tests, lint, production build, and E2E harness typecheck.
- Four read-only sub-agent audits identified the next release blockers: local fail-closed runtime/retry behavior (`ONE-231`), and rendered creation/artifact parity (`ONE-232`). Their findings are recorded in `docs/ONEVIBE-LOCAL-PARITY-ROADMAP.md`; no sub-agent changed shared contracts or production files.

## 2026-07-16 — fail-closed provider completion and SSE handoff

- Claude Agent SDK completion now requires an explicit valid terminal result. Missing result/early EOF records `run_failed` with `failureReason=missing_terminal_result`; it cannot silently become `completed`.
- SSE task events now subscribe before reading replay, buffer events during the replay/drain phase, deduplicate by durable event ID, and then enter live delivery. The HTTP route is wired to this handoff and validates task-bound cursors before headers.
- Implementation was delegated into disjoint worker scopes and integrated by the main agent in `27b7123`. Focused worker tests and the full check passed; local Claude/LiteLLM two-turn E2E remained green.

## 2026-07-16 — truthful Claude chat, bounded Bash, and Manus-style evidence view

- Added an explicit `chat` task mode. Real Claude Agent SDK conversations now stream through LiteLLM into durable assistant history and complete from the provider terminal result without artifact validation, generated files, or publication approval.
- Changed API/UI defaults so configured Claude is preferred and the deterministic runtime is visibly labelled as a simulation with no model call. Artifact modes remain explicit.
- Relaxed the generic artifact contract for `general` mode so Markdown, JSON, CSV, and code outputs can pass without an invented browser preview; preview-backed modes retain their stricter contracts.
- Added a Claude SDK `PreToolUse` policy hook in addition to the callback guard. This matters because SDK settings can auto-allow built-in tools without invoking the interactive permission callback. Bash is limited to a single workspace-relative local command and denies shell composition, network commands, credentials, and path escapes.
- Added host-path redaction to native envelopes, tool results, traces, and the Computer rail. The live UI now labels this route accurately as `Claude host policy · no gateway`.
- Added a compact, turn-scoped operational trace to the assistant-ui projection, filtering low-signal provider stream events while retaining plan, tool, artifact, and terminal lifecycle evidence. Removed the duplicate raw runtime checkpoint list from the default conversation surface.
- The Computer inspector now auto-opens for tool-backed tasks and prefers a terminal evidence card when no visual preview exists. Live browser verification completed a Claude/LiteLLM greeting and a Markdown-plus-Bash task; the latter produced `NOTES.md`, a passing validation report, a durable Bash command/result, and a clean completed status.
- Verification: `npm run lint`, `npm test` (37 files / 206 tests), and `npm run build` pass.

## 2026-07-16 — restart reconciliation, idempotent retry, and local slide proof

- `5c4e6ba` reconciles stale durable active turns after API restart. It emits one retryable process-restart failure, finalizes the assistant message, clears the active run, and remains idempotent across repeated initialization.
- Added an idempotent `POST /api/tasks/:id/retry` contract backed by the SQLite idempotency table. The UI Retry action now uses a generated retry key, and the new attempt is recorded in the same conversation evidence chain.
- Clean local Claude/LiteLLM evidence: a two-turn conversation completed with session identity and valid evidence; a Slides task completed with `deck.pptx`, `deck.pdf`, `outline.json`, `speaker-notes.md`, and `validation-report.json`. This is host-process local proof, not production sandbox/microVM proof.
- Verification: `npm run check` passed with 33 test files / 182 tests; the local conversation and Slides E2E scripts completed successfully.

## 2026-07-16 — SQLite runtime event ledger

- Moved the authoritative append-only runtime event ledger from a rewritten per-task `events.json` file into a versioned SQLite `runtime_events` table (migration v4). Appends now allocate the per-conversation sequence and previous hash inside the existing immediate Unit-of-Work transaction, so concurrent tool/lifecycle producers cannot silently reuse a sequence or fork the evidence chain.
- Added a bounded repository cursor, uniqueness fences for `(conversation, sequence)` and `(conversation, event_hash)`, JSON payload validation, and a restart-safe one-time importer for existing `events.json` records. The JSON file remains a legacy migration source only; new events are not written there.
- Browser projections and task-bound SSE keep the same contract, but now read from SQLite-backed events after process restart. Verification: `npm run check` passed with 32 test files / 163 tests; a live local API proof created a demo task, streamed suffix-only frames after `Last-Event-ID`, restarted the API against the same data root, and returned the same valid 23-event evidence chain.

## 2026-07-15 — repository and vertical-slice architecture

- Preserved the Manus product research in the separate `onevibe-manus-research` repository at commit `f9b0ab7`.
- Chose a standalone Vite/React application rather than modifying ONEComputer directly.
- Adopted the provider-neutral RuntimeEvent/SSE contract from the AgentCore harness.
- Defined explicit adapters for runtime, workspace, policy, approval, and evidence.
- Kept approval authority outside the browser and labelled local demo behavior as non-enforcing.
- Installed Framer Motion and the local UI design stack for a high-fidelity product shell.
- Implemented and browser-verified the complete local task journey, including source/preview, external-wallet request, safe completion, and evidence verification.
- Removed external font loading so the default application shell has no surprise third-party asset egress.
- Captured dated home and completed-task screenshots under `docs/evidence/`.
- Added the authenticated ONEComputer sandbox client against the verified `/v1/sandboxes` and governed-action routes; deliberately omitted portal approval decisions.
- Added server-only runtime bearer authentication and portable ZIP export with an evidence manifest.
- Added a native Claude Agent SDK execution path with host-workspace confinement, explicit tool allowlisting, out-of-workspace denial, separate runtime state, sanitized native event retention, and resumable session identity.
- Added an offline SDK contract test proving tool denials, secret redaction, artifact discovery, terminal-event ordering, and evidence-chain validity without making a model request.
- Added user cancellation across local demo, native Claude SDK, and remote SSE execution. Cancellation is server-owned, preserves partial files, and records a terminal `run_cancelled` evidence event.
- Added multi-turn task continuation. Follow-up messages remain in the same evidence chain and workspace; native Claude turns resume the retained SDK session instead of starting a disconnected conversation.
- Added durable `/tasks/:id` navigation, grouped and expandable transcript turns, and a keyboard-dismissible fullscreen workspace.
- Added immutable per-turn workspace snapshots with evidence-head references, a History surface, and safe restore that records an `artifact_updated` event.
- Added seven persisted creation modes with mode-specific plans. Slides now produce an eight-slide outline, speaker notes, isolated interactive viewer, valid PPTX, and a deterministic eight-page PDF export; Website/App/Game produce React-TypeScript-Vite scaffolds; Research and Design retain evidence/rationale artifacts.
- Made workspace export binary-safe and added direct binary artifact downloads without attempting to render PPTX bytes as source text.
- Added independent task copies with copied source, a fresh evidence chain, and a provenance pointer to the source task's terminal evidence hash.
- Added embedded source editing with Original/Modified/Diff views. Saves require the originally-read SHA-256, reject stale writes, snapshot the workspace first, and record before/after hashes in evidence.
- Added a server-held user-input broker and native Claude MCP input tool. Tasks enter `waiting_for_user_input`, render options/free text, resume the same execution with the answer, record both transitions, and reject the parked promise on cancellation.
- Added governed sharing through a separately authenticated wallet API/CLI. The browser can request but cannot decide; approval creates an HMAC-signed receipt, 192-bit capability link, read-only shared shell, and evidence event.
- Added a true ONEComputer execution adapter: authenticated sandbox create/poll/exec/delete, base64 prompt transfer, Claude without Bash, bounded artifact extraction, cancellation propagation, lifecycle evidence, and ephemeral destruction by default. Gateway enforcement remains false unless explicitly attested by deployment configuration.
- Separated durable chat history from low-level audit events. Conversation turns now retain role, turn ID, provider, streaming/completed state, timestamps, pagination, full-text cross-task search, reload migration, and inclusion in evidence exports.
- Added the Computer panel: a side-by-side, chronological execution record that maps typed runtime events to terminal output, generated-file previews, and captured visual frames. It supports live-follow and deterministic back/forward scrubbing without granting the browser control of the runtime.
- Added the ONEComputer visual-runtime bridge: the server can request a headless X11 session, persist its PNG frame in task evidence, and proxy current screenshots to the workspace UI. The browser never gains X11, VNC, CDP, or service-token access.
- Added a persisted semantic system/light/dark theme with pre-paint preference selection, accessible focus states, and reduced-motion handling.
- Documented the product roadmap and visual microVM architecture. The remaining deployment gate is an end-to-end attestation of the actual sandbox provider, gateway egress enforcement, and visual-capture API—not merely the local demo UI.
- Added explicit per-mode artifact-contract validation. Each deterministic task saves `validation-report.json` covering required files and format/semantic checks; it intentionally distinguishes static checks from dependency installation, executed builds, browser automation, and production security verification.
- Added durable projects. A project owns a name and governed background brief; new tasks bind to that project and the API attaches the context server-side to the agent run while retaining the user prompt as a separate transcript event.
- Extended projects into bounded knowledge packs. A project can retain up to twelve small, path-confined files; text-like files are read server-side into an explicitly untrusted project-context section, while the timeline records metadata-only attachment evidence. This deliberately does not mount folders, credentials, browser sessions, or arbitrary connected drives.
- Added first-class Document and Data-story creation modes. Documents produce portable Markdown plus structured metadata; data stories produce CSV, analysis metadata, and an inspectable visual preview. Both participate in the same evidence and validation path as existing modes.
- Added durable plan-step timing. Running/completed/blocked transitions persist timestamps, emit ordered evidence, and render elapsed duration; terminal task events remain last in the event chain.
- Moved Computer panel classification into the durable server event contract. Tool and artifact events now carry a typed terminal/screenshot/preview/file/diff descriptor in their hashed payload, with a UI-only compatibility fallback for older evidence.
- Expanded the Computer artifact rail with server-derived slide and wallet-approval panels, keyboard event stepping (Arrow/Home/End), explicit live follow, and a paused/new-activity state. Historical inspection remains stable while new work arrives; resume returns to the newest immutable event.
- Changed the ONEComputer adapter from a single startup screenshot to immutable visual evidence checkpoints at runtime ready, immediately before Claude execution, and immediately after it. Agent-operation frames carry the causal tool-call event ID; capture failure records evidence without making artifact extraction or sandbox teardown unsafe. This is checkpoint capture, not yet continuous replay.
- Preserved the authenticated ONEComputer provider capture timestamp from the response header in each stored visual-frame event, and forwards it through the live screenshot proxy. Receipt time and provider capture time are therefore distinguishable during later replay/audit work.
- Switched the sandboxed Claude invocation to its supported `stream-json`/verbose journal. ONEVibe projects the journal into ordered, bounded, redacted tool-use, tool-result, and transcript events, retains the session ID as runtime evidence, and leaves the raw JSONL only in the disposable sandbox. This adds inner agent-loop observability but is collected after the process exits; true live journal streaming remains future work.
- Evolved the sandbox journal path into a live polling loop: Claude runs as a managed background process, ONEVibe projects newly observed JSONL entries during execution, and each tool-start/tool-result event requests an X11 evidence checkpoint. The loop has a 20-minute task deadline and a 4 MiB journal ceiling; background failure always writes a terminal exit code. This is tested with the provider contract, but still needs a deployed Azure run to prove provider-level concurrent `exec` behavior.
- Added a bounded live visual-checkpoint loop to the ONEComputer adapter. Once the authenticated X11 runtime is ready, it persists an immutable PNG frame every five seconds (minimum one second), then stops and joins before final capture or sandbox destruction. This is evidence-backed timeline replay, not a browser-control channel or unbounded video recording.
- Replaced the decorative Skills navigation with a usable capability library. Users can select up to four explicit working guides for new tasks; those IDs persist on the task, become server-side operating guidance, and create a `Skill packs attached` evidence event that explicitly states no permission change occurred.
- Replaced the decorative Library navigation with a server-derived artifact index. It lists completed task outputs across projects while excluding raw `inputs/` and `evidence/` paths, and every card returns to the originating governed task rather than detaching artifacts from their evidence chain.
- Added transparent queued steering for non-interruptible providers. Guidance submitted during an active turn is bounded, persisted, and recorded immediately; after a successful terminal state, ONEVibe resumes the same task with the next queued instruction. This is deliberately not represented as live prompt injection into a running Claude SDK or sandbox CLI process.
- Made the first-class Skills, Library, and Scheduled surfaces URL-addressable (`?view=…`). Refresh and browser history now restore the intended surface and active navigation state instead of silently returning users to the home composer.
- Added durable run identity to the event chain. `beginTurn` persists a run ID before the first event; every subsequent event—including Computer frames—binds it into the hash, and terminal events clear the active run. The Computer header exposes a concise run marker for replay across follow-ups and retries.
- Replaced the hidden click-to-cycle composer mode control with an animated, keyboard-accessible nine-mode creation catalogue for Agent, Website, Slides, Document, Research, Data story, Design, App, and Game. Each option explains its output contract; the selected mode persists into normal task creation.
- Added an expandable pre-delegation safety cue to the primary composer. It makes the secret-handling, untrusted-context, workspace-policy, and independent VTI Wallet boundaries legible at the point users supply a task.
- Added a compact, animated task-template gallery to the primary composer. Website, executive briefing, research, and internal-tool starters prefill an editable brief and select the matching persisted creation mode; this is a guided starting point, not an opaque one-click action.
- Added governed task scheduling. Schedules are durable, claim due work atomically, advance their next run before dispatch, and create normal project-bound tasks with an explicit `Scheduled run claimed` evidence event. They cannot publish or approve anything independently.
- Aligned the ONEVibe sandbox client with ONEComputer's authenticated API-key contract. It now supports server-only `oc_*` project keys and the required `X-Project-Id` header for organization-scoped keys, including headless visual-runtime capture requests.
- Performed a live Azure API attempt through the ONEVibe runtime. API health and sandbox route reachability were verified, and the provider began a real Kasm bootstrap; the request was cancelled before it returned a persisted sandbox ID. The test container was removed and no sandbox record remained. The required provider lifecycle remediation and success criteria are recorded in `ONECOMPUTER-LIVE-E2E.md`.
- Added bounded website-reference context. Users can attach HTTP(S) references through the composer; these are stored with the task, attached to agent context as untrusted material, and represented in evidence only by redacted origin/path metadata. ONEVibe does not fetch them automatically.
- Added bounded local-file task attachments. The browser reads selected files into the task request, the API validates/sanitizes and path-confines them under `inputs/`, and execution emits metadata-only evidence before presenting those files to the agent as untrusted input.
- Upgraded Website mode from a generic state demo to a responsive, portable enterprise landing-page starter with operating-boundary messaging, capability cards, and semantic FAQ disclosure. The next quality gate is agent-directed visual generation plus isolated browser/screenshot review.
- Elevated the Manus-style side artifact trail as a P0 interaction contract: every agent action should project a chronological terminal, browser/screenshot, file, diff, or artifact panel into the evidence-bound Computer rail. This remains observation-only: the browser must not receive X11, VNC, CDP, shell, or sandbox credentials.
- Made terminal panels inspectable rather than raw event dumps. A tool panel now pairs its bounded, redacted request with the corresponding result/error by tool-call ID, while screenshot panels remain separate immutable evidence events in the same run. This preserves a readable Manus-style activity trail without turning the web UI into a sandbox-control surface.
- Connected tool panels to their exact X11 evidence checkpoints. When a provider records a `causedByEventId`, the operator can jump from the terminal action to its immutable frame; unrelated or periodic frames are not implied to prove that action.
- Aligned local demo tool activity with the same inspectable correlation contract: source generation and artifact validation now have paired start/result IDs and bounded input/result metadata. They remain visibly marked `local_demo`; this improves workflow replay and does not represent VM isolation, a real shell, or a provider screenshot.
- Upgraded the generated-project static quality gate to version 2. React/Vite scaffolds now verify their runnable contract and semantic main landmark; Website scaffolds additionally prove navigation/footer landmarks, native FAQ disclosure, responsive/reduced-motion rules, and visible keyboard focus treatment. The report still explicitly does not execute generated code or replace attested sandbox build/browser/a11y review.
- Made immutable Computer-rail evidence URL-addressable. Selecting a recorded terminal, frame, preview, artifact, deck, diff, or approval event stores its event ID in the task URL and restores it on refresh; the header exposes sequence and a short evidence-hash marker. The live X11 display is deliberately excluded because it is a current view, not a historical evidence artifact.
- Reworked the deck workspace into a review surface rather than an outline list: compact visual slide cards, position-aware previous/next controls, a focused deck canvas, and per-slide notes that open directly in the evidence-bound source editor. These are visual outline thumbnails, not an assertion that the PPTX itself has been rendered to images.
- Corrected compact tool-card causality in the Computer rail: a visual checkpoint tied to a folded tool-result event now appears with its originating tool card, while retaining the separate immutable screenshot card in chronological order. This closes a mixed-stream review gap without collapsing or rewriting the underlying evidence.
- Added bounded text snippets to generated source/deliverable cards in the Computer rail. The API refuses inputs and evidence paths, recognizes text artifacts only, caps eligible files at 64 KiB and returned excerpts at 12,000 characters; the client applies the rail redactor again before display. This makes the rail more useful for file review without converting it into a workspace mount.
- Kept the artifact-rail keyboard model review-safe: Arrow/Home/End navigation works on the rail, but does not intercept caret or selection behavior in the evidence search field, run selectors, textareas, or content-editable controls.
- Made local Slide-mode deliveries visible as individual immutable artifact cards after the write operation. PPTX and the direct PDF export are both classified as the same slide-deck evidence type, so the reviewer sees portable outputs in the same mixed rail rather than a generic aggregate receipt.
- Replaced the static Skill-guide prompt append with versioned local skill packs. A selected skill now has a pinned v1/SHA-256 manifest in the turn evidence, is materialized only into that task’s `.claude/skills/<name>/SKILL.md`, and is passed through the Claude SDK’s native skill filter. The ONEComputer sandbox receives the identical selected pack content during its scoped task bootstrap. This does not yet provide third-party/imported pack scanning, signatures, revocation, or organization policy packs.
- Reframed the controlled live tests around the product E2E spine: the Claude SDK harness now proves a persisted two-turn conversation and workspace continuation, and the ONEComputer harness now defaults to a sandboxed Slides task that must return actual PPTX and PDF bytes. Both default to the API endpoint on `127.0.0.1:4311`, so unavailable providers fail with an explicit readiness result instead of a Vite-port connection error.
- Replaced opaque click-to-cycle runtime selection with a server-derived readiness picker. It identifies the task boundary and availability for Safe demo, native Claude Agent SDK, ONEComputer sandbox, and remote runtime without exposing server credentials; unavailable remote/sandbox choices cannot be submitted, while the API remains the authority for enforcement.
- Added a read-only task Settings workspace tab. It gathers the runtime/boundary, gateway-attestation, approval, artifact-contract, and attached-context record in one reviewable place while deliberately excluding credentials, VTI Wallet keys, provider controls, and X11/VNC/CDP channels.
- Modernized generated Website/App/Game projects with Tailwind 4’s Vite integration and a minimal typed component foundation (`Button` plus `cn`). Static validation now verifies the foundation is present; installing or running third-party dependencies remains reserved for a controlled sandbox build gate.
- Extended App mode with a portable full-stack seed: a separately checked Node/TypeScript local server, a typed health contract shared with the client tree, and explicit server scripts. It deliberately creates no auth, connector, credential, or deployment behavior; those belong to the governed runtime/integration layers.
- Added an isolated runtime test for the deterministic generated App scaffold: it starts the generated server and verifies its typed `/health` response. This validates the known fixture only; it does not execute arbitrary agent-created source or install third-party project dependencies on the host.
- Added a GitHub-ready handoff guide to every portable source/evidence ZIP. It records task mode/provider, final evidence hash, chain verdict, safe review steps, and explicit GitHub CLI guidance while making clear that the app neither authenticates to GitHub nor authorizes external publication.
- Added client-side retrieval to the evidence-derived artifact Library: search matches task title, project, creation mode, and safe exported artifact paths, with mode filters and a zero-result state. The source remains completed task outputs only; raw inputs and evidence frames stay excluded.
- Added a Data workspace tab for Data mode. It renders the portable generated CSV as a read-only table with row/column context and an explicit path back to source; it deliberately does not claim a live database or connector.
- Added a server-only LiteLLM transport for the native Claude Agent SDK. ONEVibe maps the configured gateway into the SDK child process, exposes only a safe readiness label, and never copies the gateway endpoint or credential into browser state or task evidence. Direct first-party Anthropic configuration is rejected; the relay is the only accepted model route.
- Added the sandbox-resident Claude Agent SDK worker contract. ONEVibe now transfers a pinned worker that calls `query()` inside the conversation-owned sandbox, journals native SDK messages, and fails closed if the provider image cannot resolve `@anthropic-ai/claude-agent-sdk`; the former CLI launch is no longer treated as the primary ONEComputer SDK proof.
- Passed the strict Azure development-provider proof after the SDK bootstrap was promoted: two conversations completed through the sandbox-resident SDK and LiteLLM, live SSE and suffix replay were verified, continuation reused the same sandbox/session, the second conversation received a distinct sandbox, visual evidence and sandbox-origin slide artifacts were produced, and both leases were released. Production gateway attestation and short-lived credential injection remain separate gates.
- Proved a live local two-turn Claude conversation through LiteLLM. The same persisted SDK session resumed for the follow-up, modified the same governed workspace, retained assistant/user messages independently from audit events, and finished with a valid evidence chain.
- Found and fixed an SDK permission-shadowing defect during that proof. Bare `allowedTools` entries had auto-approved file tools before `canUseTool`; ONEVibe now uses `tools` only for availability and routes every invocation through the path-confinement callback. The escaped validation file was removed and the repeated E2E remained inside the task workspace.
- Added an agent-callable, schema-constrained slide renderer. For Slide mode, Claude must supply exactly eight bounded title/summary pairs to a local MCP tool; the server renders genuine PPTX and PDF exports, HTML review view, outline, and speaker notes without granting Bash. A live LiteLLM-routed run produced both binary formats and passed evidence verification.
- Created the dedicated Linear project **ONEVibe — Backend E2E & Manus Parity** and made `ONE-215` the sole active product epic. Its child backlog encodes the backend-first dependency chain from transactional conversations through one-microVM-per-conversation orchestration, in-microVM Claude/LiteLLM, durable streaming, sandbox PPTX/PDF, real-provider failure-injected E2E, and isolation hardening. UX and OpenVTC approval integration are explicitly downstream.
- Completed a second engineering pass over `ONE-215` through `ONE-224`: every ticket now names current code seams, target contracts, dependencies, failure modes, observability, test layers, estimates, and evidence-based DoD. Added six project-linked Linear documents covering management architecture, backend/data contracts, the one-conversation/one-microVM ADR, release gates, risks/open decisions, and the specialist-agent delegation model.
- Consolidated three independent read-only specialist audits for persistence (`ONE-216`), runtime leases (`ONE-217`), and durable event projection (`ONE-219`) into **Backend Contract Freeze v1**. Accepted `better-sqlite3` behind a PostgreSQL-compatible repository/Unit-of-Work boundary because the current Node 22 core SQLite API remains experimental; froze generation-fenced conversation leases, durable provider operations, versioned native-event projection, message projection, quarantine, and `Last-Event-ID` SSE semantics before parallel implementation.
- Audited the actual ONEComputer provider API before lease implementation and exposed two platform blockers rather than overclaiming the boundary. `ONE-225` now owns idempotent allocation keys, persisted/recoverable provider operations, and deletion receipts. `ONE-226` owns a genuinely attested microVM provider and removal of the Kasm path's host Docker-socket/added-capability boundary from production acceptance; Kasm/Daytona remain explicitly development providers until equivalent isolation is proven.
- Added the next `ONE-225` consumer slice after the Azure create-timeout audit: ONEVibe sends `Idempotency-Key` and `X-Allocation-Operation-Id`, exposes authenticated provider listing, and can recover an `unknown` lease only when the provider returns the exact immutable allocation identity. Name-only matching is rejected, recovery is generation-fenced, and no automatic duplicate create is attempted. Focused tests cover headers, recovery, duplicate refusal, and unlabeled-provider fail-closed behavior.
- Implemented the corresponding provider contract in the local `onecomputer-lifecycle-pr` branch: PostgreSQL-backed allocation receipts are persisted before provider dispatch, completed requests replay the same sandbox, unknown outcomes remain queryable, and `GET /v1/sandbox-operations/:operationId` exposes bounded lifecycle metadata. ONEVibe now follows pending receipts. This is source-level evidence only until the branch is deployed to Azure and the real-provider recovery scenario passes.
- Promoted the allocation-receipt provider contract to the Azure deployment branch in commit `4ff7533`; the allocation-operations migration applied and the web, gateway, and LiteLLM bridge services remained active with public health HTTP 200. A subsequent authenticated ONEVibe harness attempt stopped at `POST /v1/sandboxes` HTTP 401 because the local API used a placeholder service token; no sandbox was created. The receipt contract is now deployed, but ONE-221 remains open pending valid project credentials and a fresh combined real-provider run.
- Added a fail-closed production isolation guard to the ONEComputer provider selector in commit `98d446e` on branch `codex/sandbox-attestation-guard`. Setting `ONECOMPUTER_REQUIRE_ATTESTED_ISOLATION=1` now rejects the current Kasm/Daytona development adapters instead of allowing an unverified production boundary. Focused isolation-policy tests, API typecheck, and API lint pass. This is a safety gate, not attestation: a real microVM provider, signed verification, and live isolation evidence remain required under ONE-226.
- Scoped those platform changes out of the immediate POC without weakening its evidence: the current provider must still prove unique sandbox identity per conversation, same-sandbox follow-up reuse, in-sandbox Claude/LiteLLM, durable history, real sandbox-origin PPTX/PDF, and explicit cleanup. Added the POC exit-criteria document in Linear; production microVM and ambiguous-create recovery claims stay deferred.
- Integrated the first bounded `ONE-216` implementation slice: pinned `better-sqlite3`, explicit WAL/foreign-key/busy-timeout/`synchronous=FULL` setup, checksum-verified versioned migrations, integrity/newer-schema rejection, a strict v1 conversation/turn/message/idempotency/import schema, repository/Unit-of-Work contracts, and focused rollback/constraint tests. This foundation is intentionally not yet wired into `TaskStore`; repository implementations and migration cutover remain Phase 2.
- Completed the relational chat-history cutover. SQLite is now authoritative for conversations, turns, and messages; a one-time checksum-recorded importer handles legacy JSON, and stale or forged `messages.json` state cannot override canonical history after restart. A real API stop/start probe returned the identical completed transcript from the database.
- Added generation-fenced runtime leases and changed ONEComputer ownership from one disposable sandbox per run to one retained development sandbox per durable conversation. Allocation ambiguity fails closed as `unknown`; follow-ups reuse the same provider identity; separate conversations cannot share an active lease; teardown is an explicit server-only action. The controlled E2E now requires same-conversation reuse, cross-conversation separation, sandbox-origin PPTX/PDF, evidence validity, and explicit cleanup.
- Attempted that upgraded harness against Azure with the sandbox-reachable LiteLLM relay. The provider returned HTTP 504 before yielding a sandbox identity; ONEVibe fenced the lease as `unknown`, did not retry, and the provider list showed no visible sandbox row. The attempt exposed an HTML provider-body projection bug, which was removed so external error bodies can no longer enter task evidence.
- Promoted and hardened the Azure async lifecycle path: persisted provisioning identity before bootstrap, consistent single-resource lifecycle reads, headless Claude Code as the required runtime, optional Desktop installation, explicit managed CLI paths, stdin prompt transport, and a relay-only development proxy bypass that keeps TLS verification enabled. The first real sandbox Claude turn then completed through the scoped public relay with durable transcript/tool events and a lease-bound session. The PPTX gate remains open because the image lacks deterministic slide/PDF rendering dependencies.
- Studied the AgentCore Claude/Codex harness's AWS chain and documented the accepted production design in `AGENTCORE-AWS-RUNTIME.md`: a sandbox-scoped AWS container credential-provider endpoint backed by short-lived STS sessions, never mounted profiles or copied static keys. Added `LIVE-E2E-ENGINEERING-LOG.md` so failed provider experiments and their fixes remain durable engineering evidence.
- Prepared deterministic sandbox deck generation by adding managed `pptxgenjs`/`pdf-lib` bootstrap verification, a fixed six-file Slide deliverable contract, and a true mode-specific Claude tool availability list. Bash is omitted from ordinary jobs and enabled only for Slide mode; live Azure deck and negative capability tests remain required before closing the gate.
- Closed two additional E2E design gaps found live: sandbox relay evidence now records LiteLLM from the actual server-injected route, and Slide artifacts use a server-controlled renderer executed inside the conversation sandbox after Claude edits a bounded structured outline. The managed renderer, rather than the model, owns PPTX/PDF construction and signature checks.
- Proved the corrected managed Slide path live on Azure: a real LiteLLM-routed task returned signature-valid PPTX/PDF plus the complete six-file deliverable contract and validation evidence, then released its retained sandbox. The combined E2E remains open on Azure's missing visual-runtime route and multi-conversation continuation/isolation checks.
- Passed the combined Azure development-provider POC: real LiteLLM Claude, sandbox-origin PPTX/PDF, same-conversation sandbox/session reuse, cross-conversation sandbox separation, 21 X11 evidence frames, valid evidence chain, and explicit cleanup of both leases. The X11 provider now reuses Kasm's existing display and captures its detected geometry instead of assuming Xvfb/1440×900.
- Serialized periodic and tool-adjacent X11 captures inside each task so ffmpeg never races itself, and drain the capture queue before terminal bookkeeping. Screenshot readiness now follows successful display initialization; browser/CDP readiness remains a separate automation capability.
- Removed a timing-dependent X11 geometry pipeline failure: the provider no longer exits its `awk` reader early under `pipefail`. A deployed fresh-sandbox probe returned two consecutive valid PNG captures and clean teardown.
- Added repeatable restart/residue and cancellation harnesses. A real API restart preserved transcript/evidence digests with a valid chain and zero credential detectors; a real allocated provider sandbox was cancelled, recorded, explicitly released, and verified destroyed.

# 2026-07-16 — assistant-ui external transcript slice

- Closed the bounded cancellation-quiescence slice for the ONEComputer development adapter. The runner now retains the in-sandbox Claude agent PID, records a cancellation request with retained journal/exit-marker paths, sends TERM and bounded KILL escalation, and verifies either `.onevibe-exitcode` or process absence. If the remote exec provider does not return a verifiable observation, the task records an explicit `unverified` limitation rather than claiming the sandbox stopped. Focused tests (10), server typecheck, lint, and diff hygiene pass in commit `2fe6a84`.
- Added `scripts/retry-http-e2e.ts` as a deterministic, secret-free HTTP proof for the durable retry contract. It seeds a failed demo task in a temporary SQLite root, starts an isolated API child, submits the same retry idempotency key twice, verifies `202` then an identical `200` replay, exactly one retry attempt, terminal completion, and a valid evidence chain. The run passed as task `task_f6e383d5e0224f`; it intentionally does not claim external-provider or production deployment coverage.
- Closed the clean local Claude/LiteLLM creation gate after one deliberate failure analysis. The original document E2E prompt asked for only `README.md`, which correctly failed the document artifact contract; the corrected prompt now creates `document.md`, `document.json`, `index.html`, and README. The validator also accepts normal Markdown heading capitalization through semantic heading matching, with regression coverage. Final runs passed: two-turn Claude task `task_33c790f67d7345` with recorded session and valid evidence, and eight-slide task `task_bffd48feac3244` with 106,857-byte PPTX, 7,463-byte PDF, and valid evidence. Both are local host-process/LiteLLM evidence, not microVM or provider-attestation proof.
- Delegated and integrated the first conversation-first composition slice. The task timeline now projects the persisted plan inline above compact runtime checkpoints, with accessible progress/status semantics for completed, running, pending, and blocked steps. The duplicate standalone TaskPlan mount was removed from App, while tool calls, screenshots, artifacts, and approval cards remain in their existing authoritative surfaces. The worker changed only `src/components/TaskTimeline.tsx` and `src/index.css`; main-agent integration also removed the obsolete App import/render. Lint and production build pass; browser desktop/mobile QA remains the next acceptance step.
- Completed browser QA against persisted task `task_57b6475d57a04d` using the local Vite/API stack. Desktop inspection showed the assistant conversation, portable artifact list, and live execution/activity rail in one workspace; the DOM contained exactly one `.timeline-plan` and no standalone `.task-plan`. At 390×844, the sidebar started collapsed, the composer remained reachable, horizontal overflow was false, and the inline plan remained present in the DOM. The viewport override was reset and temporary browser tabs were finalized. This verifies layout behavior, not provider or security enforcement.
- Added `artifact-manifest.json` generation to deterministic creation-mode outputs in commit `5f97e21`. Slides, documents, research, data, design, and generated website/app/game scaffolds now emit a versioned, secret-free manifest containing stable task metadata and per-output path, byte size, SHA-256, and artifact kind. Focused manifest tests prove actual-byte hashes, repeatability, content exclusion, and path filtering; full check passes with 33 test files / 187 tests. This is provenance metadata, not runtime/browser/PPTX semantic proof, and provider-runtime manifest projection remains a follow-up.
- Extended the manifest contract to native Claude in commit `7827427`. Successful Claude turns now hash the actual portable workspace outputs, emit one manifest artifact event, and exclude the manifest plus runtime validation/build reports from both portable output and repeat-turn projections. A regression test covers repeated native turns and stable manifest bytes; the full check passes with 33 test files / 188 tests. ONEComputer extraction still needs the equivalent projection.
- Re-ran the provider-backed regression after native manifest projection. Two-turn Claude/LiteLLM task `task_9defa3dbcc6149` completed with a recorded session and valid evidence. The first slide retry `task_d6490cf4538c4d` exceeded the 10-minute harness deadline while still streaming model events; it was explicitly cancelled and is not counted as a pass. A bounded retry with `ONEVIBE_CLAUDE_MAX_TURNS=12` and `ONEVIBE_CLAUDE_MAX_BUDGET_USD=2` completed as `task_34aa9dec721c45`: eight slides, 107,280-byte PPTX, 7,844-byte PDF, valid evidence, and a native Claude manifest with six hashed portable outputs. This identifies a provider/model completion-latency sensitivity, not a renderer failure; the default production timeout/budget policy remains open.
- Added a server-side turn deadline in commit `1e74685`. `ONEVIBE_TURN_TIMEOUT_MS` is parsed and clamped to 1 second–30 minutes, with a 15-minute default; expiry aborts the adapter and records fail-closed `run_failed` evidence with `failureReason=turn_timeout`. User cancellation remains `run_cancelled`. A five-second cleanup grace preserves the active-run fence until the adapter settles, preventing an overlapping retry when a provider ignores abort. Six deterministic deadline tests plus the full check pass (34 test files / 194 tests). This bounds the local coordinator; provider-specific process quiescence remains a separate adapter concern.
- Made Claude run budgets bounded in commit `63e19bb`. LiteLLM-routed runs use 12 turns and a $2 budget, matching the bounded slide proof; no direct Anthropic budget path exists. Both remain explicitly overridable and are clamped by typed parsing tests. Full check passes with 35 test files / 198 tests. This is a local reliability policy, not proof of model quality or provider availability.
- Passed the default local LiteLLM slide gate after the bounded policy change. Task `task_e1a9c636a57a45` completed without turn/budget overrides with eight slides, 107,021-byte PPTX, 7,625-byte PDF, valid evidence, and seven hashed manifest outputs. The previous default-policy timeout is therefore mitigated for the current `claude-granola-5-2` route; keep the deadline/retry evidence because provider latency remains model- and gateway-dependent.
- Added the ONEComputer provider projection in commit `3a13daf`. After sandbox extraction, the host writes a metadata-only `artifact-manifest.json` from the actual extracted bytes and records one manifest artifact event; runtime validation reports remain evidence-only. The slide PDF/PPTX renderer now normalizes creation/modification metadata to the durable task creation time, making repeated deterministic renders hash-stable. Focused ONEComputer/mode-artifact tests (23) and the full check (35 test files / 198 tests) pass. This proves provenance plumbing and deterministic fixture output, not production microVM attestation.
- Improved slide creation parity in commit `6db586e`. The portable HTML review now renders page-like 16:9 slides with speaker-note disclosures, previous/next controls, accessible slide index navigation, responsive thumbnails, and reduced external surface area. The native Claude system contract now requires the single structured renderer call immediately after the plan, preventing low-turn model loops from spending the budget drafting/grepping slide source before rendering. Full check remains green; a fresh provider-backed run after this prompt change is still required.
- Re-proved the default local LiteLLM slide gate after the direct-render contract change. Task `task_78b67b47a5f346` completed with eight slides, 35,082-byte PPTX, 7,744-byte PDF, valid evidence, and a six-output manifest. The generated HTML contains page surfaces, speaker-note disclosures, previous/next controls, and nine accessible slide-index buttons. This is current local host-process/LiteLLM evidence; the sandbox provider remains a separate attestation gate.
- Made the Vite API proxy honor `ONEVIBE_API_PORT`, allowing browser QA to target the same isolated temporary API/data directory as a live E2E run without reusing the shared 4311 process. Full check remains green (35 test files / 198 tests).
- Browser-verified the current slide artifact `task_78b67b47a5f346` through an isolated API/Vite pair. Desktop showed the page-like slide review with notes disclosure, controls, thumbnails, manifest/artifact rail, and plan; clicking the unique `#next` control advanced the deck from 01/08 to 02/08. At 390px, overflow was false and the sidebar was collapsed. The viewport was reset and temporary tabs/servers were cleaned up.

- Added migration v5 for durable native provider envelopes, one-to-many projection links, and per-run source offsets. `TaskStore.ingestNativeEvent` now atomically records a bounded/redacted native envelope and its typed runtime projections, treats a replayed source cursor as a no-op, and advances the projector offset only after all links commit. Claude SDK, ONEComputer sandbox journal, and remote SSE adapters use this ingestion path.
- The shared native-envelope sanitizer redacts credentials, omits hidden reasoning fields, bounds nested values, and replaces oversized payloads with a digest-only receipt. Runtime projections retain only safe provenance (`nativeEventId`, source, type, and source cursor), so the browser never needs raw native payloads.
- Verification added repository, migration, store, sanitizer, Claude SDK, and sandbox tests. The full check now passes with 33 test files / 169 tests, production build, lint, and E2E harness typecheck.

- Studied the upstream assistant-ui reference at `/Users/gini/Desktop/Project ONEComputer/reference/assistant-ui` (commit `595fcba`). The relevant production patterns were `useExternalStoreRuntime`, message-by-ID virtualization with `@tanstack/react-virtual`, turn grouping, sticky latest-activity behavior, and artifact views derived from assistant state. The implementation below adapts those patterns to the existing task/SSE/SQLite authority model rather than importing a mock store or a second runtime.
- Added a bounded, virtualized assistant-ui transcript. Long persisted conversations now render through `ThreadPrimitive.Unstable_MessageById`, grouped user/assistant turns, a sticky latest-activity affordance, and a jump-to-latest button. This keeps the conversation readable without allowing the transcript to compete with the authoritative Computer evidence rail.
- Browser QA on the persisted task `task_dda313c34b5a49` verified internal transcript overflow, scroll-away/jump-back behavior, light and dark theme rendering, the 390x844 mobile layout with a reachable sidebar control, and the existing slide artifact rail. `npm run lint`, focused persistence/store tests, and `npm run build && npm run check:e2e-harness` passed; the final full check is recorded with the commit.

- Tightened the Manus-style task page after browser inspection found the same provider activity being rendered both as assistant-ui tool cards and as a noisy raw timeline. `TaskTimeline` now projects only compact runtime checkpoints; tool calls, screenshots, and deliverables remain in the authoritative Computer rail. Repeated `X11 evidence capture unavailable` events collapse into one explicit visual-evidence summary instead of flooding the conversation. This is a presentation projection only: the append-only event ledger, SSE replay, and evidence rail are unchanged.
- Verified the slice against a persisted slide task at `http://127.0.0.1:5174/tasks/task_dda313c34b5a49`: the checkpoint heading rendered once, raw X11 failure rows were absent from the compact timeline, the dark theme toggle rendered correctly, and a 390×844 viewport retained a reachable sidebar control with the task content visible. `npm run check` passed (32 test files / 161 tests, production build, harness typecheck).

- Added `@assistant-ui/react` through a lazy-loaded conversation thread.
- Projected the authoritative `TaskSnapshot.messages` collection through `useExternalStoreRuntime`; the existing API/SSE/SQLite path still owns reads, writes, queueing, and recovery.
- Routed composer submissions through the existing continuation callback and preserved durable task, turn, provider, message, and status metadata.
- Removed transcript events from `TaskTimeline`, leaving that surface focused on plan, sandbox, tool, evidence, and artifact operations.
- Preserved ONEComputer light/dark styling and the bespoke evidence/artifact rail.
- Added conversion tests and browser-checked the persisted transcript/composer. The assistant-ui bundle is split from the initial application chunk.
- Replaced the sidebar's all-task approximation with cursor-paginated `/api/conversations` summaries derived from persisted task metadata and SQLite messages. History now includes truthful last-message status/preview and count, server-side full-text search across unloaded pages, incremental older-page loading, SSE-driven summary reordering, and reload-safe URL selection.
- Added resumable task SSE using durable frame IDs and task-bound `Last-Event-ID` suffix replay. Snapshot refreshes now coalesce around stream bursts/reconnects instead of racing per event. Added ONEComputer-styled assistant-ui tool cards derived from durable turn/tool evidence, including execution boundary, input-key summary, timing, running/error/completed state, and bounded result text without raw argument values.
- Added governed assistant-ui follow-up attachments end to end: repeated server bounds, sanitized numbered workspace paths, exact-turn provider context/evidence, durable queued-guidance ownership, cancellation cleanup, and user-message file projection without bytes. Added native copy actions. Mobile navigation now starts collapsed and has a modal backdrop plus reachable close control; corrected the collapsed grid's zero-width content bug discovered during 390px browser QA.
- Added turn-bound deliverable cards to assistant-ui. ONEComputer extraction now records each eligible portable file independently after successful copy, while excluding runtime internals, inputs, telemetry, and duplicate preview/validation records. Assistant turns show deduplicated PPTX, PDF, source, and preview actions with immutable evidence IDs; all actions are constrained to same-task API routes.
- Added a repository-local Linear helper (`npm run linear -- ...`) for canonical project issue listing, issue inspection, evidence comments, and team-state transitions. It resolves the API key without exposing it to arguments or output, refuses arbitrary GraphQL, prints compact tables or safe JSON, and is included in the script typecheck/test surface.
- Ran the real Claude Agent SDK locally through the protected LiteLLM relay in isolated temporary data roots: two-turn continuation and Slides/PPTX/PDF harnesses passed. Tightened SDK artifact extraction after observing runtime `.claude/skills` files in the deliverable list; portable-path filtering now excludes runtime internals and labels slide exports accurately. The evidence records that the default alias is GLM-backed and the explicit fallback is OpenRouter-hosted Claude-compatible routing, not direct Anthropic/Bedrock attestation.
- Ran a fresh Azure ONEComputer retained-sandbox regression against an isolated API instance. The primary development-provider task completed with LiteLLM transport, visual evidence, sandbox-origin PPTX/PDF, and valid evidence; the second sandbox reached `started` at the provider while the local task poller remained at `provisioning`, so the combined continuation/isolation harness was stopped and both disposable leases were explicitly released. The live log records this as a partial regression gate rather than a passing claim.
- Ran the combined Azure harness with the VM-supported `claude-granola-5-2` sandbox alias. The first turn completed with valid sandbox-origin PPTX/PDF and 119 visual-frame events; continuation reused the same lease but exposed a hung event-journal `exec` poll even though `.onevibe-exitcode=0` was present. Sandbox command calls now have a 30-second bound and journal polling retries transient failures with durable retry evidence; the timeout race explicitly covers JSON body parsing as well as fetch headers. The continuation/isolation gate remains open pending a fresh run.
- Elevated native SSE to the ONEComputer acceptance gate. `scripts/onecomputer-live-e2e.ts` now consumes task event-stream frames during the live run and verifies task-bound IDs plus `Last-Event-ID` suffix replay, rather than treating snapshot polling as sufficient evidence of streaming.
- Passed the combined ONEComputer acceptance gate on the fresh Azure development provider: Claude Agent SDK inside the sandbox through LiteLLM, 4 live SSE frames, 60 suffix-replayed SSE frames, same-conversation lease/session reuse, distinct second-conversation sandbox, sandbox-origin PPTX/PDF, 102 visual frames, valid evidence, and explicit cleanup. The gate remains development-provider evidence because gateway attestation is disabled.
- Hardened the live harness after real provider runs exposed two false-negative test boundaries: SSE reader cancellation is now non-blocking with a bounded per-read deadline, and ephemeral `.claude/`, `.claude-state/`, and `.onevibe-*` paths are filtered before sandbox artifact retrieval. Focused sandbox/artifact tests passed (7 tests) and the E2E harness typecheck passed.
- Passed the final authenticated Azure development-provider POC in task `task_30236182861f43` with separate task `task_9e70682f63eb40`: same sandbox across the primary follow-up, distinct second sandbox, Claude Agent SDK through LiteLLM, 4 live SSE frames, 31 suffix replay frames, 6 visual frames, valid evidence, sandbox-origin 105,984-byte PPTX and 5,461-byte PDF, and explicit release of both leases. Authenticated provider reconciliation returned zero rows afterward. Gateway attestation remains disabled, so production microVM/egress/secret-broker claims remain open.

# 2026-07-16 — Skills-first release reprioritization

- Reprioritized the local product sequence around **Skills Library → simple durable chat → document artifacts**. Website/App/Game generation is intentionally parked until the capability foundation is reliable.
- Added `scripts/skills-e2e.ts` and `npm run e2e:skills`. The bounded harness rejects invalid skill IDs, persists the selected `document` and `security_review` packs, verifies deterministic SHA-256 manifests and immutable event hashes across API restart, materializes only selected `.claude/skills/*/SKILL.md` files, proves the skill selection does not change the security boundary or workspace policy, and checks the evidence chain.
- The deterministic demo run passed with two selected packs, selected-only materialization, valid evidence after restart, no external writes, and no logged secrets. The fallback is explicitly not a Claude SDK or microVM claim; the provider-backed run remains the acceptance path for proving native Claude materialization.

# 2026-07-16 — assistants-ui UX overhaul program

- Cloned and studied `assistant-ui/assistant-ui` at `/Users/gini/Desktop/Project ONEComputer/reference/assistant-ui`, commit `f1dcd8b`. The relevant reference patterns are runtime-driven `ThreadPrimitive` layouts, empty/welcome/suggestion states, full composer/attachment primitives, message actions and branching, grouped reasoning/tool parts, typed tool fallbacks, generative UI, and measured virtualized threads.
- Audited the current ONEVibe UX and recorded the gap in `docs/ONEVIBE-ASSISTANTS-UI-UX-OVERHAUL.md`: the current thread manually recreates assistant-ui behavior, hardcodes `isRunning: false`, splits the user experience across AssistantThread/TaskTimeline/Workspace, exposes too many controls in the home composer, and uses mono-like visible typography.
- Created the assistants-ui UX Linear program: ONE-238 parent, P0 children ONE-239/240/241, and P1 children ONE-242/243/244. The program requires truthful chat/runtime state first, then composer/thread migration, progressive tool/evidence rendering, artifact inspector, navigation/skills, and a sans-serif visual regression system.
- Relaxed the local Claude golden harness assertion to validate the durable contract (`follow-up … persisted`) instead of requiring one exact model-generated phrase. This keeps the test behavior-focused while retaining the follow-up, restart, SSE, search, and evidence checks.

# 2026-07-16 — Truthfulness audit and backlog creation

- Audited the browser task `task_869e454fe3b140` after a plain `Hello - how are you today` produced a generated artifact. The task was `provider=demo`, `mode=general`, and the deterministic `DemoRuntimeAdapter` emitted canned assistant text, source files, validation, and an external publication approval. This was a backend demo workflow selected by the UI, not a frontend-generated Claude response.
- Reproduced the explicit `provider=claude_sdk` path in isolated task `task_0a4206809d3d4c`. Claude produced a provider-backed greeting, but the global artifact system prompt and unconditional `validateModeArtifacts` path marked the turn `failed` with `artifact_validation_failed` because no artifact was requested. This confirms the need for a separate conversational intent/mode and chat-specific completion semantics.
- Added `docs/ONEVIBE-TRUTHFULNESS-BACKLOG.md` with P0/P1 TODOs covering silent demo defaults, chat/artifact routing, chat validation failures, truthful skill execution status, and the hello acceptance matrix. Updated the local roadmap and `AGENTS.md` so future agents treat these as release blockers before broader parity claims.

# 2026-07-16 — assistants-ui shell overhaul and failure-state hardening

- Browser review found the task page rendering three competing columns at the effective 1140px viewport: history sidebar, conversation, and Computer inspector. The conversation was only about 408px wide. The shell now treats the conversation as primary below 1250px and exposes a task-scoped `View computer` handoff; wider screens retain the split inspector.
- Reworked the visual layer around assistants-ui-style progressive disclosure: readable user/assistant turns, larger composer controls, grouped tool activity, a calm completed-trace summary, and a visible `MessagePrimitive.Error` provider failure surface. The existing server-owned SSE/history/evidence projection remains authoritative.
- Completed traces collapse to a reviewable summary while a live provider trace remains open. This keeps operational evidence visible without forcing every completed run to begin with a wall of checklist telemetry.
- Added durable `provider_execution_failure` classification to the generic adapter failure path. Previously an adapter failure before a Claude terminal result produced `run_failed` with an empty payload, leaving the UI unable to explain or classify the retryable failure.
- `npm run check` passed: 37 test files / 207 tests, production build, and E2E harness typecheck.

# 2026-07-16 — assistant-ui Claude/Perplexity parity pass

- Studied the checked-out assistant-ui Claude and Perplexity examples plus the Claude Artifacts example. Their high-value patterns are `ThreadPrimitive.Viewport`/`ViewportFooter`, Markdown-first message rendering, right-aligned user bubbles, quiet assistant messages with hover actions, a large composer with mode/model controls, and a side artifact surface rather than raw telemetry in the transcript.
- Added the real `@assistant-ui/react-markdown` package and `remark-gfm`; assistant and user text now render headings, lists, emphasis, links, tables, inline code, and fenced code through the assistant-ui Markdown primitive instead of plain paragraphs.
- Replaced the bespoke thread scroll/footer wrapper with `ThreadPrimitive.Viewport` and `ThreadPrimitive.ViewportFooter` while retaining server-authoritative virtualized durable messages and the existing real attachment byte path.
- At the effective 1139px browser viewport, an active task now collapses the history rail and renders a 624px conversation beside a 500px Computer inspector, matching the Manus-style working layout. Opening the history rail falls back to the readable conversation + `View computer` handoff without horizontal overflow.
- Added assistant-ui-style hover-only message actions and kept the terminal/artifact evidence visible in the Computer inspector. Browser QA used `task_f8d51a10de4f4d`; Markdown code spans rendered semantically and the Bash command/output remained visible in the paired inspector.
- `npm run check` passed: 37 test files / 207 tests. The protected live gate passed with chat task `task_405cf74de87149`, artifact task `task_fa55cfeaa2b444`, 8 live SSE frames, 35 replay frames, one bounded Bash call, restart recovery, and failure/retry probe `task_1efc9fd354fa43`. Boundary remains host-process local proof.

# 2026-07-17 — governed MCP declaration slice

- Added SQLite migration v6 and `runtime_mcp_configs` repository support. MCP declarations are durable server state rather than browser-owned or on-disk JSON state, and a reopen/delete persistence test covers the lifecycle.
- Added `GET/POST/DELETE /api/mcp` with strict name, command, and argument validation. Shell interpreters, shell composition, traversal, and newline injection are rejected. The API deliberately accepts no environment values or credentials.
- Added a Computers view MCP configuration panel with add/remove controls and a permanent explanation that credentials are not accepted. New declarations are passed only to adapters advertising `tool_use`; the Claude Agent SDK receives them as MCP server declarations alongside the built-in ONEVibe server.
- This is a local single-user declaration boundary, not production MCP governance. Authenticated ownership, secret references/brokering, per-organization isolation, and external-server health diagnostics remain open under the cloud/auth and Phase 6 work.
- Verification: `npm run check` passed with 43 test files / 228 tests, lint, production build, and E2E harness typecheck. Boundary remains host-process local proof; no microVM, OpenVTC, or production egress claim.

# 2026-07-17 — feature-gated Better Auth foundation

- Added `better-auth` against the existing SQLite handle. When `ONEVIBE_AUTH_ENABLED=true`, startup requires a 32-character `BETTER_AUTH_SECRET`, a real `ONEVIBE_AUTH_OTP_WEBHOOK_URL`, trusted origins, and runs Better Auth migrations in the same local database file.
- Mounted the standard Better Auth Node handler under `/api/auth/*`, added an explicit `/api/auth/session` probe, and exposed `authEnabled` in the health response without exposing secrets or OTPs.
- Email OTPs are stored hashed and are delivered only through the configured webhook. No development OTP logging or browser-returned OTP was added.
- The protected data plane currently fails closed with `auth_ownership_not_ready` after session authentication because TaskStore owner/org scoping is not implemented. This is intentional: a login surface must not create the illusion of multi-user isolation over the current global local store.
- Enabled-mode smoke: Better Auth schema startup succeeded; `/api/auth/session` returned `{enabled:true,session:null}`; `/api/tasks` returned HTTP 401 without a session. Unauthenticated local mode remains unchanged. This slice does not close P4-01/P4-02.

# 2026-07-17 — authenticated local owner scope and login UX

- Added server-derived `ownerUserId` to local task/project/schedule models and to MCP declarations (migration v7). Collection queries are owner-filtered; object access returns the same not-found shape for foreign IDs so identifiers are not disclosed.
- Added owner propagation through task creation, fork/copy, scheduled runs, conversation search, Library, project knowledge/file revisions, schedules, MCP CRUD/injection, task SSE/routes, and wallet approval lookups. Legacy records without an owner remain inaccessible when auth is enabled.
- Added the real Email OTP login page and session client. Authenticated users see their identity in the sidebar, can sign out, receive a private workspace bootstrap project, and do not see the prior hardcoded operator identity. Public share/readiness routes remain explicitly scoped exceptions.
- Enabled-mode HTTP E2E with a test-only delivery webhook passed: owner A requested and verified OTP, created a task, owner B received a separate workspace and zero tasks, and owner B received HTTP 404 for owner A’s task. Unauthenticated `/api/tasks` returned 401; public `/api/runtime` remained available.
- This closes a meaningful local P4-01/P4-06 slice but not the production phase: Better Auth/Postgres migration, org membership, legacy ownership import, production email delivery, and exhaustive route negative tests remain open. Model traffic remains LiteLLM-only.

# 2026-07-17 — Drizzle/Postgres target contract

- Added `server/db/schema.ts` with the target PostgreSQL contract for Better Auth, users/orgs, owner-scoped projects/tasks/schedules/MCP, turns/messages, runtime/native event ledgers, idempotency, runtime leases, and workspace versions.
- Generated `server/db/migrations/0000_onevibe_initial_contract.sql` and added `drizzle.config.ts` plus `npm run db:generate`, `npm run db:migrate`, and `npm run db:check`. `npm run db:check` passes without requiring a live database.
- This is a schema/DDL slice only. The running product remains SQLite-backed until a Postgres repository adapter, explicit owner-aware legacy import, connection/restart/idempotency proof, and a controlled `DATABASE_URL` runtime switch are implemented. No cloud deployment claim is made.

# 2026-07-17 — explicit legacy import seam

- Added `scripts/postgres-import.ts` and `npm run db:import`. It reads the durable local store, requires explicit ownership for ownerless legacy records, refuses mixed owners in the first migration, requires the Better Auth user to already exist in Postgres, and imports projects, tasks, schedules, MCP declarations, turns/messages, runtime/native events, and workspace-version metadata inside one Drizzle transaction.
- `npm run db:import -- --dry-run` was exercised against a fresh temporary data root and produced an owner/count manifest without connecting to a database. The live write path remains intentionally unclaimed until a real Postgres restart/idempotency proof is run.

# 2026-07-17 — disposable Postgres migration proof

- Started a disposable PostgreSQL 18 container on a non-default local port, applied both Drizzle migrations with `npm run db:migrate`, inserted a pre-existing Better Auth import owner, and imported a temporary local workspace through `npm run db:import`.
- The transactional import reported 2 projects, 1 task, 2 messages, and 2 runtime events. A direct Postgres query confirmed those row counts, then the container was restarted and the same counts were confirmed after reconnect.
- This proves the DDL and import seam against a real database, not the application runtime switch. The container was stopped after the proof; no existing workspace container was modified.

# 2026-07-17 — secret-free execution-path diagnostics

- Added authenticated `GET /api/diagnostics` and a Computers status panel for the release-critical execution path: LiteLLM model boundary, session scope, active persistence driver and Postgres contract, runtime readiness, sandbox boundary, and MCP declaration state.
- The endpoint reports bounded booleans/status/detail only. It does not return credentials, prompts, raw provider responses, or attestation claims. In auth-enabled mode it is protected by the same session guard as the data plane.
- Verification: `npm run check` passed with 43 test files / 229 tests, lint, production build, and E2E harness typecheck. This is local operational visibility; it does not close Postgres runtime switching or production sandbox attestation.

# 2026-07-17 — accessibility contract cleanup

- Completed the remaining P5-11 audit slice: every semantic `<time>` element in the React surfaces has a machine-readable `dateTime`, all byte formatting uses the shared `readableBytes` helper, and generated image surfaces retain descriptive `alt` text.
- Added focused unit coverage for byte formatting. The activity/file rail now exposes timestamps to assistive technology without changing its visual presentation.

# 2026-07-17 — truthful demo skill status

- Closed the remaining demo skill truthfulness gap. Server-owned selection evidence now distinguishes simulation (`not_executed_demo`) from provider-owned materialization (`adapter_owned`); demo turns no longer imply that selected packs were executed or written into the task workspace.
- Added regression coverage for the event contract and confirmed the demo runner does not materialize `.claude/skills` files. This does not change the provider-backed Claude materialization path.

# 2026-07-17 — visible client error surfaces

- Added Sonner as the global notification surface. App-level task creation, follow-up, branching, retry, sharing, project, schedule, Library, MCP, runtime, and catalog failures now produce actionable user-visible errors instead of disappearing into rejected promises or empty catches.
- Removed a duplicate schedule confirmation that required two identical confirmations before deletion. The toast layer remains presentation-only and does not alter server-owned evidence or approval authority.
- Verification: `npm run check` passed with 45 test files / 234 tests, lint, production build, E2E harness typecheck, and `npm run db:check`.

# 2026-07-17 — dependency audit gate

- `npm audit --omit=dev` reports five moderate advisories in the Better Auth → Drizzle Kit → esbuild chain. The suggested automated remediation is a breaking `drizzle-kit` downgrade, so it was not applied blindly.
- Added P4-07 and a Security promotion gate requiring a reviewed non-breaking resolution or explicit risk acceptance before production deployment. The issue is bounded to the development-toolchain exposure and does not change the LiteLLM or runtime security boundary.

# 2026-07-17 — Zustand state boundary

- Added `useUiStore`, `useComposerStore`, and `useSessionStore` and migrated App navigation/inspector state, selected skill/running composer state, and auth session state onto them. Server-backed collections deliberately remain in the transitional App layer pending TanStack Query.
- Added focused store tests. P5-01 is complete for the App state boundary; P5-02 remains separate for query/mutation migration.
- Focused verification: `npm run lint`, `npm run test` passed with 46 test files / 236 tests, and `npm run build` passed.

# 2026-07-17 — TanStack Query foundation

- Mounted a single QueryClient at the SPA root with bounded retry, stale-time, and no focus refetch. Migrated the Skills catalog from a hand-written effect/local fetch into a cached query with an explicit fallback and visible error toast.
- Migrated the bounded runtime-readiness snapshot into a second cached query; backend-offline state is derived from query failure/data and the explicit retry button refetches that query.
- Migrated MCP declarations into a cached query and made create/delete update the same query cache after the server mutation, removing the duplicate local MCP collection.
- Migrated Projects into a cached query and made project create/update/file/restore mutations update the same query cache; sign-out removes the project cache to avoid cross-session residue.
- Migrated Schedules and Library into cached queries; schedule create/toggle/delete/run and Library removal update or invalidate the corresponding query cache, and sign-out removes both caches.
- Migrated Conversations to a paginated TanStack Infinite Query. Sidebar pagination now uses the query cursor, and task/snapshot/branch/scheduled-run updates insert the server-derived summary into the first page without making the browser authoritative for task state.
- Migrated task inventory to a cached Query. Creation, branch, scheduled-run, and snapshot updates write server-derived task records into the cache; active task snapshots and SSE remain on `useTask`.
- Kept task/SSE state on `useTask`: an append-only replayable event stream is not treated as ordinary query data. Remaining collection queries and mutations are intentionally open under P5-02.
- Focused verification: lint, 46 test files / 236 tests, and production build passed.

# 2026-07-17 — active task mutation boundary

- Routed active-task stop, retry, follow-up, edit/branch, share, queued-guidance removal, project movement, and tag updates through TanStack Query mutation hooks. Successful mutations reconcile the ordinary task/conversation caches or refresh the active server snapshot; failures remain visible through the existing toast contract.
- Kept `useTask` as the only owner of the active append-only SSE/replay projection. This deliberately avoids copying a live event stream into generic Query data while removing direct App-level mutation calls from the active task surface.
- Removed a duplicate global Sonner provider discovered during the handover audit; each async failure now has one notification surface.
- Verification: `npm run check` passed with 46 test files / 236 tests, lint, production build, and E2E harness typecheck; `npm run db:check` passed. Commit: `26762c1`.

# 2026-07-17 — fail-closed persistence driver selection

- Added `resolvePersistenceConfig` before `TaskStore` startup. SQLite remains the only active application driver; explicit Postgres selection or any `DATABASE_URL` that would otherwise be ignored now refuses startup with a non-secret diagnostic.
- Added focused coverage for default SQLite selection, explicit SQLite selection, invalid drivers, explicit Postgres selection, and mixed `DATABASE_URL`/SQLite configuration. This closes the silent-mixed-driver risk without pretending that the Postgres repository adapter exists.
- Updated `.env.example`, the Phase 4 TODO, and diagnostics to make the active driver boundary explicit. `npm run check` passed with 47 test files / 240 tests, lint, production build, and E2E harness typecheck; `npm run db:check` passed. Commit: `d8e5994`.

# 2026-07-17 — governed skill marketplace boundary

- Added SQLite migration v8 and a repository for owner-scoped marketplace installations. Verified catalog metadata and `SKILL.md` content are stored with version, source URLs, and SHA-256 provenance; the Postgres schema/import contracts include the same installation record.
- Added a GitHub-only catalog/content loader with bounded 256 KiB reads, HTTPS/provenance checks, exact digest verification, frontmatter identity checks, five-minute catalog caching, and built-in fallback when discovery is unavailable. Production catalog defaults to the ONEVibe repository's `skills/catalog.json`.
- Added `GET /api/skills`, `POST /api/skills/install`, and `DELETE /api/skills/:id`. Marketplace entries are not selectable until installed; removal is rejected while a pending/running/waiting task depends on the skill. Provider adapters resolve installed content at materialization time; demo mode records `not_executed_demo` and writes no skill files.
- Added Skills Library install/remove controls, the first `meeting-brief` catalog/content pair, focused marketplace/store tests, and `npm run e2e:skill-marketplace`. The E2E uses a loopback GitHub-shaped fixture and proves install, task selection, truthful demo evidence, and removal; it does not claim external GitHub reachability or protected Claude execution.
- Verification: `npm run check` passed with 49 test files / 245 tests, `npm run db:check` passed, and the marketplace E2E passed. The protected provider materialization gate remains open.
## 2026-07-17 — local organization membership scaffold and mandatory LiteLLM wording

- Added migration v9 for local `organizations` and `organization_members` records, with owner/member role checks, authenticated HTTP list/create/member routes, owner-only add/remove operations, and a no-self-removal guard. The browser/API layer exposes only typed organization records; membership is not used as a task/project/runtime authorization grant.
- Expanded the Better Auth owner-scope acceptance harness to create an organization, verify an unlisted organization before membership, add a second authenticated user, verify member visibility, reject member-admin mutations, reject owner self-removal, and prove the member still cannot see the owner's task inventory.
- Re-stated in the handover that every model request and agentic turn must traverse the server-controlled LiteLLM relay for data sovereignty, routing, cost control, and optimization. Direct first-party Anthropic traffic remains prohibited in local, test, emergency, and release paths; the Claude SDK is only a harness using Anthropic-compatible transport variables pointed at LiteLLM.
- Verification: `npm run check`, `npm run db:check`, and `npm run e2e:auth-owner` passed. This is local SQLite/auth evidence only; Postgres-backed org authorization, production delivery, provider acceptance, and sandbox isolation remain open.

## 2026-07-17 — expanded authenticated route-isolation proof

- Extended `scripts/auth-owner-e2e.ts` beyond the first owner-scope pass: a second authenticated user now receives empty conversation, Library, and server-side search results; every representative task subroute (messages, SSE events, files, versions, preview, evidence, and download) returns the same owner-scoped `404` boundary; org member administration remains `403` for non-owners and `409` for owner self-removal.
- This closes a local HTTP negative-coverage slice for ONE-253 without implying that organization membership is yet a data-plane grant. The running store remains SQLite-backed and organization policy does not widen task/project/runtime access.
- Verification: `npm run e2e:auth-owner` and `npm run check:e2e-harness` passed. Production email, Postgres repositories/runtime, org-backed authorization, provider acceptance, and sandbox isolation remain open.

## 2026-07-17 — organization persistence repository boundary

- Moved local organization/member reads and mutations out of `TaskStore`'s direct SQLite SQL and into the shared persistence repository contract. `SqliteOrganizationRepository` now participates in the same `SqliteUnitOfWork` transaction boundary as conversations, messages, runtime events, MCP declarations, skills, idempotency, and leases.
- Added repository-level coverage for organization/member ordering, lookup, membership listing, and removal. This is an adapter seam, not Postgres support: the active store remains SQLite and organization membership still does not grant task/project/runtime access.
- Verification: focused repository tests and `npm run e2e:auth-owner` passed; the full release gate remains required before merge.

## 2026-07-17 — production dependency audit gate cleared

- Added a reviewed npm override that replaces the vulnerable nested `esbuild@0.18.20` pulled by `@esbuild-kit/core-utils` with patched `esbuild@0.25.12`. The override is intentionally narrow and is retained in the lockfile; it avoids the incompatible `npm audit fix --force` downgrade path for Better Auth/Drizzle Kit.
- Added `npm audit --omit=dev --audit-level=moderate` to the required GitHub Actions verification job. `npm audit --omit=dev` now reports zero vulnerabilities, `npm ls` reports the overridden dependency as patched, and `npm run db:check` remains green.
- This closes only the dependency advisory gate. It does not close Postgres runtime, production auth, deployment, sandbox attestation, or provider acceptance.

## 2026-07-17 — patched dependency image container proof

- Rebuilt `onevibe-ci:local` after the lockfile override and started it with a read-only root filesystem, only bounded `/tmp` and data tmpfs mounts, all Linux capabilities dropped, `no-new-privileges`, and UID 10001. `/api/health` returned `healthy`; the configured image user and runtime UID were both verified.
- This is a local container hardening proof. The image still runs the SQLite-backed application and is not a Postgres deployment or production sandbox-attestation proof.

## 2026-07-17 — skills E2E truthfulness and identifier fixes

- Fixed the task skill schema to accept the repository’s stable built-in snake_case identifiers (`document`, `security_review`, and the other built-in packs) while preserving bounded marketplace IDs. The previous schema rejected valid built-in selections before execution.
- Corrected `scripts/skills-e2e.ts` to distinguish truthful demo (`Skill packs recorded for simulation`, `not_executed_demo`) from provider (`Versioned skill packs selected`, `provider_turn_workspace`) evidence. The harness now inspects internal skill bytes only through a stopped local `TaskStore`; the public files route remains prohibited from exposing `.claude/skills`.
- Passing evidence: `npm run e2e:skills` (deterministic local-demo materialization, immutable manifest across restart, permission invariant, selected-only files), `npm run e2e:skill-marketplace` (loopback catalog install/remove), and `npm run check` (51 files / 257 tests). No protected Claude/LiteLLM materialization claim is made without configured relay evidence.
