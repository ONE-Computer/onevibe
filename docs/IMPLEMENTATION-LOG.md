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
