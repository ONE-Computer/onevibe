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
