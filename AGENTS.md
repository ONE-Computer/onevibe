# ONEVibe engineering guidance

ONEVibe is an open-source, Manus-like agent workspace built as a thin product layer over ONEComputer security controls and provider-neutral agent runtimes.

## Non-negotiable boundaries

1. The web UI may request and display an approval. It must never be the approval authority.
2. Sensitive actions require an external OpenVTC/VTI Wallet proof bound to the exact actor, task, action, target, limits, and expiry.
3. Do not implement custom cryptography, wallet key storage, or DIDComm. Integrate vetted OpenVTC packages and services at explicit adapters.
4. Demo mode must be labelled. A simulated event, fixture, or UI state is not security evidence.
5. Preserve provider-native events, then normalize into one durable task timeline. Never add a second frontend-only event stream.
6. Every state-changing operation must emit an append-only evidence event. Do not record secrets, tokens, prompt credentials, or raw sensitive payloads.
7. Workspaces are path-confined and disposable. Runtime credentials are broker-custodied and never written into the agent filesystem.
8. Network egress is default-deny in the target architecture; local demo mode must display that it is not a network containment boundary.
9. Keep the project standalone. ONEComputer and AgentCore are accessed through versioned HTTP/event adapters, never absolute sibling imports.
10. Document architecture and security decisions in `docs/` in the same commit as implementation.

## Verification

- `npm run check` is the minimum local gate.
- UI work must be inspected in the browser at desktop and mobile widths.
- A feature is complete only when its real enforcement path is exercised; otherwise call it a demo, adapter, preview, or contract.

## Linear execution board

Linear is the source of truth for ONEVibe delivery. Use the dedicated project:

- Project: **ONEVibe — Backend E2E & Manus Parity**
- URL: https://linear.app/onecomputer/project/onevibe-backend-e2e-and-manus-parity-ff4554221471
- Active epic: `ONE-215`

The release-critical dependency order is `ONE-216` conversation persistence → `ONE-217` conversation-scoped microVM → `ONE-218` Claude/LiteLLM inside the microVM → `ONE-219` durable event streaming → `ONE-220` sandbox PPTX/PDF → `ONE-221` real-provider E2E. `ONE-222` hardening can proceed alongside the later backend slices. UX (`ONE-223`) and OpenVTC approval integration (`ONE-224`) must not displace this backend gate.

Read `docs/LINEAR-BOARD.md` before changing issue state or scope. The API credential is read only into a shell variable from `../handover/onecomputer-handover-secrets-lean/mac/linear-api-key.txt`; never print, commit, paste, or place it in a URL. Keep one major epic In Progress and attach exact commit/test/provider evidence in issue comments after material slices.

## Durable engineering memory

Documentation is part of every material slice. Update `docs/IMPLEMENTATION-LOG.md` for shipped behavior and `docs/LIVE-E2E-ENGINEERING-LOG.md` for live observations, failed experiments, provider/runtime IDs that are safe to retain, fixes, and remaining gates. Architecture or credential decisions receive a dedicated document/ADR; do not leave them only in chat or Linear comments. Keep secrets, account IDs, raw provider bodies, auth headers, and credential values out of all docs.

For AWS/Bedrock runtime work, read `docs/AGENTCORE-AWS-RUNTIME.md` and the referenced files in `/Users/gini/Desktop/agentcore-claude-codex-runtime-harness`. Reuse the standard refreshable AWS provider-chain pattern and explicit Bedrock configuration. Never mount `~/.aws`, copy profile credentials, or place static `AWS_*` values in a retained sandbox.

## Frontend foundation

Use `assistant-ui` as the preferred foundation for ONEVibe conversation threads, streaming messages, composer, history navigation, accessible message actions, and tool-state rendering. Preserve ONEComputer's bespoke dark/light visual system and custom evidence/artifact rail rather than forcing those surfaces into generic chat components. Any adoption must bind to the real server transcript/SSE contracts; demo arrays or browser-authoritative history are prohibited.

Read `docs/ASSISTANT-UI-ARCHITECTURE.md` before changing the conversation surface. Use `useExternalStoreRuntime`: SQLite/API/SSE own history and run state, while assistant-ui only projects messages and submits continuations. Do not add a browser-owned queue, optimistic durable transcript, or duplicate transcript in `TaskTimeline`. Provider state belongs in the task/evidence surfaces, and approvals remain outside the chat framework.

## Sandbox artifact dependencies

Artifact tooling required by an acceptance gate must be image/bootstrap managed and verified before the runtime reports ready. Never make a live agent install packages through the development proxy. Keep Claude's `--tools` availability mode-specific and use `--allowedTools` only as the separate approval layer; adding an approval allowlist does not remove a tool. Slide mode may receive a narrowly documented shell capability to invoke preinstalled renderers, while ordinary conversation modes must not.

For legacy persistence migrations, assume identifiers were only unique inside one task directory. Derive globally unique durable IDs from conversation identity plus the original local ID, keep the transformation deterministic, and retain duplicate rejection inside a single conversation.

For binary acceptance artifacts, prefer a versioned server-controlled renderer executed inside the sandbox. Let the agent author bounded structured content, but do not depend on it to install libraries, invent a renderer, or self-report binary validity. Record the renderer identity and verify signatures before extraction.

Keep capability gates separable in live diagnostics. A backend/artifact proof may run with visual capture disabled when the provider route is unavailable, but it must be labeled partial and must not close the combined E2E ticket; preserve the exact provider failure and require a later run with visual evidence enabled.

Azure is a curated branch assembled from focused patches, not proof that every local ancestor exists remotely. Before diagnosing a missing deployed route as a build-cache issue, use `git merge-base --is-ancestor <commit> HEAD` on the Azure checkout. Promote the owning commit explicitly, run its focused tests, rebuild the Next bundle, restart the service, and prove the route with an authenticated create/use/delete probe.

Do not run concurrent ffmpeg/X11 screenshot commands against one sandbox display. Serialize periodic and event-caused captures per task, preserve the causal event ID on queued captures, and drain the queue before emitting terminal run state.

Under shell `pipefail`, do not discover X11 geometry with a consumer that exits before `xdpyinfo` finishes; the producer may receive SIGPIPE and turn a valid display into exit 141. Consume the full output, validate the resulting `WIDTHxHEIGHT`, then launch ffmpeg.

Use `npm run e2e:restart-audit -- capture <task-id>` before an API restart and `verify` afterward. The same `ONEVIBE_DATA_DIR` must be used on both sides. The gate requires byte-stable transcript/evidence digests, a valid evidence chain, no active run, and zero named credential-residue detectors; findings report detector and source only, never matched secret text.

Use `npm run e2e:onecomputer-cancel` for the real-provider abort gate. It must wait for a provider sandbox identity, cancel the active run, require durable cancellation evidence, release the fenced lease, and verify both `destroyed` state and release evidence. A cancelled task with a retained or unknown lease is not a passing teardown proof.
