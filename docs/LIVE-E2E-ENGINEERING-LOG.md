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

