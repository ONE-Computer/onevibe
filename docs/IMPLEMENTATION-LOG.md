# Implementation log

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
- Added seven persisted creation modes with mode-specific plans. Slides now produce an eight-slide outline, speaker notes, isolated interactive viewer, and valid PPTX; Website/App/Game produce React-TypeScript-Vite scaffolds; Research and Design retain evidence/rationale artifacts.
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
- Added first-class Document and Data-story creation modes. Documents produce portable Markdown plus structured metadata; data stories produce CSV, analysis metadata, and an inspectable visual preview. Both participate in the same evidence and validation path as existing modes.
- Added durable plan-step timing. Running/completed/blocked transitions persist timestamps, emit ordered evidence, and render elapsed duration; terminal task events remain last in the event chain.
