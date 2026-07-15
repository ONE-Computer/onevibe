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
