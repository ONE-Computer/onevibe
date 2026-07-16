# ONEVibe — Agent Handover Document

> **Date**: 2026-07-16
> **Status**: Roadmap written, cosmetic UX inherited, Phase 1 foundation work in progress. P1-01/P1-07 have an implementation slice; browser acceptance remains open.
> **For**: The next agent (or human) picking this up cold.
> **Read this entire document before touching any code.**

---

## 1. What ONEVibe is (the sharpened thesis)

ONEVibe is a **cloud-native AI workspace that is a provider-neutral meta-layer above agent harnesses**.

Users pick which harness runs their task — Claude Agent SDK, OpenAI Codex, AWS Bedrock AgentCore, or any future runtime. ONEVibe provides everything above the harness: task lifecycle, conversation history, artifact storage, workspace files, approval governance, MCP routing, team management, and a professional UI that works regardless of which harness is underneath.

**ONEVibe is not a wrapper around a single SDK.** This is the most important architectural principle. OpenWork (the closest open-source equivalent, `github.com/different-ai/openwork`) locked onto `@opencode-ai/sdk` as its sole engine. When that engine stagnates or a better one ships, OpenWork is stuck. We do not make that mistake.

**Harnesses will always improve. Our users must be free to use the best one at any time.**

### Mandatory model-routing policy

Every model request in every environment — including Claude, Codex, AgentCore, and future harnesses — must traverse the server-controlled **LiteLLM** boundary. This is a deliberate data-sovereignty, routing, cost, and optimization decision. The Claude Agent SDK may remain the selected harness, but it must receive a LiteLLM-compatible `ANTHROPIC_BASE_URL`, a server-injected relay credential, and an explicit router model alias. In that configuration, the SDK's Anthropic-compatible variables point only to LiteLLM; they must never contain a first-party Anthropic endpoint or credential. Direct first-party Anthropic API traffic is not an accepted fallback or release path. Any legacy direct-Anthropic branch in the codebase is a hardening gap and must be removed or fail closed before a provider path is called production-ready.

The abstraction that enforces this: `server/runtime-adapter.ts` — the `RuntimeAdapter` interface. Every harness is an implementation. This file is the most important file in the codebase. Strengthen it; never work around it.

---

## 2. Current state of the codebase

### What exists and works

| Component | File(s) | State |
|---|---|---|
| React SPA | `src/` | Real — Vite, React 19, `@assistant-ui/react`, framer-motion |
| API server | `server/index.ts` (745 lines) | Real — hand-rolled Node HTTP, port 4311 |
| RuntimeAdapter interface | `server/runtime-adapter.ts` | Real — the correct abstraction |
| Claude SDK adapter | `server/claude-sdk-runner.ts` (373 lines) | Real — wraps `@anthropic-ai/claude-agent-sdk` |
| ONEComputer adapter | `server/onecomputer-sandbox-runner.ts` (830 lines) | Real — wraps ONEComputer cloud sandbox |
| Demo adapter | `server/demo-runner.ts` (172 lines) | Fake — scripted responses, zero model calls |
| Task store | `server/store.ts` (1255 lines) + `server/persistence/` | Real — SQLite via `better-sqlite3` |
| SSE streaming | `server/task-event-stream.ts` | Real |
| Approval service | `server/wallet-approval-service.ts` | Real — wallet-gated approvals |
| UI — cosmetic | `src/index.css`, `src/components/*` | Done — Claude-calibrated light mode, Inter font, cream palette |
| Tests | `server/*.test.ts`, `src/components/*.test.ts` | 207 tests passing |

### What is critically broken

1. **Default provider is `demo`** — every new user gets fake scripted responses, not Claude
2. **Backend down = silent blank screen** — when `server/index.ts` isn't running, all API calls silently fail with no error message
3. **SSE event drop** — `useTask.ts:52` drops events that arrive before the initial REST snapshot loads
4. **No auth** — `"Terence"` is hardcoded in `Sidebar.tsx:174`; all tasks are global
5. **No deploy path** — `server/index.ts` doesn't serve `dist/`; no Dockerfile; no cloud deploy config
6. **50 UX dead-ends** — dead controls, swallowed errors, fake data in display — full list in `plan/00-gap-analysis.md`

### How to run it locally

```bash
# Requires Node 22+, npm
cp .env.example .env       # configure the protected LiteLLM relay
npm install
npm run dev                # starts BOTH server (port 4311) AND Vite (port 5173)
```

Vite proxies `/api/*` to `http://127.0.0.1:4311`. If only `npm run dev:web` is run (not `npm run dev`), every API call silently fails.

Do not configure a direct Anthropic API key as a substitute for the relay. Local provider proof must use the protected host-only LiteLLM environment documented in `AGENTS.md` and the handover files outside this repository.

### Release gate — must stay green after every change

```bash
npm run check
# = oxlint src server scripts
# + vitest run (207 tests)
# + tsc -b
# + tsc -p tsconfig.server.json
# + vite build
# + tsc e2e-harness check (scripts/)
```

**Never mark a task done until this passes.**

---

## 3. The benchmark: OpenWork

We did a deep study of `github.com/different-ai/openwork`. Clone it for reference:
```bash
git clone https://github.com/different-ai/openwork /tmp/openwork
```

### What OpenWork does well (copy these patterns)

| Pattern | OpenWork file | What to adopt |
|---|---|---|
| Per-frame SSE delta coalescing | `apps/app/src/sync/session-sync.ts` | Prevents per-token React re-renders |
| GitHub-backed skill catalog with TTL cache | `apps/server/src/skill-hub.ts` | Skill marketplace pattern |
| Runtime SQLite MCP config (not on-disk JSON) | `apps/server/src/mcp.ts` | Avoids race conditions |
| better-auth plugin configuration | `ee/apps/den-api/src/auth.ts` | Auth setup |
| Two-tool MCP facade | `ee/apps/den-api/src/mcp/agent.ts` | `search_capabilities` + `execute_capability` reduces context waste |
| Drizzle ORM schemas | `ee/packages/den-db/src/schema/` | Schema patterns for workers, sandboxes |

### What OpenWork got wrong (do not copy)

| Decision | Why it's wrong for ONEVibe |
|---|---|
| Single engine: spawns `@opencode-ai/sdk` subprocess | Locked to one SDK; no multi-harness |
| Electron-first desktop design | We are cloud-native |
| `OPENCODE_CONFIG` env-var injection for MCP | Tight coupling to one engine's startup flags |

---

## 4. Architecture diagram

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
│  │              server/runtime-adapter.ts                   │    │
│  └────────┬──────────┬──────────┬──────────┬──────────────┘    │
│           │          │          │          │                     │
│  ┌────────▼──┐ ┌─────▼──┐ ┌────▼───┐ ┌───▼──────────┐         │
│  │ Claude    │ │ OpenAI │ │  AWS   │ │ Future       │         │
│  │ Agent SDK │ │ Codex  │ │ Agent  │ │ harness      │         │
│  │ (exists)  │ │ (P2-02)│ │ Core   │ │ (one file)   │         │
│  └───────────┘ └────────┘ │ (P2-03)│ └──────────────┘         │
│                            └────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

**The single most important anti-pattern to avoid:**
```tsx
// WRONG — leaks harness identity into UI:
{snapshot.provider === 'claude_sdk' && <FilesTab />}

// CORRECT — driven by capability declaration:
{selectedProvider.capabilities.includes('file_system') && <FilesTab />}
```

Every adapter declares `capabilities: RuntimeCapability[]`. The UI reads capabilities, not provider IDs. Adding a new harness never requires UI changes.

---

## 5. The TODO — what needs to be done

Full task list: `TODO.md`. Summary:

### Phase 1 — Stop the bleeding (start here)
**8 tasks. Target: real Claude Q&A works, no silent failures.**

- Fix backend-down silent failure (`P1-01`)
- Fix SSE event drop in `useTask.ts:52` (`P1-02`)
- Add SSE reconnect backoff (`P1-03`)
- Auto-select best available provider, not demo (`P1-04`)
- Add `scripts/dev-check.ts` env validation (`P1-05`)
- Serve `dist/` from `server/index.ts` for production (`P1-06`)
- Typed `ApiError` class with HTTP status (`P1-07`)
- Permanent demo-mode banner in conversation pane (`P1-08`)

### Phase 2 — Harden the runtime abstraction
**10 tasks. Target: Codex and AgentCore work as real providers; capabilities drive UI.**

- Audit and harden `RuntimeAdapter` interface (`P2-01`)
- Add `CodexRuntimeAdapter` — OpenAI Codex (`P2-02`)
- Add `AgentCoreRuntimeAdapter` — AWS Bedrock (`P2-03`)
- Add capability declaration per adapter (`P2-04`)
- Per-task working directory (`P2-05`)
- Per-frame delta coalescing in `useTask.ts` (`P2-06`)
- Draft queuing while agent is running (`P2-07`)
- Fork/edit-message (`P2-08`)
- Fix `waiting_for_user_input` UX (`P2-09`)
- Approval panel above composer (`P2-10`)

### Phase 3 — Runtime routing layer
**7 tasks. Target: informed harness selection; mode-aware suggestions; health dashboard.**

- `RuntimeRegistry` server-side discovery + health checks (`P3-01`)
- Mode → provider routing suggestions (`P3-02`)
- Rich provider picker UI with capability badges (`P3-03`)
- Runtime health dashboard in Settings (`P3-04`)
- Runtime fallback chain (user-prompted, never automatic) (`P3-05`)
- `ONEVIBE_DEFAULT_PROVIDER` env var (`P3-06`)
- Runtime-neutral `RuntimeEvent` schema audit (`P3-07`)

### Phase 4 — Cloud infrastructure
**6 tasks. Target: deployed, authenticated, multi-user.**

- `better-auth` with email OTP; replace hardcoded `"Terence"` (`P4-01`)
- PostgreSQL + Drizzle ORM (`P4-02`)
- Dockerfile + docker-compose (`P4-03`)
- Railway or Fly.io deploy (`P4-04`)
- e2b.dev cloud sandbox as `E2bRuntimeAdapter` (`P4-05`)
- Multi-tenancy: orgs + projects (`P4-06`)

### Phase 5 — Professional UI
**13 tasks. Target: no dead controls, no hardcoded strings, Zustand + TanStack Query.**
(See `plan/05-ui-overhaul.md` for details)

### Phase 6 — MCP + extensions
**4 tasks. Target: users add MCP servers; skill marketplace works.**
(See `plan/06-mcp-extensions.md` for details)

---

## 6. Key files — what they do

### Frontend (`src/`)

| File | What it does |
|---|---|
| `src/App.tsx` | Root component. 17 useState calls — needs Zustand migration (P5-01). Contains all navigation, task creation, snapshot subscription |
| `src/hooks/useTask.ts` | SSE streaming hook. Has the event-drop bug (P1-02) and hammer-reconnect bug (P1-03) |
| `src/lib/api.ts` | All HTTP calls to the server. `parse()` at line 32 needs typed `ApiError` (P1-07) |
| `src/types.ts` | Shared TypeScript types. `Task['provider']` union needs widening; `RuntimeProviderState` needs `capabilities` field (P2-04) |
| `src/components/PromptComposer.tsx` | Composer. Has `queueable` prop already; needs real draft queue (P2-07) |
| `src/components/AssistantThread.tsx` | Conversation rendering via `@assistant-ui/react`. Has duplicate typing indicator bug (P5-13) |
| `src/components/Workspace.tsx` | Right-panel workspace. 287 lines. Has forever-spinner, broken image, UUID display bugs |
| `src/components/Sidebar.tsx` | Left sidebar. Has hardcoded `"Terence"`, dead `<Settings2>` icons, hardcoded `8` badge |

### Backend (`server/`)

| File | What it does |
|---|---|
| `server/runtime-adapter.ts` | **The most important file.** The interface all harnesses implement |
| `server/index.ts` | Main HTTP server (745 lines). Registers all routes. Does not serve `dist/` (P1-06) |
| `server/claude-sdk-runner.ts` | Claude Agent SDK adapter (373 lines). Real, working |
| `server/onecomputer-sandbox-runner.ts` | ONEComputer adapter (830 lines). Real, working when credentials set |
| `server/demo-runner.ts` | Fake demo adapter (172 lines). Zero model calls |
| `server/store.ts` | Task persistence (1255 lines). SQLite via `better-sqlite3`. Needs Postgres migration (P4-02) |
| `server/runtime-readiness.ts` | Reports which providers are available. Needs `capabilities` field (P2-04) |
| `server/skill-packs.ts` | Hardcoded skill catalog. Needs GitHub-backed marketplace (P6-02) |

---

## 7. Environment variables

```bash
# Required: all model traffic goes through this server-controlled relay.
ONEVIBE_LITELLM_URL=http://127.0.0.1:4100
ONEVIBE_LITELLM_API_KEY=
ONEVIBE_LITELLM_MODEL=claude-sonnet-5

# Optional operator-selected runtime default (demo, claude_sdk, onecomputer, remote)
ONEVIBE_DEFAULT_PROVIDER=

# Optional Codex-compatible model alias; it is still routed through LiteLLM.
ONEVIBE_CODEX_MODEL=

# ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY are derived for the child SDK
# process from the relay configuration; do not use a direct first-party key.

# Required for ONEComputer sandbox
ONECOMPUTER_API_URL=https://...
ONECOMPUTER_SERVICE_TOKEN=oc_...
ONECOMPUTER_PROJECT_ID=proj_...

# To add (Phase 2): Codex
OPENAI_API_KEY=sk-...

# To add (Phase 2): AgentCore
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-2
AGENTCORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:...

# To add (Phase 3): runtime default
ONEVIBE_DEFAULT_PROVIDER=claude_sdk

# To add (Phase 4): auth + database + sandbox
BETTER_AUTH_SECRET=
RESEND_API_KEY=
DATABASE_URL=postgres://...
E2B_API_KEY=

# Server config
ONEVIBE_API_PORT=4311     # default
ONEVIBE_TRUSTED_ORIGINS=http://localhost:5173
```

---

## 8. What the previous session did (UX work)

15 phases of cosmetic UX work are complete and committed. The app looks good. The cosmetic work must not be regressed. Summary:

- **Typography**: IBM Plex Mono / all monospace fonts purged everywhere. Inter only.
- **Theme**: Light mode default (`#faf9f5` cream canvas, `#2b2b28` text, `#c96442` terracotta accent). Dark mode still available via toggle.
- **Home**: Single greeting ("Good evening, Terence.") + composer + 3 ghost suggestion chips. No rotating placeholders. No decorative animations.
- **Composer**: Static "How can I help you today?" placeholder. Quiet 1px border. Dark send button.
- **Sidebar**: Plain text conversation rows grouped by date. No mode icons. No timestamps in light mode.
- **Motion**: All decorative animations neutralized. Only functional transitions remain (page entry, sidebar).
- **Evidence**: All commits in `git log` from `2dfc749` to `ec659e9`.

The cosmetic work is **not a regression risk** — it is in `src/index.css` as scoped `[data-theme=light]` overrides. Functional changes do not touch CSS unless they add new components.

---

## 9. Things the previous session got wrong (do not repeat)

1. **Don't use OpenWork as the north star for architecture.** Use it as a source of implementation patterns only. We are not building a desktop app that wraps one SDK.
2. **Don't leak provider identity into UI components.** Every `provider === 'claude_sdk'` branch in a component is a bug.
3. **Don't accept demo mode as "working".** It is a test harness, not a product feature. The first thing a new user should see is real Claude.
4. **Don't add decorative animations.** The user explicitly rejected them twice. "The motion is too cheesy."
5. **Don't use serif, monospace, or `ui-monospace` fonts anywhere.** The typography contract is Inter / `ui-sans-serif` / `system-ui` only.

---

## 10. Handoff checklist for the next agent

Before writing a single line of code:

- [ ] Read this document in full
- [ ] Read `TODO.md` — understand the full task list and phase structure
- [ ] Read `plan/00-gap-analysis.md` — understand the 10 root causes and 50 UX issues
- [ ] Read `plan/README.md` — understand the architecture diagram and phase rules
- [ ] Run `npm run dev` locally, confirm the app starts
- [ ] Run `npm run check`, confirm it passes (207 tests green)
- [ ] Open `http://localhost:5173`, confirm the UI loads in light mode
- [ ] Read `server/runtime-adapter.ts` — understand the interface before adding any adapter
- [ ] If implementing Phase 2+: clone `/tmp/openwork` and read the relevant files listed in `plan/00-gap-analysis.md` section 6

Start with **P1-01** (backend-down banner). Do not skip ahead. Each phase depends on the previous.
