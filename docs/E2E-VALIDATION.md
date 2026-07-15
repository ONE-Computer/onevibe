# Local E2E validation

Date: 2026-07-15

## Browser journey exercised

1. Opened the local app at `http://localhost:5173` in Codex Browser.
2. Verified the Manus-like home shell, project/task navigation, runtime selector, prompt composer, and security posture labels.
3. Started the synthetic task “Build a secure customer briefing workspace”.
4. Observed live SSE updates through all five plan steps.
5. Verified normalized transcript, activity, tool, artifact, approval, and control events.
6. Verified generated `index.html`, `manifest.json`, and `README.md` in the task-confined workspace.
7. Opened the static preview in a scriptless, permission-denied iframe.
8. Verified the approval card offers only an external `openvtc://` wallet link; no approve/deny browser action exists.
9. Verified the task completed safely while public publication remained withheld.
10. Verified the local evidence chain reports valid and exposes ordered event hashes.
11. Found and fixed a late-file-selection bug in the code viewer, then reloaded and confirmed `index.html` opens correctly.

## Evidence

- [Home screen](evidence/2026-07-15-onevibe-home.jpg)
- [Completed task and preview](evidence/2026-07-15-onevibe-task.jpg)

## Automated gates

- `oxlint src server`
- two Vitest security/store tests
- frontend and server TypeScript checks
- Vite production build

## Honest limitations

- Local demo mode is a process plus path confinement, not a VM/container sandbox.
- The remote AgentCore adapter is implemented but was not invoked because no runtime endpoint was configured for this local run.
- The ONEComputer production sandbox/gateway adapter and real VTI Wallet callback remain the next integration slice.
- Responsive CSS is implemented; desktop layout was visually verified in Codex Browser. A dedicated mobile viewport automation control was not available in this browser pass.
