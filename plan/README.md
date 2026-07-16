# ONEVibe Transformation Plan

> Written 2026-07-16. Benchmark: [different-ai/openwork](https://github.com/different-ai/openwork).
> North star: cloud-native AI workspace on par with OpenWork.

## Files

| File | Contents |
|---|---|
| `00-gap-analysis.md` | Full comparison: ONEVibe vs OpenWork. 10 root causes. Full 50-issue audit table. OpenWork files to study per phase. |
| `01-foundation.md` | Phase 1 — Fix the backend-down crash, SSE event drop, reconnect backoff, demo-default, deploy path. Detailed code snippets. |
| `02-agent-runtime.md` | Phase 2 — Tool execution, delta coalescing, draft queuing, fork/edit, `waiting_for_user_input` UX, file browser, approval panel. |
| `03-cloud-architecture.md` | Phase 3 — better-auth (OTP), PostgreSQL + Drizzle, Docker, Railway deploy, e2b sandbox, multi-tenancy schema. |
| `04-ui-overhaul.md` | Phase 4 — Zustand stores, TanStack Query, toast system, all 50 UX issue fixes. |
| `05-mcp-extensions.md` | Phase 5 — MCP config management, skill marketplace, two-tool facade, agent context diagnostics. |

## How to hand off to an agent

The agent should:
1. Read `../TODO.md` first — that is the task list with checkbox items
2. Read this README for orientation
3. Read the relevant phase plan file before starting each phase
4. Check `00-gap-analysis.md` to understand the full issue set
5. Study the referenced OpenWork files in `/tmp/openwork` before implementing each phase (re-clone if needed: `git clone https://github.com/different-ai/openwork /tmp/openwork`)
6. Run `npm run check` after every task — must stay green

## Phase sequence

```
Phase 1 (foundation) → Phase 2 (agent) → Phase 3 (cloud) → Phase 4 (UI) → Phase 5 (MCP)
```

Phases 1 and 4 can be partially parallelised (P4-20, P4-18, P4-11 are simple fixes that don't depend on Phase 2 or 3). Everything else is sequential.

## Release gate

`npm run check` = `oxlint src server scripts` + `vitest run` (207 tests) + `tsc -b` + `tsc -p tsconfig.server.json` + `vite build` + `tsc e2e-harness check`

Never mark a task done until this passes.
