# ONEVibe live E2E engineering log

This is the durable failure-and-evidence log for the backend POC. It records observed facts and fixes so future agents do not repeat the same experiments.

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
