# Gap Analysis — ONEVibe vs the market

> Prepared 2026-07-16, sharpened 2026-07-16.
> Source: deep audit of `different-ai/openwork`, full ONEVibe source audit, user brief.

---

## The ONEVibe thesis (sharpened)

ONEVibe is **not** a UI wrapper around a single agent harness. That is what OpenWork built, and it is a strategic trap: you become a distribution channel for one SDK, and you are at the mercy of that SDK's roadmap.

The correct framing:

> **ONEVibe is the meta-layer above harnesses.** The harness — Claude Agent SDK, OpenAI Codex, AWS Bedrock AgentCore, OpenCode, or any future runtime — is a pluggable implementation detail. ONEVibe provides everything else: task lifecycle, conversation history, artifact storage, workspace files, approval governance, MCP routing, team management, billing, and a professional UI that works regardless of which harness is underneath.

The architecture that makes this possible already exists in the codebase: **`server/runtime-adapter.ts`**. The `RuntimeAdapter` interface is the correct abstraction. The problem today is that this abstraction is not enforced strongly enough, not enough adapters are implemented, and no harness capability metadata flows to the UI.

---

## What each competitor chose — and why it limits them

| Product | Harness bet | Limitation |
|---|---|---|
| OpenWork | Locked to `@opencode-ai/sdk` subprocess | When OpenCode stagnates or breaks, OpenWork breaks. Users cannot switch. |
| Claude.ai Projects | Locked to Anthropic's internal runtime | No multi-model, no custom tools, no self-host |
| Cursor / Windsurf | Locked to their own agent loop | Can't delegate to Claude Agent SDK, Codex, or other runtimes |
| AgentCore (AWS) | Locked to Bedrock | AWS dependency; no local, no other clouds |
| **ONEVibe** | **Provider-neutral. Any `RuntimeAdapter` implementation** | **Users pick the best harness. We provide the workspace.** |

---

## The `RuntimeAdapter` contract — the foundation to build on

`server/runtime-adapter.ts` defines the interface every harness must implement. **This is the most important file in the codebase.** Everything else in the plan flows from keeping it clean.

Current adapters (already implemented):
- `ClaudeSdkRuntimeAdapter` — wraps `@anthropic-ai/claude-agent-sdk`
- `OneComputerSandboxRuntimeAdapter` — wraps ONEComputer cloud sandbox
- `DemoRuntimeAdapter` — fake scripted responses
- `RemoteRuntimeAdapter` — delegates to a remote ONEVibe server

Adapters to add (Phase 2):
- `CodexRuntimeAdapter` — wraps OpenAI Codex API
- `AgentCoreRuntimeAdapter` — wraps AWS Bedrock AgentCore
- `E2bRuntimeAdapter` — wraps e2b.dev cloud sandbox (Phase 4)

The contract must be strengthened before new adapters are added. See `plan/02-runtime-abstraction.md`.

---

## What ONEVibe owns that harnesses do not

This is the moat. These are things ONEVibe builds once and every harness benefits from:

| Layer | What ONEVibe provides | What the harness provides |
|---|---|---|
| Task lifecycle | Created → running → paused → completed → failed; retry; cancel | Execute one turn |
| Conversation | Full message history, pagination, search, fork, branch | Generate one response |
| Workspace | Per-task file system, version history, diff viewer, artifact panel | Write files (if supported) |
| Evidence | Append-only event log, hash chain, integrity verification | Nothing |
| Approvals | Wallet-gated approval flow for sensitive actions | Nothing |
| MCP routing | Add MCP servers once; available to every harness that supports tool use | Varies |
| Skills | Markdown skill packs injected as system prompt; harness-agnostic | Nothing |
| Scheduling | Cron-based task automation; runs on any configured harness | Nothing |
| Auth + multi-tenancy | Users, orgs, projects, data isolation | Nothing |
| UI | Conversation pane, workspace panel, library, computers view | Nothing |

---

## Current root causes (10)

### 1. Default provider is `demo`
`DemoRuntimeAdapter` makes zero model calls. Every new user gets fake scripted responses.
**Fix (P1-04)**: Auto-select the best available runtime from `/api/runtime`; show onboarding wall when none configured.

### 2. Backend down = silent white screen
HTML 404 → `JSON.parse` → `SyntaxError` → swallowed → blank app.
**Fix (P1-01)**: Detect backend down; show persistent banner.

### 3. SSE event drop before snapshot loads
Events arriving before `getTask()` resolves are permanently lost.
**Fix (P1-02)**: Buffer pre-snapshot events; replay after snapshot.

### 4. SSE reconnection hammers dead server
No backoff, no cap, no user notification.
**Fix (P1-03)**: Exponential backoff with cap and manual retry.

### 5. `RuntimeAdapter` abstraction leaks
Harness-specific concepts (Claude SDK tool names, ONEComputer sandbox IDs) bleed into `src/types.ts` and UI components. Adding a new harness requires touching the UI.
**Fix (P2-01, P2-04)**: Harden the interface; add capability declaration; UI adapts from capabilities not provider ID.

### 6. Only two real harnesses; no Codex, no AgentCore
Users are effectively limited to Claude SDK and ONEComputer. The multi-harness promise is not delivered.
**Fix (P2-02, P2-03)**: Codex adapter, AgentCore adapter.

### 7. No auth, no user identity
`"Terence"` is hardcoded. All tasks are global. No multi-user.
**Fix (P4-01)**: better-auth with email OTP.

### 8. No deploy path
`server/index.ts` does not serve `dist/`. No Dockerfile.
**Fix (P4-03, P4-04)**: Containerise, deploy.

### 9. No real per-task sandbox
Tools run in the server process. No isolation. No per-task file system.
**Fix (P2-05, P4-05)**: Per-task working directory; e2b sandbox.

### 10. 50 UX dead-ends
Dead controls, hardcoded strings, swallowed errors.
**Fix (Phase 5)**: See full audit table.

---

## Full 50-issue audit

See original table in git history (2026-07-16 first version). Unchanged. Issues #1–8 are critical; #9–20 are high; #21–40 are medium; #41–50 are lower.

---

## OpenWork study notes — what to copy, what to avoid

### Copy
- `session-sync.ts` — per-frame delta coalescing pattern
- `skill-hub.ts` — GitHub-backed skill catalog with TTL cache
- `mcp.ts` — runtime SQLite config (not on-disk JSON)
- `auth.ts` — better-auth plugin configuration
- `den-db/schema/` — Drizzle schema patterns for workers, sandboxes
- Two-tool MCP facade (`search_capabilities` + `execute_capability`) — brilliant context-window optimization

### Do not copy
- **Single-engine architecture**: OpenWork spawns `@opencode-ai/sdk` as a subprocess and talks to nothing else. We do not do this.
- **Electron-first design**: OpenWork's UI assumes a local desktop context. We are cloud-native from day one.
- **`OPENCODE_CONFIG` injection**: Tight coupling between MCP config and one specific engine's startup flags. Our approach: `RuntimeAdapter` receives an `mcpConfigs` array at task init; each adapter handles injection in its own way.

---

## Files to study per phase

| Phase | Files in `/tmp/openwork` |
|---|---|
| P1 Foundation | `apps/app/src/sync/session-sync.ts` (reconnect + backoff), `apps/server/src/server.ts` |
| P2 Runtime | `apps/server/src/` adapter pattern, `apps/server/src/opencode-plugins/` (steering injection) |
| P3 Routing | `apps/server/src/mcp.ts`, `ee/apps/den-api/src/mcp/agent.ts` |
| P4 Cloud | `ee/apps/den-api/src/auth.ts`, `ee/packages/den-db/src/schema/`, `.devcontainer/docker-compose.yml` |
| P5 UI | `apps/app/src/stores/`, `apps/app/src/components/session/`, `apps/app/src/sync/transcript-reconcile.ts` |
| P6 MCP | `apps/server/src/skill-hub.ts`, `ee/apps/den-api/src/mcp/search.ts` |
