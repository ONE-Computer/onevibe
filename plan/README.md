# ONEVibe Transformation Plan

> Written 2026-07-16. Sharpened 2026-07-16.
> North star: provider-neutral cloud AI workspace — a meta-layer above agent harnesses.

---

## The thesis in one sentence

ONEVibe is not a wrapper around any single agent SDK. It is the **meta-layer above all of them**: task lifecycle, conversation history, artifact storage, workspace files, approval governance, MCP routing, team management, and a professional UI that works identically regardless of whether the harness underneath is Claude Agent SDK, OpenAI Codex, AWS AgentCore, or something that ships next year.

The abstraction that makes this possible: **`server/runtime-adapter.ts`**. Everything in this plan either strengthens that boundary or improves what lives above it.

---

## Phase files

| File | Phase | Contents |
|---|---|---|
| `00-gap-analysis.md` | — | Competitive analysis, ONEVibe thesis, `RuntimeAdapter` design, 10 root causes, 50-issue audit, OpenWork study notes (what to copy, what to avoid) |
| `01-foundation.md` | P1 | Fix backend-down crash, SSE event drop, reconnect backoff, demo default, deploy path. **Start here.** |
| `02-runtime-abstraction.md` | P2 | Harden `RuntimeAdapter` interface, add Codex adapter, add AgentCore adapter, capability declaration, per-task working directory, delta coalescing, draft queue, fork/edit |
| `03-runtime-routing.md` | P3 | `RuntimeRegistry`, mode-aware routing suggestions, rich provider picker UI, health dashboard, fallback chain, `ONEVIBE_DEFAULT_PROVIDER`, runtime-neutral event schema |
| `04-cloud-infrastructure.md` | P4 | better-auth, PostgreSQL/Drizzle, Docker, Railway/Fly.io deploy, e2b sandbox, multi-tenancy |
| `05-ui-overhaul.md` | P5 | Zustand stores, TanStack Query, toast system, all 50 UX dead-end fixes |
| `06-mcp-extensions.md` | P6 | MCP config management, skill marketplace, two-tool facade, diagnostics |

---

## Phase sequence

```
P1 (foundation) → P2 (runtime abstraction) → P3 (routing) → P4 (cloud) → P5 (UI) → P6 (MCP)
```

P5 UI fixes (P5-10 through P5-13, the simple label/accessibility fixes) can run in parallel with any phase. Everything else is sequential — each phase builds on the previous.

---

## Rules for the implementing agent

1. **Read `00-gap-analysis.md` first.** Understand the thesis before touching any code.
2. **Read the relevant phase file before starting each phase.** Do not improvise architecture.
3. **`npm run check` must stay green after every task.** No exceptions. This is the release gate: `oxlint` + `vitest` (207 tests) + `tsc -b` + `tsc -p tsconfig.server.json` + `vite build` + e2e harness typecheck.
4. **Never branch on `provider === 'claude_sdk'` in UI components.** Use `capabilities.includes(...)` instead. This is the single most important anti-pattern to avoid.
5. **The `RuntimeAdapter` interface is the boundary.** Harness-specific types live inside adapters. `server/types.ts` and `src/types.ts` must not contain harness-specific fields.
6. **Study OpenWork before each phase** (re-clone if needed: `git clone https://github.com/different-ai/openwork /tmp/openwork`). Copy patterns; do not copy architecture.
7. **Update `ARCHITECTURE.md` in the same commit as every structural change.**

---

## What ONEVibe owns vs what the harness owns

```
┌─────────────────────────────────────────────────────────────────┐
│                         ONEVibe                                  │
│                                                                  │
│  Auth · Multi-tenancy · Task lifecycle · Conversation history    │
│  Artifact storage · Workspace files · Evidence chain             │
│  Approval governance · MCP routing · Skill packs                 │
│  Scheduling · Library · Professional UI                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              RuntimeAdapter interface                    │    │
│  └────────┬──────────┬──────────┬──────────┬──────────────┘    │
│           │          │          │          │                     │
│  ┌────────▼──┐ ┌─────▼──┐ ┌────▼───┐ ┌───▼──────────┐        │
│  │ Claude    │ │ OpenAI │ │  AWS   │ │ Future       │        │
│  │ Agent SDK │ │ Codex  │ │ Agent  │ │ harness      │        │
│  │           │ │        │ │ Core   │ │              │        │
│  └───────────┘ └────────┘ └────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

Harnesses will improve. They will be replaced. ONEVibe must outlast all of them.
