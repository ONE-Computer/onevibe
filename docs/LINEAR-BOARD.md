# ONEVibe Linear board

## Canonical project

[ONEVibe — Backend E2E & Manus Parity](https://linear.app/onecomputer/project/onevibe-backend-e2e-and-manus-parity-ff4554221471) is the execution source of truth for ONEVibe. The broader ONEComputer × OpenVTC project owns platform identity, policy, wallet, and gateway work; it is not the ONEVibe product backlog.

Linear also serves as the management and architecture review hub:

- [Architecture, North Star, and Management Overview](https://linear.app/onecomputer/document/onevibe-architecture-north-star-and-management-overview-27ae12db08ed)
- [Backend System Architecture and Data Contracts](https://linear.app/onecomputer/document/onevibe-backend-system-architecture-and-data-contracts-87f16ad25cfa)
- [ADR-001 — One Durable Conversation Owns One MicroVM](https://linear.app/onecomputer/document/adr-001-one-durable-conversation-owns-one-microvm-7f16afddf894)
- [Release Gates and Evidence Matrix](https://linear.app/onecomputer/document/onevibe-release-gates-and-evidence-matrix-57f4789dc493)
- [Risks, Decisions, and Open Questions](https://linear.app/onecomputer/document/onevibe-risks-decisions-and-open-questions-528b7de05f59)
- [Engineering Workstreams and Agent Delegation Model](https://linear.app/onecomputer/document/onevibe-engineering-workstreams-and-agent-delegation-model-2b0ec99f18c5)
- [ADR-002 — Local Transactional Persistence Driver](https://linear.app/onecomputer/document/adr-002-local-transactional-persistence-driver-ec63c2a70f6c)
- [Backend Contract Freeze v1](https://linear.app/onecomputer/document/onevibe-backend-contract-freeze-v1-ef85a800f29d)
- [POC E2E Scope and Exit Criteria](https://linear.app/onecomputer/document/onevibe-poc-e2e-scope-and-exit-criteria-b8cb69cb2ba9)

The current release gate is [ONE-230](https://linear.app/onecomputer/issue/ONE-230/p0-local-onevibe-reliability-and-manus-parity-release-gate). ONEVibe is now explicitly local-first: the product must be a reliable Manus-style workspace powered by the local Claude Agent SDK/LiteLLM path before platform integration work resumes.

The handover adds [ONE-245](https://linear.app/onecomputer/issue/ONE-245/secp0-enforce-litellm-only-model-routing-for-every-harness) as a security release gate: every harness must route model traffic through the server-controlled LiteLLM boundary. Direct first-party Anthropic API traffic is prohibited, not a fallback. The current Claude SDK path now fails closed without the relay; Codex/AgentCore remain open until their adapters use the same boundary.

The first handover Phase 2 engineering ticket is [ONE-246](https://linear.app/onecomputer/issue/ONE-246/bep1-implement-provider-neutral-runtimeadapter-lifecycle-contract). It tracks the provider-neutral lifecycle contract implemented in commits `dfb6b89` and the follow-up canonical test migration, with runtime registry extraction as the next boundary.

The runtime registry work is tracked in [ONE-247](https://linear.app/onecomputer/issue/ONE-247/bep1-build-runtimeregistry-and-capability-based-routing). Commits `fe34066`, `9983966`, and the current health-cache slice centralize adapter factories, capability-based mode suggestions, effective defaults, mode-aware compatibility reasons, explicit user-selected runtime switching after failure, and bounded startup health status/latency. Live multi-provider relay acceptance and production attestation remain open.

The conversation-branching Phase 2 gap is now tracked in [ONE-250](https://linear.app/onecomputer/issue/ONE-250/bep1-add-durable-conversation-branching-and-edit-message). Commit `66f4d22` implements the local branch endpoint, assistant-ui edit action, immutable source transcript, independent workspace copy, lineage/evidence metadata, and persistence/isolation tests. Cloud authorization, multi-user isolation, sandbox isolation, and live provider acceptance remain open.

The cloud/container foundation is tracked in [ONE-251](https://linear.app/onecomputer/issue/ONE-251/platp1-containerize-onevibe-with-truthful-persistence-and-deployment). The current local slice has a non-root, hardened Docker/Compose runtime with a persistent SQLite volume, health smoke proof, and a GitHub Actions image/non-root/read-only smoke gate. It is intentionally not complete until Postgres/Drizzle, auth/user scoping, managed deployment, and sandbox attestation are wired without decorative or unused services.

The first MCP extension slice is tracked in [ONE-252](https://linear.app/onecomputer/issue/ONE-252/extp1-add-governed-mcp-configuration-and-adapter-injection). The local implementation adds SQLite v6 persistence, audited CRUD, strict command/argument validation, a Computers-view configuration surface, a bounded per-server health/tool-catalog probe, and secret-free injection into tool-capable Claude SDK turns. It is intentionally not production MCP governance: authenticated ownership, secret brokering, external-server health/attestation, and per-organization isolation remain open under P4/P6.

The cloud identity follow-up is tracked in [ONE-253](https://linear.app/onecomputer/issue/ONE-253/platp0-wire-authenticated-owner-scoped-data-plane). The Better Auth foundation now starts against the existing SQLite handle when explicitly enabled, stores OTPs hashed, requires a real delivery webhook, and scopes new local data by server-derived user ID. The `npm run e2e:auth-owner` harness now proves the real email-OTP route through a loopback delivery fixture, unauthenticated `401`, two-user session creation, owner-only inventories, and cross-user `404` isolation for task, project, project-file, schedule, MCP, conversation, Library, search, and representative task-subroute reads/mutations. `npm run e2e:auth-postgres` additionally proves the Drizzle/Postgres Better Auth adapter creates two distinct users and durable sessions through the same OTP/webhook contract. A 2026-07-17 audit also propagated actor scope through task project movement and tag mutation, with cross-user store-level negative coverage. Commit `b13b8fb` adds local `organizations`/`organization_members` records and authenticated owner/member routes; the harness proves membership visibility and owner-only administration without widening task access. ONE-253 remains open for selecting Postgres in the running server/TaskStore, Postgres-backed org authorization, production migration/import, and production email acceptance.

The Postgres migration work is tracked in [ONE-254](https://linear.app/onecomputer/issue/ONE-254/platp1-implement-postgres-drizzle-repository-and-migrationimport-proof). The current branch contains the reviewed Drizzle schema, seven generated SQL migrations, an explicit owner-required `db:import` seam, owner-bound conversation/task identity, organization/member staging with Better Auth-user existence checks, explicit task-lineage/provider-message/MCP-history/legacy-provenance target tables, pre-transaction validation that rejects missing or cross-owner task/schedule project references, a disposable PostgreSQL 18 migration/import/restart proof, isolated async owner-scoped chat, metadata, and operational repositories with `npm run e2e:postgres-chat`, `npm run e2e:postgres-metadata`, and `npm run e2e:postgres-operations`, a CI PostgreSQL migration/chat/metadata/operations smoke job, and a fail-closed driver guard that rejects an unavailable Postgres selection or ambiguous `DATABASE_URL`. Migration `0003` gives the native projection offset primary key an explicit non-truncated name while preserving the historical migration ledger; migrations `0004`–`0006` add the remaining durable identity/audit/retention contract without switching the runtime driver. The running TaskStore remains SQLite-backed until the full transaction-compatible repository, controlled runtime selection, and complete-surface idempotency evidence are complete.

The execution-path visibility slice is tracked in ONE-255: authenticated `/api/diagnostics` and the Computers panel expose bounded LiteLLM, session, persistence, runtime, sandbox, and owner-scoped MCP status/health without secrets or provider payloads. It is Done for local operational diagnostics; Postgres runtime switching, cloud health, and production sandbox attestation remain separate release gates.

The focused accessibility cleanup is tracked in [ONE-256](https://linear.app/onecomputer/issue/ONE-256/uxp1-complete-accessibility-and-semantic-status-surfaces). It is Done for the local React surfaces: semantic timestamps expose `dateTime`, byte formatting is shared, and generated images have descriptive alt text. This is not a substitute for a full automated WCAG/axe audit.

The client error-surface slice is tracked in [ONE-257](https://linear.app/onecomputer/issue/ONE-257/uxp1-surface-async-failures-with-a-consistent-toast-contract). It is Done locally: Sonner is mounted once, recoverable async failures surface to users, page-local errors remain authoritative, and the duplicate schedule confirmation is removed.

The dependency security gate is tracked in [ONE-258](https://linear.app/onecomputer/issue/ONE-258/secp1-resolve-dependency-audit-gate-before-production). Commit `686ba37` adds a narrow lockfile override for the vulnerable nested esbuild dependency, keeps Drizzle Kit/Better Auth versions unchanged, adds a CI production-tree audit, and passes `npm audit --omit=dev --audit-level=moderate` with zero findings plus `npm run db:check`. This closes the advisory gate without using `npm audit fix --force`; the override must be revalidated on dependency upgrades.

The Zustand state migration is tracked in [ONE-259](https://linear.app/onecomputer/issue/ONE-259/uxp1-migrate-application-state-to-explicit-zustand-stores). It is Done: the three explicit UI/composer/session stores are implemented and tested, all ordinary server-backed collections are Query-owned, and active task snapshots remain deliberately on the SSE/useTask boundary.

The TanStack Query migration is tracked in [ONE-260](https://linear.app/onecomputer/issue/ONE-260/uxp1-migrate-server-backed-collections-to-tanstack-query). It is Done for the local boundary: the root QueryClient and all ordinary server-backed collection queries are implemented, and active-task stop/retry/follow-up/branch/share/guidance/project/tag actions use mutation hooks with explicit pending/error behavior and authoritative cache/snapshot reconciliation. The durable `useTask` SSE authority remains intentionally separate from generic Query state.

The skills/navigation workstream is tracked in [ONE-243](https://linear.app/onecomputer/issue/ONE-243/uxp1-rebuild-thread-list-skills-command-palette-and-project-context). Its marketplace slice has a GitHub-backed catalog, SHA-256-verified content download, owner-scoped SQLite installation state, install/remove API/UI, built-in snake_case selection validation, deterministic restart/materialization proof, truthful demo/provider materialization boundaries, a live pushed-GitHub catalog/content harness (`npm run e2e:skill-marketplace-github`), and protected Claude/LiteLLM materialization evidence (`npm run e2e:skills`). The provider evidence is host-process only; production authorization remains a separate P4/P6 boundary.

The LiteLLM-routed Codex-compatible harness is tracked in [ONE-248](https://linear.app/onecomputer/issue/ONE-248/bep1-add-litellm-routed-codex-compatible-runtime). Commit `947835b` adds bounded workspace tools and truthful non-sandboxed capability metadata; live relay acceptance and isolated execution remain open.

The AgentCore remote boundary is tracked in [ONE-249](https://linear.app/onecomputer/issue/ONE-249/bep1-add-agentcore-remote-adapter-with-explicit-litellm-route). Commit `15cbe15` adds the explicit LiteLLM route gate and normalized SSE adapter without claiming AWS identity or sandbox isolation.

The deferred ONEComputer/OpenVTC work remains tracked, but is not on the critical path:

1. `ONE-216` — transactional conversation, turn, and message service.
2. `ONE-217` — one independently provisioned ONEComputer microVM lease per conversation.
3. `ONE-218` — Claude Agent SDK inside that microVM, exclusively through LiteLLM.
4. `ONE-219` — durable native events, resumable streaming, and history projection.
5. `ONE-220` — real PPTX/PDF generation and bounded extraction inside the microVM.
6. `ONE-221` — real-provider E2E with restart, failure injection, and teardown proof.
7. `ONE-222` — isolation, short-lived credentials, quotas, egress, and reconciliation.
8. `ONE-223` — bind the Manus-style UX to the proven backend.
9. `ONE-224` — add ONEComputer policy and external OpenVTC approvals after backend stabilization.
10. `ONE-225` — make ONEComputer allocation idempotent and provider operations recoverable; blocks safe lease creation.
11. `ONE-226` — integrate and attest a real microVM boundary without host Docker-socket exposure; blocks the final production gate.

## Status snapshot — 2026-07-17 (local ONEVibe parity pivot; active-task mutation boundary closed)

The board contains 46 scoped issues: 11 Done, 26 In Progress, and 9 Backlog. That is **24% strict ticket completion** (11/46), or **52% weighted delivery progress** when an In Progress ticket counts as half (11 + 26×0.5 = 24/46, rounded). ONE-233 through ONE-236, ONE-255, ONE-256, ONE-257, ONE-258, ONE-259, and ONE-260 are Done from real local Claude/LiteLLM, bounded diagnostic, focused accessibility, explicit demo-truthfulness, client error-surface, dependency-audit, state-boundary, or Query mutation evidence; ONE-237 remains the final truthfulness release blocker under ONE-230. ONE-245 is In Progress: the Claude SDK path fails closed without LiteLLM, while live relay acceptance and future-harness enforcement remain open. ONE-246 has the provider-neutral lifecycle base and persisted event-stream bridge implemented; ONE-247 has the current registry/routing and health slice implemented, including explicit mode-aware selection and user-selected fallback; ONE-248 has the Codex-compatible LiteLLM adapter implemented with live relay acceptance still open; ONE-249 has the AgentCore route-gated SSE adapter implemented with live identity/attestation evidence still open; ONE-250 covers durable conversation branching/edit-message and is locally implemented with cloud/auth/provider acceptance open; ONE-251 has the hardened local container slice implemented with persistence/auth/deployment open; ONE-252 has the local governed MCP declaration and opt-in capability-facade slices implemented with authenticated ownership, health, secret brokering, and protected provider acceptance open; ONE-253 has Better Auth, real OTP login UI, local user ownership, two-user HTTP proof, and a local org/member scaffold implemented with Postgres/org-backed authorization and production acceptance open; ONE-254 has the Drizzle/Postgres target schema, generated migrations, explicit owner-required import seam, relationship-validation guard, disposable live import/restart proof, and runtime repository switch open. The assistants-ui UX program is ONE-238 through ONE-244: it is a P0/P1 overhaul of the conversation architecture, composer, execution narrative, artifact inspector, navigation, skills surfaces, and sans-serif design system. The broader 102-row parity ledger remains 42 Implemented, 56 Partial, and 4 Missing: **41% strict implementation** and **69% weighted implementation** (Implemented + half of Partial). These are different denominators: the first measures Linear deliverables; the second measures feature breadth.

### Current phase — ONEVibe local reliability and Manus parity

ONE-230 is the active P0. Its release gate now has a preceding truthfulness checkpoint: ONE-233 through ONE-235 are complete; ONE-236 owns truthful skill status and ONE-237 owns the release-blocking hello matrix. ONE-238 is the major assistants-ui-native UX parent, with ONE-239 through ONE-241 as P0 conversation/runtime slices and ONE-242 through ONE-244 as P1 inspector, navigation/skills, and design-system slices. Only after those foundations are green does the broader local gate cover durable history, reconnectable SSE, follow-up turns, cancellation/retry/error states, assistant-ui conversation rendering, plan/tool/activity evidence, screenshots/terminal cards, artifact rail, and responsive browser QA. PPTX/PDF generation remains part of the explicit artifact path. The UI must never imply that local mode is a production network-containment boundary.

ONE-223 and ONE-229 are the active UX workstream. ONE-216 through ONE-220 remain the backend foundation. ONE-221, ONE-225, and ONE-226 are deliberately back in Backlog: their Azure/provider recovery and attested microVM work will resume only after ONE-230 is green. ONE-215 is retained as a historical dependency epic and is back in Backlog. ONE-224, ONE-227, and ONE-228 remain deferred platform/security work.

ONEComputer is not being deleted or bypassed; it is being treated as the later enforcement plane. The current goal is to make the product contract, local runtime, event model, artifact model, and Manus-style interaction reliable enough that platform integration has a stable consumer.

The backend is ahead of the board's raw status: ONE-216 through ONE-220 have substantial implementation slices, and ONE-220 remains Done from real sandbox-origin artifact evidence. The next proof is local, not Azure: ONE-230 must establish a repeatable Claude/LiteLLM conversation, durable history, resumable SSE, error/retry/cancel behavior, artifact projection, and browser-visible evidence. The Azure recovery work on ONE-221/225 and the attested isolation work on ONE-226 remain documented platform follow-up, but are no longer presented as current progress.

The truthfulness audit found five mandatory local tickets that were missing from the previous board: ONE-233 through ONE-237. The credential blocker remains resolved through the pre-provisioned server-side project-key path; the key remains outside the repository, browser, evidence, and task workspace. Provider timeout/replay evidence remains in ONE-225; durable native SSE/projection remains in ONE-219; isolation and secret injection remain in ONE-226/ONE-227. The Azure deployment-wrapper PATH/toolchain issue is a follow-up engineering improvement, not a reason to create a duplicate POC ticket. The board does not contain a separate ticket for the local Cargo/toolchain prerequisite because that is an environment/setup issue, not a product acceptance gate.

### Truthfulness / fake-runtime backlog

The browser audit reproduced a plain greeting entering the deterministic demo artifact pipeline as `task_869e454fe3b140`. An isolated explicit Claude/LiteLLM task `task_0a4206809d3d4c` produced a provider-backed greeting but was then incorrectly marked `failed` by artifact validation. The detailed evidence and acceptance criteria are in [`docs/ONEVIBE-TRUTHFULNESS-BACKLOG.md`](./ONEVIBE-TRUTHFULNESS-BACKLOG.md).

- `ONE-233` — `[BUG][TRUTHFULNESS][P0]` Stop silently defaulting new conversations to deterministic demo (**Done**).
- `ONE-234` — `[BUG][TRUTHFULNESS][P0]` Add chat intent distinct from artifact task orchestration (**Done**).
- `ONE-235` — `[BUG][TRUTHFULNESS][P0]` Do not fail provider-backed chat on artifact validation (**Done**).
- `ONE-236` — `[BUG][TRUTHFULNESS][P1]` Make skill execution status truthful in demo mode (**Done**).
- `ONE-237` — `[TEST][TRUTHFULNESS][P1]` Add hello acceptance matrix across demo, Claude, SSE, and reload.

### Assistants-ui UX overhaul

The cloned `assistant-ui/assistant-ui` reference was studied at commit `f1dcd8b`. Its primitives and examples provide the target interaction architecture: runtime-driven streaming state, welcome/suggestions, composer attachment/dropzone controls, message actions, grouped reasoning/tools, typed tool fallbacks, generative UI, and virtualized threads. The detailed plan is [`docs/ONEVIBE-ASSISTANTS-UI-UX-OVERHAUL.md`](./ONEVIBE-ASSISTANTS-UI-UX-OVERHAUL.md).

- `ONE-238` — `[UX][P0]` Major assistants-ui-native ONEVibe UX overhaul.
- `ONE-239` — `[UX][P0]` Migrate the thread shell and runtime state to assistant-ui-native primitives.
- `ONE-240` — `[UX][P0]` Rebuild the composer and zero-state with assistant-ui patterns.
- `ONE-241` — `[UX][P0]` Unify conversation, reasoning, tools, and evidence into one thread narrative.
- `ONE-242` — `[UX][P1]` Build the artifact and Computer inspector with generative UI.
- `ONE-243` — `[UX][P1]` Rebuild thread list, skills command palette, and project context.
- `ONE-244` — `[DESIGN][P1]` Enforce the sans-serif design system and visual regression.

The UI program is no longer blocked on the completed truthfulness P0s, but must not be closed from screenshots alone. It requires real runtime state, durable history, artifact provenance, browser QA, and the sans-serif/static audit.

### Current local slice evidence

- `task_45213c6170d243`: real Claude/LiteLLM chat with streamed deltas and no artifact pipeline.
- `task_f8d51a10de4f4d`: real Claude/LiteLLM Markdown artifact plus bounded Bash, passing validation, durable command/result evidence, and host-path redaction.
- Commit `5002bb1` added `npm run e2e:chat`, which passed in an isolated temporary API/data root with real chat SSE, two-turn persistence, demo disclosure, Markdown generation, bounded Bash terminal evidence, replay, and restart recovery. The run recorded 8 live frames, 36 replay frames, 2 chat turns, 2 Bash calls, and a valid evidence chain.
- Commit `b30da27` closed a browser-found presentation defect: internal `.claude/skills` files no longer inflate portable artifact counts, provider thinking-token telemetry is not rendered as reasoning, and deterministic history entries are visibly labelled `Simulation · no model call`.
- Post-fix live rerun: `task_4ec98deee76e41` / `task_a01f60f606c349` / `task_9ea262fa183949` passed with 23 live SSE frames, 46 replay frames, two chat turns, one bounded Bash call, valid evidence, and restart recovery.
- The mobile inspector handoff is now implemented and browser-checked: `View computer` switches to a full-height Computer surface and `Back to conversation` restores the thread without horizontal overflow. Exact 390px/tablet screenshot automation remains open.
- 2026-07-17 browser audit found and fixed a desktop-only CSS-grid defect: Sonner's notification region was an extra `.app-shell` grid child, compressing the task shell and causing 9px horizontal overflow at 1,280px. The current app now passes no-overflow checks at 1,280×900 and 390×844, and an explicit local simulation chat completed in the mobile flow. ONE-237 remains open for protected Claude/LiteLLM browser acceptance and exact screenshot automation.
- The focused local gate is green: `npm run check` (lint, 43 files / 229 tests, production build, and all E2E harness typechecks). Boundary: host-process local proof only; no microVM/ONEComputer/OpenVTC/production egress claim.
- UX shell overhaul pass: at the effective 1140px browser width, the old three-column layout compressed the conversation to ~408px. The current slice makes the conversation primary below 1250px, keeps the assistant-ui thread readable, collapses completed operational traces, exposes provider errors through assistant-ui, and hands off to a full-height Computer inspector via `View computer`. Browser-checked on `task_f8d51a10de4f4d`; exact-width screenshot automation and remaining composer/thread/skills polish remain open under ONE-238/239/240/241/242/243/244.
- Latest protected local E2E `task_b47dcbab442345` / `task_b110270725f941` / `task_ce7415292df54c` passed with 31 live SSE frames, 80 replay frames, two chat turns, two bounded Bash calls, restart recovery, and valid evidence. Failure/retry probe `task_4c1e953f5c4d40` intentionally failed one provider run, restarted the API against the same data, retried idempotently, completed, and returned valid evidence. Boundary remains host-process local proof; no microVM or OpenVTC enforcement claim.
- Claude/Perplexity assistant-ui parity slice: added the actual `@assistant-ui/react-markdown` + GFM renderer, adopted `ThreadPrimitive.Viewport`/`ViewportFooter`, added hover/focus message actions, and restored a 624px conversation beside a 500px Computer inspector at the effective 1139px viewport by collapsing the history rail for active tasks. Browser QA kept the terminal command/output and artifact cards task-bound. Latest live proof: `task_405cf74de87149` / `task_fa55cfeaa2b444` with 8 live SSE frames, 35 replay frames, one Bash call, restart recovery, valid evidence, and retry probe `task_1efc9fd354fa43`. Remaining parity work stays open under ONE-238 through ONE-244.

### Latest development-provider POC evidence

The final authenticated run used a temporary ONEVibe data directory and `npm run e2e:onecomputer` with the VM-supported `claude-granola-5-2` alias. It passed with primary task `task_30236182861f43` / sandbox `onevibe-82861f43` and separate task `task_9e70682f63eb40` / sandbox `onevibe-2f63eb40`: same-conversation reuse, distinct-conversation isolation, `sdkRuntime=true`, `litellmRouted=true`, 4 live SSE frames, 31 suffix-only replay frames, 6 visual frames, valid evidence, and `released/released` cleanup. The sandbox produced a 105,984-byte PPTX (`PK`) and 5,461-byte PDF (`%PDF-`). An authenticated provider reconciliation afterward returned zero sandbox rows. `gatewayEnforced=false` remains explicit: this is a development Kasm POC, not production microVM or egress-attestation evidence.

The current local-first evidence is separate from that platform record: `task_33c790f67d7345` passed the two-turn Claude/LiteLLM host-process proof with a persisted session and valid evidence; `task_bffd48feac3244` passed the eight-slide local creation proof with 106,857-byte PPTX, 7,463-byte PDF, and valid evidence; and `task_f6e383d5e0224f` passed the secret-free HTTP retry idempotency proof. The latest local engineering slices also close durable conversation branching (ONE-250), hardened container shape (ONE-251 partial), audited MCP declarations (ONE-252 partial), and local authenticated owner isolation/login UX (ONE-253 partial), alongside schedule deletion, Library hiding, canonical labels, expandable traces, and explicit history/evidence review. These local gates advance ONE-230/231 but do not close Azure, microVM, OpenVTC, or external approval work.

## Product invariant

The correctness-first model is **one durable conversation → one microVM lease**. Follow-up turns reuse the same lease, workspace, and Claude session; different conversations must never share a lease. Pooling, snapshots, and warm reuse are deferred until the real-provider E2E proves isolation, restart recovery, artifact extraction, cancellation, and teardown.

Current ONEComputer Kasm/Daytona adapters are development sandbox providers, not yet accepted microVM evidence. In particular, the Kasm implementation adds `NET_ADMIN` and mounts the host Docker socket. `ONE-226` now has an explicit fail-closed production switch, but still owns the replacement/attestation gate: a real Firecracker/Kata/Cloud Hypervisor-class boundary, signed attestation verification, and live isolation evidence are required before production acceptance. `ONE-225` owns the provider-side idempotent allocation-operation API required to recover safely when provider creation times out after remote acceptance; ONEVibe now has the consuming client seam and fail-closed reconciler, but that does not substitute for provider persistence.

Neither platform enhancement blocks the immediate POC. The POC may use the current provider to prove one conversation reuses one development sandbox across turns, another conversation receives a different sandbox, Claude runs there through LiteLLM, history survives reload, and PPTX/PDF artifacts originate inside and extract from that sandbox. The evidence and UI must say `development sandbox`; production microVM/isolation claims remain blocked by `ONE-226`, and create-timeout ambiguity remains an explicit `ONE-225` limitation.

## API access

Read the credential at `../handover/onecomputer-handover-secrets-lean/mac/linear-api-key.txt` only into `LINEAR_API_KEY` for the duration of a command. Send GraphQL requests to `https://api.linear.app/graphql` with the key in the `Authorization` header. Never print the key, use `set -x`, include it in a URL or issue, write it into `.env`, or commit it.

## Repository-local helper

Use the checked-in CLI instead of hand-written GraphQL snippets:

```bash
npm run linear -- help
npm run linear -- issues
npm run linear -- issue ONE-223 --json
npm run linear -- comment ONE-223 --file /tmp/evidence.md --confirm
npm run linear -- state ONE-223 --name "In Progress" --confirm
npm run linear -- state ONE-223 --name "Done" --dry-run
npm run linear -- create-issue --title "New work" --description-file /tmp/issue.md --confirm
```

The helper lives at `scripts/linear-cli.ts` and uses the canonical project/team IDs by default. Issue listing follows Relay cursors until complete and supports `--state`/`--priority` filters. Credential precedence is `LINEAR_API_KEY`, `LINEAR_API_KEY_FILE`, then the handover key file relative to the repository. It never accepts a credential flag, prints an authorization header, or supports arbitrary GraphQL. Read commands are safe to repeat; mutations require explicit `--confirm` or can be inspected with `--dry-run`. Add new board workflows as typed commands with focused tests rather than copying curl payloads into agent instructions.

### Helper scope and next hardening

The current CLI is sufficient for evidence-driven delivery updates: project/issue reads, cursor-complete project issue listing, comments attached to an issue, named team-state transitions, and confirmed issue creation. It is not a full Linear client yet. The next safe extensions are:

1. `issue update` with an allowlisted set of fields and team-state validation.
2. Standalone cursor-paginated comment listing.
3. GraphQL-side filters for larger projects rather than downloading all issues.
4. Typed transport errors, strict environment-key validation, and read-only retry behavior.
5. Explicit mutation ambiguity/deduplication policy before adding automatic retries.

Do not invent these commands in agent prompts or fall back to ad hoc GraphQL. Until implemented and tested, use the existing narrow commands and record any manual limitation in the Linear comment.

## Hygiene

- Keep one canonical ticket per deliverable and preserve old history with a successor comment before closing a superseded issue.
- `Urgent` means the current backend release gate; `High` means a direct next dependency; UI parity and deferred security integrations remain Medium until the backend spine is green.
- Descriptions must include the backend contract, lifecycle/state model, failure behavior, security invariants, acceptance tests, evidence, dependencies, and non-goals.
- Do not mark a task Done from demo mode, a host-process fallback, mocked provider IDs, fixture-only artifacts, or a passing unit test that never reaches the real provider.
- After implementation, comment with commit SHA, commands, live provider/runtime IDs (non-secret), evidence-chain result, artifact validation, teardown receipt, and remaining limitations.

## Delegation

The main agent remains product manager, architecture owner, integration reviewer, and release-evidence owner. Specialist agents receive bounded tickets only after shared interfaces are approved. Persistence (`ONE-216`) lands its repository/schema contract before runtime lifecycle (`ONE-217`) and event ingestion (`ONE-219`) implement against it. At most two mutating workstreams run concurrently until those foundations stabilize; read-only research and design audits may run wider.

A specialist cannot change another workstream's public contract, introduce frontend-authoritative state, downgrade a real-provider acceptance test to a fixture, or mark an issue Done. Each handoff must identify its issue, changed files/interfaces, migrations/configuration, focused tests, failure/security analysis, limitations, and reproduction commands. The main agent runs the full gate, integrates, commits, and updates Linear.

Contract Freeze v1 establishes the initial implementation order and ownership. `ONE-216` owns the database driver, migrations, Unit of Work, conversation/turn/message authority, and JSON importer. `ONE-217` adds runtime leases and provider operations through the same transaction boundary. `ONE-218` produces fenced Claude/LiteLLM native envelopes. `ONE-219` owns native ingestion, versioned projection, message deltas, quarantine, and cursor-based SSE. `ONE-220` owns the in-microVM renderer and artifact manifest. Shared identifiers or transaction semantics change only through main-agent review and an ADR when cross-cutting.
