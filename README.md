# ONEVibe

[![Verify ONEVibe](https://github.com/ONE-Computer/onevibe/actions/workflows/ci.yml/badge.svg)](https://github.com/ONE-Computer/onevibe/actions/workflows/ci.yml)

ONEVibe is an open-source governed AI workspace: a Manus-like task, artifact, and preview experience backed by ONEComputer security boundaries.

The first vertical slice already supports:

- natural-language task creation and automatic planning;
- server-owned cancellation that retains partial source and evidence;
- multi-turn follow-up instructions that resume the same task workspace and Claude SDK session;
- immutable workspace version history and evidence-recorded restore;
- mode-specific Website, Slides, Documents, Research, Data stories, Design, App, and Game workflows, including native PPTX generation;
- per-task static artifact validation reports for generated previews, portable app scaffolds, slide decks, research manifests, and design tokens;
- embedded source editing with diff review, optimistic concurrency, version snapshot, and evidence recording;
- first-class waiting-for-user requests that resume the parked Claude tool call or demo execution;
- externally approved, capability-based read-only sharing with signed local wallet receipts;
- durable multi-turn chat history with streaming state, pagination, cross-task search, migration, and export;
- durable project workspaces with a governed background brief that is attached server-side to each new agent run;
- persistent schedules (15-minute minimum) that create ordinary project-bound tasks with the same evidence and approval controls;
- on-demand dispatch for enabled schedules, recorded as a manual schedule trigger in task evidence;
- up to eight user-supplied website references per task, preserved as untrusted context without server-side fetching;
- up to four local task attachments (256 KiB each, 1 MiB total), path-confined under `inputs/` and exposed to agents as untrusted workspace input;
- a typed Server-Sent Events task timeline;
- durable plan-step lifecycle timing, including elapsed duration in the task plan and evidence-backed transitions;
- a Manus-inspired **Computer** panel that records and scrubs agent terminal activity, visual frames, previews, and produced files beside the conversation;
- activity, tool, artifact, approval, and control lanes;
- a path-confined local workspace with generated files and live preview;
- an append-only SHA-256 evidence chain;
- external-wallet approval requests with no browser approval endpoint;
- a remote runtime adapter compatible with provider-neutral AgentCore SSE;
- a native Claude Agent SDK adapter that retains sanitized SDK messages and session identity;
- an explicitly labelled local demo runtime for development without cloud credentials.

## Try the governed flow locally

1. Run `npm install && npm run dev`, then open `http://localhost:5173`.
2. Create a **Safe demo** task from a starter (for example, an Operations dashboard or Executive update). The task writes portable source, a preview, an evidence chain, and a static validation report.
3. Open **Computer** to scrub commands, artifacts, and any captured visual evidence; use **Observe** for task-scoped execution facts.
4. For a completed task, open **Handoff** to download the source/evidence archive and inspect the safe GitHub review sequence. The browser never creates a repository or uses GitHub credentials.
5. Create a schedule and use **Run now** to dispatch it through the normal governed task path. The created task records whether its trigger was scheduled or manual.
6. To exercise the external approval boundary, set `ONEVIBE_WALLET_TOKEN`, request a share, then use the separate wallet CLI below. The browser only displays the pending or resolved receipt; it cannot decide the action.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API listens on `127.0.0.1:4311`.

## Runtime modes

- `demo` (default): deterministic local workflow that writes only under `.onevibe/workspaces/<task-id>`.
- `claude_sdk`: native `@anthropic-ai/claude-agent-sdk` execution with a workspace-only Read/Write/Edit/Glob/Grep tool policy. It uses your server-side Claude credentials and never sends them to the browser.
- `onecomputer`: provisions an authenticated ONEComputer sandbox, runs Claude inside it, extracts at most 100 files/10 MiB, and destroys the sandbox after delivery by default. Set `ONECOMPUTER_RETAIN_SANDBOX=true` only when persistence is intentional; only an explicitly retained, still-active sandbox may be reused for a follow-up turn.
- `remote`: set `ONEVIBE_RUNTIME_URL` to a trusted AgentCore/backend SSE endpoint. The server proxies and normalizes the stream; the browser never receives runtime credentials.

Optional server-side integration variables:

```text
ONEVIBE_RUNTIME_BEARER_TOKEN=...
ONEVIBE_CLAUDE_MODEL=claude-sonnet-5
ONEVIBE_CLAUDE_MAX_TURNS=24
ONEVIBE_CLAUDE_MAX_BUDGET_USD=5
ONEVIBE_WALLET_TOKEN=use-a-long-random-local-wallet-secret
ONECOMPUTER_API_URL=https://onecomputer.example.com
ONECOMPUTER_SERVICE_TOKEN=oc_...  # server-side ONEComputer project or organization API key
ONECOMPUTER_PROJECT_ID=...        # required when the key is organization-scoped
ONECOMPUTER_GATEWAY_ENFORCED=false
ONECOMPUTER_RETAIN_SANDBOX=false
ONECOMPUTER_VISUAL_RUNTIME=true
```

With the ONEComputer URL and API key present, the `onecomputer` runtime uses the real authenticated create, poll, exec, and delete sandbox routes. If the API key is organization-scoped, also set `ONECOMPUTER_PROJECT_ID`; the server sends it only as the ONEComputer `X-Project-Id` request header. Tokens and project keys are never serialized to task events or sent to the browser. `ONECOMPUTER_GATEWAY_ENFORCED` defaults to false and must only be enabled after the deployed sandbox's egress path has been independently verified.

When `ONECOMPUTER_VISUAL_RUNTIME` is enabled (the default), ONEVibe asks the sandbox service to start a headless X11 runtime and records a PNG visual frame as task evidence. The browser receives only an authenticated, server-proxied screenshot; it never receives X11, VNC, Chrome DevTools, or sandbox credentials. This is designed for an attested microVM runtime, not as a claim that the local demo or any existing container provider is a microVM.

The browser can request a share but cannot approve one. In local development, operate the separate wallet CLI from another terminal:

```bash
npm run wallet -- list
npm run wallet -- approve <approval-id>
npm run wallet -- deny <approval-id>
```

Set `ONEVIBE_WALLET_TOKEN` in both API and wallet CLI environments. Production replaces this local bearer/HMAC bridge with OpenVTC/VTI Wallet asymmetric proof verification.

## Security status

This repository is an implementation preview, not a certified sandbox. The local filesystem adapter demonstrates confinement and evidence behavior but does not provide VM/container isolation or network enforcement. Production deployment must attach ONEComputer's real sandbox and Rust gateway plus a real OpenVTC/VTI Wallet.

Read [architecture](docs/ARCHITECTURE.md), [security model](docs/SECURITY.md), and [implementation log](docs/IMPLEMENTATION-LOG.md).
