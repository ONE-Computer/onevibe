# ONEVibe live E2E engineering log

This is the durable failure-and-evidence log for the backend POC. It records observed facts and fixes so future agents do not repeat the same experiments.

## 2026-07-17 — disposable Postgres owner-scoped chat proof

- Applied the reviewed Drizzle migrations through `0005_deep_rachel_grey.sql` to disposable PostgreSQL 18. The expected long-identifier notice from replaying the historical native-projection migration was non-fatal; the migration sequence completed successfully.
- `npm run e2e:postgres-chat` exercised the isolated async repository: owner-bound conversation/task creation, client-request replay without a duplicate user message, assistant persistence with a provider message ID, one durable runtime event, and owner B denial. The run reported two messages, one runtime event, and `ownerIsolation=true` without retaining credentials or model payloads.
- The application still fails closed when `DATABASE_URL` would select Postgres. This is a repository vertical proof, not a claim that the live TaskStore, production migration procedure, microVM boundary, OpenVTC/VTI approval, or model provider path has switched.

## 2026-07-17 — protected LiteLLM provider gate and SDK workspace-path compatibility

- The host-only LiteLLM relay advertised the configured `claude-sonnet-5` alias and received the Claude-compatible `/v1/messages` traffic. No direct first-party Anthropic endpoint or credential was used.
- `npm run e2e:chat` passed through LiteLLM: chat `task_efedfbc7faf944` produced two durable turns, 8 live SSE frames and 39 replay frames, artifact task `task_a982a5e4f8e343` produced a Markdown artifact and bounded Bash evidence, the API restart recovered history, the failure/retry probe recovered to `completed`, and all evidence chains validated. Boundary: `executionBoundary=host_process`.
- The first protected skills run exposed a stale harness expectation (`provider_turn_workspace` vs the canonical `adapter_owned` event contract). After correcting the harness, `npm run e2e:skills` passed with `task_6c89fa28f7364c`, selected `document` and `security_review` packs, immutable manifest/restart proof, selected-only internal files, permission invariance, valid evidence, and no external writes.
- A real provider document run exposed the underlying SDK path issue: native file hooks received relative paths canonicalized against the parent process. The bounded normalization fix maps only process-cwd-relative paths back into the task workspace and rejects everything else. The follow-up document run completed all required document artifacts through LiteLLM.
- `npm run e2e:claude-slides` passed against a temporary LiteLLM-configured API: 8 slides, `deck.pptx` (34,990 bytes), `deck.pdf` (7,546 bytes), and valid evidence. The harness now asserts that `.claude/skills/*` remains hidden from the public file route rather than attempting to read runtime internals through that route.
- None of these host-process runs prove ONEComputer, microVM, OpenVTC/VTI, or production egress enforcement. Browser evidence remains unavailable because the in-app browser runtime reported no available browser.

## 2026-07-16 — handover baseline and failure-path slice

- The current checkout is `699fe22` with the handover roadmap as the governing plan. Baseline `npm run check` passed with 37 test files and 207 tests before the slice.
- The first foundation patch now proves typed handling for an HTML SPA fallback and structured JSON HTTP error responses. The post-change gate passes with 38 test files and 209 tests, lint, build, and E2E harness typecheck.
- A dedicated browser tab could not connect to the isolated Vite QA port in this environment (`ERR_CONNECTION_REFUSED`); browser acceptance remains open and is not claimed from the unit/build gate.
- Model-routing policy is explicit: every model request must use the protected LiteLLM route. Direct first-party Anthropic access is not an accepted release path. No secret or provider payload was recorded.
- P1-02 is now implemented and unit-tested. The browser hook keeps an in-memory pre-snapshot buffer only as a transport handoff; the server-owned SQLite/SSE ledger remains authoritative and no browser transcript is persisted.
- P1-03 is now implemented and unit-tested. Reconnect attempts are bounded and delayed; this is client transport behavior and does not claim multi-worker SSE or provider-process recovery.
- P1-04/P1-05/P1-06 smoke evidence: the dev check correctly reported no governed runtime with empty configuration and detected LiteLLM when only relay variables were provided; the production server served the built SPA at `/` and a task route while keeping `/api/runtime` JSON. No secret values were retained.
- Phase 2 capability metadata is covered by runtime-readiness tests: Claude declares streaming/tool/file capabilities but not computer use; ONEComputer declares sandboxed/computer-use only for its configured provider. The UI consumes these declarations for optional workspace surfaces.

## 2026-07-16 — browser caught internal skill files and thinking telemetry leakage

- A browser reload of real chat task `task_4e120a8439f240` exposed two presentation defects: internal `.claude/skills` guides inflated the portable-artifact count to 2, and five `Claude SDK · thinking tokens` records appeared in both the assistant trace and Activity rail.
- The fix keeps skill materialization runtime-private, filters internal workspace paths from snapshots/Files/Library/direct file access, and removes thinking-token telemetry from user-facing operational projections. The provider's hidden reasoning remains intentionally unavailable.
- After reload, the same task displayed 0 portable artifacts, only bounded project/skill/run lifecycle evidence, and no browser console errors. The old deterministic history entry is visibly labelled `Simulation · no model call`.
- Post-fix live rerun: chat `task_4ec98deee76e41`, demo `task_a01f60f606c349`, artifact/Bash `task_9ea262fa183949`; 23 live SSE frames, 46 replay frames, two chat turns, one bounded Bash call, valid evidence, and restart recovery.

## 2026-07-16 — isolated local Claude chat and terminal acceptance gate

- `npm run e2e:chat` passed against an isolated temporary API/data root and the protected local LiteLLM route. The harness uses an explicit `claude-sonnet-5` alias because the raw handover alias is not accepted by this router.
- Safe evidence: chat `task_51d0f590186c49`, demo `task_18883e55f8f544`, artifact/Bash `task_61e96e4a3c514c`; 8 live SSE frames, 36 replay frames, 2 chat turns, 2 Bash calls, valid evidence, and restart recovery.
- The chat route remained conversational: no plan, files, artifacts, approval, or synthetic artifact response. The artifact route produced Markdown and surfaced bounded `pwd`/`wc` terminal evidence.
- Boundary and limitation: `executionBoundary=host_process`. The run does not prove microVM isolation, ONEComputer policy enforcement, OpenVTC approval, or default-deny production egress.

## 2026-07-16 — Azure ONEComputer + sandbox Claude

### Allocation lifecycle

The first upgraded harness attempt received HTTP 504 from `POST /v1/sandboxes` without a sandbox ID. ONEVibe fenced the lease as `unknown` and did not retry. Azure was running a deployment branch without the async lifecycle repair.

The focused provider repair was promoted to Azure. A controlled probe then returned a persisted `provisioning` ID in seven seconds and accepted DELETE with HTTP 204 during bootstrap.

### Bootstrap readiness

The single-sandbox GET route bypassed persisted status and mapped “Docker container running” to `bootstrapped=true`. ONEVibe launched before Claude existed and observed exit 127. The endpoint now merges the persisted lifecycle record exactly like list responses; a regression test holds state at `provisioning` even if raw Docker state says started.

The provider also installed Claude Desktop before the headless CLI in one fail-fast chain and ignored the install result. Claude Code installation is now required and terminal on failure; Desktop is optional and disabled by default unless `ONECOMPUTER_INSTALL_CLAUDE_DESKTOP=true`.

### Process launch

The managed CLI lives under `/opt/node22/bin` and `/home/kasm-user/.npm-global/bin`; ONEVibe now adds those paths explicitly.

A background child could lose its temporary prompt before reading it. ONEVibe now passes the prompt through stdin and deletes the temporary file after Claude exits but before artifact enumeration.

### Model transport

The handover relay URL was host-loopback and unreachable from the sandbox. The POC now uses the scoped public sandbox relay endpoint. The development sandbox inherited a MITM proxy whose CA was rejected by Claude for that endpoint. With `gatewayEnforced=false`, only the configured relay hostname is appended to `NO_PROXY`; TLS verification remains enabled. Attested gateway mode receives no bypass.

### First real Claude success

Task `task_f4e8bb67f44144` completed a real Claude turn inside sandbox `onevibe-67f44144` through the scoped public relay. It persisted a Claude session bound to lease generation 1, streamed assistant and tool events, extracted files, and retained the sandbox until explicit release.

The deck gate failed: the sandbox lacked `python-pptx`/PDF libraries, package installation hit the development proxy certificate, and only `outline.md` plus control files were delivered. This proves ONE-218's execution spine partially but leaves ONE-220/221 open.

### Security findings

- Provider response bodies were projected into a failure event; commit `f603a69` now emits only operation and HTTP status.
- Claude requested Bash despite an intended file-tool allowlist. `--allowedTools` is an approval control, not a capability-removal mechanism. Do not claim Bash is unavailable until the command uses a true tool-availability restriction and a negative test proves it.
- Current Kasm remains a development sandbox with known production-isolation gaps tracked separately.

### Next acceptance steps

1. Provide a deterministic slide renderer inside the sandbox image or via a governed sandbox-local tool; do not rely on live package installation.
2. Restrict available Claude tools explicitly and test Bash absence for modes that do not require it.
3. Complete two turns in the same sandbox/session and a second conversation in a distinct sandbox.
4. Validate real PPTX/PDF magic bytes, transcript restart, evidence chain, and explicit cleanup.
5. Run credential/workspace/event/export residue scans.

### Deterministic deck runtime follow-up

The next POC slice bakes `pptxgenjs` and `pdf-lib` into the ONEComputer headless Claude bootstrap and verifies both modules before a sandbox may become ready. Slide jobs receive `NODE_PATH` for those managed modules and are instructed to produce a fixed six-file deliverable contract without installing packages at task time.

Tool governance now distinguishes availability from approval. ONEVibe passes the same mode-specific list to Claude's `--tools` and `--allowedTools`: ordinary modes retain only path-confined file/search tools, while Slide mode additionally receives Bash solely to run the preinstalled renderer. This still requires a live negative test proving Bash is absent outside Slide mode and a real deck run proving the expected binary signatures.

The first post-deployment rerun proved that the local API process was still the pre-change binary; its command journal lacked `NODE_PATH` and `--tools`, so that trial was rejected and its sandbox removed. Restarting from committed code then exposed a legacy-import collision: old conversations reuse identifiers such as `legacy_message_0`, while the relational message primary key is global. Migration now derives message IDs from the conversation ID plus original legacy ID, preserving deterministic reruns and same-conversation duplicate detection without cross-conversation collisions.

A fresh committed-code run proved the Slide-only tool list and managed Node modules live, but Claude spent early turns probing Python and attempting a forbidden package install before it could author the deck. The task exited successfully with a failed validation report and no deck. The runtime also mislabeled the server-supplied sandbox relay as `sandbox_preconfigured`; transport evidence now derives from the actual sandbox relay URL.

Deck generation is therefore no longer entrusted to model-authored binary tooling. ONEVibe materializes an eight-slide structured seed and a versioned server-controlled renderer into the task workspace; after Claude finishes, ONEVibe executes that renderer inside the same retained sandbox, signature-checks PPTX/PDF there, and only then extracts artifacts. Claude may improve `outline.json`, but cannot redefine the binary renderer. This preserves sandbox-origin bytes while removing live installs and model-compliance variance.

The first managed-renderer run produced all six required files and independently showed an eight-slide PPTX with `PK` magic plus an eight-page `%PDF-1.7` export. The post-agent enforcement invocation nevertheless failed because provider exec shells do not inherit the managed Node PATH. The renderer now uses the absolute `/opt/node22/bin/node` path; the failed task was retained only long enough to capture this evidence and must be explicitly released before rerun.

Task `task_8d95ae8dc37b4e` then completed the corrected sandbox deck gate through the server-controlled LiteLLM route. It extracted `deck.pptx` (105,879 bytes), `deck.pdf` (5,327 bytes), `outline.json`, `speaker-notes.md`, `index.html`, `README.md`, and a passing validation report; the timeline includes the managed-renderer receipt. Its retained sandbox was explicitly released after inspection.

This is not yet the whole ONE-221 gate. The full harness intentionally failed on missing X11 evidence because live visual capture was disabled after Azure returned HTTP 404 for `POST /v1/sandboxes/:id/visual/start`. Same-conversation continuation, distinct second-conversation allocation, restart verification, and the visual route still require one combined passing run.

### Combined POC gate passed

The visual 404 was a deployment-history defect: the local integration branch contained the headless X11 commit, but the selectively curated Azure branch did not. After promoting that commit, the route became reachable and exposed a provider mismatch: Kasm already runs Xvnc on `:1` at 1024×768, while the generic helper required Xvfb and assumed 1440×900. The provider now reuses an existing display, detects its geometry, treats Chromium launch as optional, and captures ffmpeg frames at the observed dimensions. An authenticated probe returned a valid PNG and cleaned up its sandbox.

The complete harness then passed:

- primary task: `task_dda313c34b5a49`
- separate task: `task_298413c5d5da4e`
- primary/continuation sandbox: `onevibe-c34b5a49`
- separate-conversation sandbox: `onevibe-c5d5da4e`
- same conversation reused its sandbox and Claude session
- separate conversation received a distinct sandbox
- Slide PPTX/PDF and structured companion artifacts passed
- LiteLLM routing and evidence-chain verification passed
- 21 immutable visual frames were present on the continued task
- both retained leases returned `released`

Gateway attestation remained disabled, so this proves the development-provider POC contract rather than production microVM isolation. Two follow-up defects were observed: concurrent periodic/tool-adjacent ffmpeg captures sometimes fail, and task status can become `completed` before final visual/run bookkeeping is appended. Neither invalidated this harness, but both should be corrected before treating status as a strict synchronization barrier.

The apparent completion-order concern was disproved by run IDs and timestamps: each turn's `run_completed` preceded the next turn's `run_started`. The real remaining visual issue was concurrent ffmpeg capture from the periodic loop and tool checkpoints. ONEVibe now serializes all capture requests through one per-task promise chain, drains that chain before completion/failure, and treats a successfully initialized display as screenshot-ready even if optional Chromium CDP is unavailable. This hardening is unit/build verified and awaits the next live regression run.

The first post-serialization task exposed a separate provider race: geometry discovery ran under `pipefail` using `xdpyinfo | awk '... exit'`; early awk exit could SIGPIPE `xdpyinfo`, producing exit 141 before ffmpeg started. Geometry extraction now consumes the complete display response. After deployment, an authenticated fresh-sandbox probe started visual runtime, returned two consecutive valid PNG screenshots, and deleted the sandbox (`200`, `200`, `200`, `204`). A later full agent task should still verify zero capture-failure timeline events under mixed periodic/tool load.

### Restart, residue, and cancellation gates

The two-phase restart audit captured completed task `task_dda313c34b5a49`, stopped the ONEVibe API, restarted it against the same data directory, and verified identical transcript and evidence digests. The evidence chain remained valid and named credential-residue detectors found zero matches across the API snapshot, messages, and bounded task artifacts. The audit stores only digests and detector/source names, never matched text.

The real-provider cancellation harness allocated sandbox `onevibe-32279349` for task `task_ca163e32279349`, cancelled while execution was active, observed the durable `run_cancelled` event, explicitly released the fenced lease, and verified final sandbox state `destroyed` plus release evidence. This proves the controlled cancellation/teardown path rather than merely mocking an abort.
# 2026-07-16 — task stream suffix replay and tool projection

- A live local request against the persisted Azure E2E task resumed from event 180 and returned exactly event 181, proving suffix-only replay from `Last-Event-ID`.
- A cursor from another task returned HTTP 400 rather than replaying or crossing conversation boundaries.
- The persisted slide-generation conversation rendered paired Bash invocations as assistant-ui tool cards in both dark and light themes while retaining the separate ONEComputer evidence/artifact rail.
- The cards showed the ONEComputer sandbox execution route, input field names, bounded command-result excerpts, completed state, and measured duration. Raw input values were not projected into chat.

# 2026-07-16 — governed follow-up attachment and mobile QA

- Local two-turn demo task `task_49a8df50067749` completed with four durable messages. The second turn accepted `brief follow-up.txt`, normalized it to `inputs/01-brief_follow-up.txt`, retained 18 bytes with the expected content, and emitted one task-input artifact event bound to the second turn's run ID.
- Browser reload projected the normalized file and size onto the correct user message, exposed assistant-ui copy and attach actions, and retained the working composer.
- Initial 390×844 QA found the sidebar covered the task and its only collapse control was unreachable beneath the overlay. After correction, mobile loads with `Open sidebar`, preserves task/composer/attachment content, and the sidebar can be opened and closed through a reachable in-panel control.
- QA also exposed that the previous collapsed grid left the main shell in a zero-width first column. The collapsed layout now uses a single content column; visual recheck rendered the task plan and workspace at full mobile width.
- `npm run e2e:follow-up-attachment` repeated the full proof on `task_b24af8e6372648`: four messages, 18-byte normalized input, exact second-turn evidence binding, and byte-stable file retrieval. A five-file turn was rejected with HTTP 400 before staging.

# 2026-07-16 — turn-bound artifact projection

- Fresh local Slide-mode task `task_74b90c21359848` produced one completed turn with individual durable events for `outline.json`, `speaker-notes.md`, `deck.pptx`, `deck.pdf`, and the `index.html` preview.
- Browser QA found one inline download action each for PPTX and PDF, with all five artifacts bound to the creating assistant message. The Computer rail continued to render the slide preview independently.
- Desktop light-theme inspection showed the message/tool/preview composition without duplicated transcript state. At 390×844, the download actions remained present and the responsive sidebar could be closed through its in-panel control. The viewport was reset after inspection.
- This local run validates projection and interaction only. The ONEComputer per-file extraction contract is covered by focused adapter tests; a future live cloud run should prove those new events against real sandbox-origin deck bytes.

# 2026-07-16 — real Claude Agent SDK through LiteLLM

- Started an isolated ONEVibe API on port `4320` with a temporary data root and the protected host-only LiteLLM relay. The public `claude-sonnet-5` alias currently routes first to GLM 5.2, so this run is recorded as a Claude-compatible SDK contract proof, not an Anthropic-model proof.
- `task_70015c14c3674b` completed the Slides harness with eight slides, a 107,159-byte PPTX, a 7,797-byte PDF, and a valid evidence chain.
- Started a second isolated API on port `4321` using the explicit `openrouter-claude-fallback` alias. `task_10bde8499e7143` completed two durable Claude SDK turns with a recorded session identity and valid evidence. `task_727657769e344a` completed the Slides harness with eight slides, a 107,155-byte PPTX, a 7,817-byte PDF, and a valid evidence chain.
- The fallback route is still an OpenRouter-hosted Claude-compatible provider, not a direct Anthropic or Bedrock attestation. Direct model/account attestation remains a deployment/provider gate.
- The run exposed and fixed a delivery hygiene defect: Claude SDK extraction previously classified `.claude/skills/*` as user artifacts. Portable artifact filtering now excludes runtime skill directories and `.onevibe-*` files while classifying PPTX/PDF as `slide_deck` and attaching same-task download URIs.
- Post-fix rerun `task_119eafe5afdb4e` completed through the same explicit Claude fallback alias: eight slides, 107,033-byte PPTX, 7,679-byte PDF, valid evidence, no `.claude/*` artifact events, and `slide_deck` classification on both exports.

# 2026-07-16 — Azure ONEComputer retained-conversation regression

- A fresh isolated API on port `4322` created primary task `task_5b571f5004fa48` in sandbox `onevibe-5004fa48`. The task completed through the development Kasm provider with `executionBoundary=onecomputer_sandbox`, `claudeTransport=litellm`, `gatewayEnforced=false`, `visualRuntimeReady=true`, 21 visual-frame events, sandbox-origin `deck.pptx`/`deck.pdf`, and a valid evidence chain.
- The provider returned valid `started`/`bootstrapped`/`desktopReady` state for the next sandbox `onevibe-b4861b43`, but the local ONEVibe task remained at `provisioning` after its first state observation. A direct provider probe showed the sandbox had in fact reached `started`; this indicates a local poller/instance observation race or stale runtime process, not a provider readiness failure.
- The second task `task_a954e8b4861b43` was cancelled and its retained lease was explicitly released. The primary sandbox was also released. The Azure provider list returned only the two pre-existing sandbox records (`onevibe-fababc49`, `onevibe-a2385b44`), so this run left no disposable sandboxes behind.
- This run is deliberately recorded as a regression/partial gate: it does not claim the full same-conversation continuation plus distinct-conversation isolation harness passed. The next fix should make provider polling and API-instance identity observable, then rerun the combined harness with `ONEVIBE_E2E_REQUIRE_GATEWAY=false` explicitly labelled as development-provider evidence.

# 2026-07-16 — Azure combined harness: route and command-poll findings

- Three isolated API attempts separated configuration from runtime failures. `task_af2fc6857e6348` used the provider's preconfigured Claude path and failed with `/login`; `task_593f718d205b4f` used an unsupported sandbox model alias and failed with an explicit LiteLLM `Invalid model name`; both sandboxes were released immediately.
- With the VM-supported `claude-granola-5-2` alias and the protected sandbox LiteLLM relay, `task_d38770be3e8d4c` completed its first turn in sandbox `onevibe-be3e8d4c`: `deck.pptx` 106,040 bytes, `deck.pdf` 5,603 bytes, valid `PK`/`%PDF-` signatures, 8-slide outline, 119 visual-frame events at the time of teardown, and a valid evidence chain. The task emitted `run_completed` before the continuation, proving the first turn's artifact gate.
- The follow-up emitted `ONEComputer retained sandbox resumed` and reused the same provider sandbox/lease generation. Its sandbox contained `.onevibe-exitcode=0`, but a local event-journal `exec` request remained hung while the visual loop continued. The harness was cancelled and the retained lease explicitly released; no disposable sandbox remained in the provider list.
- The adapter now bounds sandbox `exec` requests to 30 seconds and retries transient event-journal poll failures within the existing task deadline, recording a non-sensitive `ONEComputer agent poll retry` event. The timeout race covers both response headers and JSON body parsing; an earlier version only bounded `fetch()` and could still hang while parsing a chunked provider body. This is covered by a focused test alongside the status-poll retry test. A fresh combined run is still required to prove continuation completion and distinct-conversation isolation after this change.
- The live harness now opens `/api/tasks/:id/events` while the ONEComputer task runs, requires durable `runtime_event` frames with task-bound IDs, and reconnects with `Last-Event-ID` to require suffix-only replay. This makes native SSE delivery an explicit acceptance gate alongside snapshot polling; the next passing run must report live and replay frame counts.

# 2026-07-16 — truthful chat and bounded host-process Bash proof

- `task_45213c6170d243` completed a real `claude_sdk` chat turn through the configured LiteLLM route. The task returned streamed assistant deltas, one durable completed assistant message, no plan, no files, no artifact validation, and no approval request.
- `task_1673149f0bcd41` intentionally exposed the prior generic-artifact defect: Claude created a valid Markdown file and ran Bash, but the task failed because `index.html` was incorrectly mandatory. That failure is retained as regression evidence.
- `task_f8d51a10de4f4d` passed after the fix: Claude created `NOTES.md`, ran `wc -c NOTES.md`, emitted paired Bash tool events, produced `artifact-manifest.json` and `validation-report.json`, and completed with five of five plan steps.
- The first live Bash attempt also exposed that the SDK’s default settings can auto-allow built-in tools without invoking the interactive permission callback. A `PreToolUse` enforcement hook was added; a malicious absolute-path/shell-composition attempt was denied in the live ledger, while safe workspace-relative `ls`/`wc` commands completed.
- Browser QA now opens the Computer inspector for tool-backed tasks, shows the Bash command/result and generated file evidence beside the conversation, redacts host paths, and labels the route `Claude host policy · no gateway`. The assistant thread shows a compact operational trace; low-signal provider stream events and the duplicate raw runtime checkpoint list are removed from the default view.
- This is local host-process proof (`executionBoundary=host_process`), not proof of ONEComputer microVM isolation or production gateway enforcement.

# 2026-07-16 — Azure allocation-receipt promotion and authenticated E2E gate

- Promoted the provider allocation-receipt implementation onto the Azure deployment branch as commit `4ff7533`. The deployment applied migration `20260716150000_add_sandbox_allocation_operations`, rebuilt the web and gateway components, restarted the services, and reported active web, gateway, and LiteLLM bridge units. Public `/v1/health` returned HTTP 200.
- Focused provider verification passed on the VM: API/database type checks, formatting, and the sandbox allocation/operation tests (7 tests). The deployment is source/runtime evidence for the receipt contract, not proof of timeout/replay recovery with a live sandbox.
- A fresh ONEVibe API on port 4313 attempted the real-provider harness with visual evidence and LiteLLM requirements enabled. Runtime readiness reported `claude_agent_sdk` and `onecomputer` available, but `POST /v1/sandboxes` returned HTTP 401 before a provider sandbox identity was issued. The run therefore produced no sandbox, no artifact, and no live/replay SSE evidence; it was stopped without weakening the auth boundary.
- The remaining gate is to configure a valid server-side ONEComputer project credential (or the documented development-auth mechanism) for ONEVibe's provider client, then rerun the combined conversation/SSE/visual/slides/release harness. Do not use an arbitrary placeholder token and do not mark ONE-221 Done from the prior development-provider pass.

## 2026-07-16 — combined ONEComputer + Claude + SSE gate passed

- Fresh isolated API run passed with primary task `task_f53b06f25cf740` and separate task `task_84878cf22c6f40`.
- Primary/continuation sandbox `onevibe-f25cf740` booted as `kasm-local`, ran Claude Agent SDK through the VM-supported `claude-granola-5-2` LiteLLM route, and reused the same sandbox and lease generation across both turns. A separate conversation received `onevibe-f22c6f40`.
- The harness reported `sseLiveFrames=4`, `sseReplayFrames=60`, and `sseSuffixOnly=true`. This proves the task event stream delivered durable `runtime_event` frames during the run and resumed strictly after `Last-Event-ID`; it is no longer inferred from snapshot polling.
- Both turns produced sandbox-origin slide exports, including 105,827-byte/5,260-byte and 105,984-byte/5,462-byte PPTX/PDF pairs, valid signatures, visual evidence, and a valid evidence chain. The harness reported 102 continued-task visual frames, `litellmRouted=true`, `sameConversationReused=true`, `conversationsIsolated=true`, and cleanup `released/released`.
- The provider list after cleanup contained only the two pre-existing records (`onevibe-fababc49`, `onevibe-a2385b44`). `gatewayEnforced=false` remains an explicit development Kasm limitation; this is a POC E2E pass, not production microVM attestation.
- 2026-07-16: a fresh Azure-backed ONEComputer run (`task_a5cb7fd37c8944`, provider sandbox `onevibe-d37c8944`) reached `provisioning` → `started`, initialized the headless X11 runtime, and emitted `agentRuntime=claude_agent_sdk` before execution. It then failed closed at the sandbox worker preflight because the deployed image had Claude Code but no `@anthropic-ai/claude-agent-sdk` module. This is the required image/bootstrap gap; no CLI fallback was used. The source-side ONEComputer bootstrap now installs and verifies the pinned SDK package, but that provider change must be deployed before repeating the combined E2E gate.
- 2026-07-16: after Azure source commit `6dfaa3b` rebuilt the Next bundle and the Kasm bootstrap began installing/verifying `@anthropic-ai/claude-agent-sdk@0.3.210`, the strict SDK-first repeat passed. Tasks `task_ecea838cae564f` / `task_c47f8f393bf24b` reported `sdkRuntime=true`, `litellmRouted=true`, 4 live SSE frames, 35 suffix-only replay frames, same-conversation reuse, distinct sandbox isolation, 6 visual frames, a valid evidence chain, and explicit release of both leases. This closes the development SDK+SSE+PPTX proof; gateway attestation remains false and the provider is still development Kasm rather than production microVM evidence.
- The repository deploy wrapper itself could not rebuild on the Azure VM because its non-interactive PATH has neither `pnpm` nor `cargo`; its rollback-safe health path preserved active services. With the already-installed Node/Next dependencies, the web bundle was rebuilt directly via `/opt/node22/bin/node node_modules/next/dist/bin/next build`, then `onecomputer-web.service` was restarted and `/v1/health` returned 200. The deploy wrapper needs a separate toolchain-preflight/bootstrapping fix before it is used as unattended CI/CD evidence.

# 2026-07-16 — final authenticated development-provider E2E pass

- The provider authentication gate was resolved without weakening the API: ONEVibe used a pre-provisioned server-side project key already present in the Azure control-plane database. The key value was held only in process environment; it was not printed, committed, sent to the browser, or written into task evidence.
- The sandbox-reachable LiteLLM route required the VM Docker bridge address `172.17.0.1:47821`; `host.docker.internal` resolved but returned an empty response from inside the Kasm container. The local coordinator was restarted with the explicit bridge address and the existing server-only LiteLLM credential.
- Final command: `ONEVIBE_E2E_URL=http://127.0.0.1:4313 ONEVIBE_E2E_MODE=slides ONEVIBE_E2E_REQUIRE_GATEWAY=false ONEVIBE_E2E_REQUIRE_VISUAL=true ONEVIBE_E2E_REQUIRE_LITELLM=true npm run e2e:onecomputer`.
- Result: primary task `task_30236182861f43` / sandbox `onevibe-82861f43`; separate task `task_9e70682f63eb40` / sandbox `onevibe-2f63eb40`; same-conversation reuse and distinct-conversation isolation; `sdkRuntime=true`; `litellmRouted=true`; `sseLiveFrames=4`; `sseReplayFrames=31`; `sseSuffixOnly=true`; `visualEvidence=6`; `evidenceValid=true`; cleanup `released/released`.
- The primary sandbox produced sandbox-origin `deck.pptx` (105,984 bytes, `PK` signature) and `deck.pdf` (5,461 bytes, `%PDF-` signature). The evidence chain endpoint returned `valid=true`.
- An authenticated provider reconciliation after the harness returned zero sandbox rows. One stale sandbox from an interrupted earlier run was found outside the temporary ONEVibe data directory and removed through the authenticated `DELETE` route with HTTP 204; the final provider list was then empty.
- Two harness/runtime hardening fixes were required: SSE reader cancellation is now non-blocking with a bounded per-read deadline, and sandbox extraction filters ephemeral `.claude/`, `.claude-state/`, and `.onevibe-*` paths before fetching files. Focused sandbox/artifact tests passed (7 tests); `npm run check:e2e-harness` passed.
- Boundary: `gatewayEnforced=false` and provider `kasm-local` remain explicit. This closes the development-provider conversation/SSE/visual/PPTX POC, not production microVM attestation, default-deny egress, short-lived secret injection, API restart/failure-injection acceptance, or OpenVTC approval enforcement.

# 2026-07-16 — controlled allocation recovery slice (source-level)

- ONEComputer provider commit `6323e88` adds a deliberately opt-in,
  non-production-only response-failure hook. With both test flags enabled, the
  first allocation persists its sandbox and completed receipt, starts
  asynchronous bootstrap, then returns one generic 504. It is disabled when
  `NODE_ENV=production` and reflects no provider diagnostics.
- ONEVibe commit `fd2b060` records the durable lease as `sandboxState=unknown`,
  emits a bounded immutable-identity recovery event, and adds
  `npm run e2e:onecomputer-recovery`. The harness expects the first turn to
  fail, a follow-up to reconcile the exact allocation identity without a
  duplicate create, completion in the recovered sandbox, and explicit release.
- Provider route tests (4/4), API typecheck/lint, and the full ONEVibe check
  (33 test files / 174 tests, build, and harness typecheck) pass. The live
  Azure recovery run remains open until the hook is deployed temporarily in a
  development environment, the harness passes, and both flags are removed.

# 2026-07-16 — Azure-lineage clean export

- Reconciled the recovery slice onto the actual Azure deployment lineage and
  validated the combined branch with 10 focused provider tests, API
  typecheck, and changed-file lint. The assembled commits are `a107f8e`,
  `48bbd09`, and `1e9807a`.
- Published a new single-commit GitHub export at
  `codex/azure-allocation-recovery-clean` (`db489d7`). The export removes the
  historical sensitive audit artifact and replaces it with a public-safe audit
  boundary note; the original Gitea/Azure branch and its history are unchanged.
- GitHub push protection accepted the export. It is reviewable source, not live
  deployment evidence: the Azure VM still needs an authorized Gitea promotion,
  temporary development-only test flags, a passing recovery harness, and
  explicit flag removal afterward.
# 2026-07-16 — local golden flow

- Added and ran `npm run e2e:golden` against an isolated temporary ONEVibe API/data root.
- Passing result: primary `task_b6b320da756747` and separate `task_e81422d4ca1541`; Claude SDK routed through LiteLLM with explicit model alias `claude-sonnet-5`, two durable turns, 5 live SSE frames, 75 suffix-only replay frames, valid evidence, API restart recovery, and task/global/conversation search recovery.
- The first configuration attempt used the handover file's raw `LITELLM_MODEL` (`claude-sonnet-4-5`) and failed with the router's model validation error. No credential values or raw provider bodies were retained.
- Boundary: host-process local proof; no ONEComputer, microVM, OpenVTC/VTI Wallet, gateway-attestation, or production egress claim.

# 2026-07-16 — local Claude chat, artifact, and retry gate

- The protected LiteLLM run used an isolated temporary API/data root and the explicit `claude-sonnet-5` route. Chat task `task_b47dcbab442345` completed two durable turns with 31 live SSE frames and 80 suffix-replayed frames; the Markdown/Bash task `task_ce7415292df54c` completed with two bounded Bash calls and a valid evidence chain; API restart recovered the persisted transcript and search index.
- The failure-injection subprobe `task_4c1e953f5c4d40` started with an intentionally invalid model alias, recorded a durable `run_failed` with `provider_execution_failure`, stopped the API, restarted against the same SQLite directory with the valid model, retried using an idempotency key, and completed with a valid evidence chain.
- The first attempt exposed a genuine classification defect: adapter failures before a provider terminal result were recorded with an empty failure payload. The generic execution catch now records only bounded metadata (`executionRoute=runtime_adapter`, `failureReason=provider_execution_failure`, `retryable=true`); provider bodies and credentials are not written to evidence.
- This is host-process local LiteLLM/Claude-compatible evidence. It does not prove ONEComputer microVM isolation, OpenVTC/VTI Wallet enforcement, production gateway attestation, or egress controls.

# 2026-07-16 — assistant-ui Markdown and two-pane browser pass

- After adding the assistant-ui Markdown renderer and `ThreadPrimitive.Viewport`/`ViewportFooter`, the protected local gate passed again: chat `task_405cf74de87149`, artifact/Bash `task_fa55cfeaa2b444`, 8 live SSE frames, 35 suffix replay frames, one bounded Bash call, API restart recovery, and retry probe `task_1efc9fd354fa43` with valid evidence.
- Browser QA at the effective 1139px viewport showed a 624px conversation beside a 500px Computer inspector, with `wc -c NOTES.md` and `333 NOTES.md` visible in the paired terminal card. Opening the history rail switched to the narrower handoff path without horizontal overflow.
- The provider route remains intermittent: one immediate rerun attempt failed with bounded `provider_execution_failure`, then the completed rerun passed. This is retained as reliability evidence, not hidden by retrying silently.
