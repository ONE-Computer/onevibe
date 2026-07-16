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
