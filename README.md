# ONEVibe

ONEVibe is an open-source governed AI workspace: a Manus-like task, artifact, and preview experience backed by ONEComputer security boundaries.

The first vertical slice already supports:

- natural-language task creation and automatic planning;
- server-owned cancellation that retains partial source and evidence;
- multi-turn follow-up instructions that resume the same task workspace and Claude SDK session;
- a typed Server-Sent Events task timeline;
- activity, tool, artifact, approval, and control lanes;
- a path-confined local workspace with generated files and live preview;
- an append-only SHA-256 evidence chain;
- external-wallet approval requests with no browser approval endpoint;
- a remote runtime adapter compatible with provider-neutral AgentCore SSE;
- a native Claude Agent SDK adapter that retains sanitized SDK messages and session identity;
- an explicitly labelled local demo runtime for development without cloud credentials.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API listens on `127.0.0.1:4311`.

## Runtime modes

- `demo` (default): deterministic local workflow that writes only under `.onevibe/workspaces/<task-id>`.
- `claude_sdk`: native `@anthropic-ai/claude-agent-sdk` execution with a workspace-only Read/Write/Edit/Glob/Grep tool policy. It uses your server-side Claude credentials and never sends them to the browser.
- `remote`: set `ONEVIBE_RUNTIME_URL` to a trusted AgentCore/backend SSE endpoint. The server proxies and normalizes the stream; the browser never receives runtime credentials.

Optional server-side integration variables:

```text
ONEVIBE_RUNTIME_BEARER_TOKEN=...
ONEVIBE_CLAUDE_MODEL=claude-sonnet-5
ONEVIBE_CLAUDE_MAX_TURNS=24
ONEVIBE_CLAUDE_MAX_BUDGET_USD=5
ONECOMPUTER_API_URL=https://onecomputer.example.com
ONECOMPUTER_SERVICE_TOKEN=...
```

With both ONEComputer variables present, remote tasks provision through the real authenticated `POST /v1/sandboxes` route before invoking the runtime. Tokens are never serialized to task events or sent to the browser.

## Security status

This repository is an implementation preview, not a certified sandbox. The local filesystem adapter demonstrates confinement and evidence behavior but does not provide VM/container isolation or network enforcement. Production deployment must attach ONEComputer's real sandbox and Rust gateway plus a real OpenVTC/VTI Wallet.

Read [architecture](docs/ARCHITECTURE.md), [security model](docs/SECURITY.md), and [implementation log](docs/IMPLEMENTATION-LOG.md).
