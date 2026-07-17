# ONEVibe — Agent Handover Document

> **Date**: 2026-07-17
> **Status**: Local phases 1–3 are implemented and the professional UI has crossed the Zustand and ordinary-collection TanStack Query boundaries. Governed MCP declarations, bounded MCP health probing, a tested opt-in MCP capability facade, truthful demo skill status, a GitHub-catalog skill marketplace with protected Claude/LiteLLM materialization evidence, feature-gated Better Auth, authenticated owner scoping, a local organization-membership scaffold, and a reviewed Drizzle/Postgres import proof (including organization/member staging) are present. The running server can opt into the owner-scoped Postgres TaskStore and matching Better Auth database; authenticated two-process HTTP SSE, separate liveness/readiness endpoints, graceful shutdown, representative backup/restore, a migration-first Fly.io deployment contract, browser evidence, a durable follow-up operation journal, controlled crash recovery, durable execution leases with heartbeat renewal, stable ONEVibe/provider correlation identities, explicit provider-unknown acknowledgment, and transactional durable attachment reservations are now proven or statically validated locally. LiteLLM-only enforcement remains mandatory for every harness and every environment: data sovereignty, centralized routing, cost control, and model optimization are product requirements. TaskStore turn reservation now reuses replayed durable turns/message pairs across SQLite/Postgres and does not reactivate terminal turns; centralized private-path filtering keeps attachments/evidence out of public file lists, direct reads/edits, and portable exports. The follow-up journal resumes prepared operations after restart, safely reclaims operations that had not reached the provider boundary, re-materializes attachment bytes from the durable reservation ledger, and fails closed when a provider request was durably marked started but its external outcome is unknown. The staged-file/task-metadata boundary is now proven recoverable and idempotent under failure injection, but it is not one cross-store transaction. Remaining P4 gaps are provider-side idempotency, production broker/secret/PITR/deployment operations, cloud sandbox attestation, MCP secret brokering, and external MCP health/attestation. P7-01 token foundation and the pure P7-02 versioned schema/resolution boundary are now implemented with tests; tenant persistence/admin mutation remains dependency-gated.
> **For**: The next agent (or human) picking this up cold.
> **Read this entire document before touching any code.**

> **Routing clarification**: ONEVibe must route **all** model traffic through the server-controlled LiteLLM gateway for data sovereignty, centralized policy, cost control, and model optimization. This includes every Claude/Anthropic-compatible SDK call, Codex-compatible route, AgentCore integration, local test harness, and future provider adapter. Do not call a first-party Anthropic endpoint directly or add a direct Anthropic credential as a fallback; if LiteLLM is unavailable, fail closed and surface an unavailable state.

---

## 1. What ONEVibe is (the sharpened thesis)

ONEVibe is a **cloud-native AI workspace that is a provider-neutral meta-layer above agent harnesses**.

Users pick which harness runs their task — Claude Agent SDK, OpenAI Codex, AWS Bedrock AgentCore, or any future runtime. ONEVibe provides everything above the harness: task lifecycle, conversation history, artifact storage, workspace files, approval governance, MCP routing, team management, and a professional UI that works regardless of which harness is underneath.

**ONEVibe is not a wrapper around a single SDK.** This is the most important architectural principle. OpenWork (the closest open-source equivalent, `github.com/different-ai/openwork`) locked onto `@opencode-ai/sdk` as its sole engine. When that engine stagnates or a better one ships, OpenWork is stuck. We do not make that mistake.

**Harnesses will always improve. Our users must be free to use the best one at any time.**

### Mandatory model-routing policy

Every model request and every agentic turn in every environment — including Claude, Codex, AgentCore, and future harnesses — must traverse the server-controlled **LiteLLM** boundary. This is a hard product and security invariant, chosen for data sovereignty, centralized routing, cost control, and optimization. The Claude Agent SDK may remain the selected harness, but it must receive only a LiteLLM-compatible `ANTHROPIC_BASE_URL`, a server-injected relay credential, and an explicit router model alias. Those Anthropic-compatible variable names are an SDK transport convention; their values must point only to LiteLLM and must never contain a first-party Anthropic endpoint or credential.

Direct first-party Anthropic API traffic is prohibited: it is not an accepted fallback, local-development shortcut, test fixture, emergency path, or release path. Do not add a direct Anthropic key, endpoint, or implicit SDK fallback to any environment. Any legacy direct-Anthropic branch in the codebase is a hardening gap and must be removed or fail closed before a provider path is called production-ready. If LiteLLM is unavailable or misconfigured, the runtime must report an unavailable/blocked state rather than bypassing the boundary.

The abstraction that enforces this: `server/runtime-adapter.ts` — the `RuntimeAdapter` interface. Every harness is an implementation. This file is the most important file in the codebase. Strengthen it; never work around it.

---

## 2. Current state of the codebase

### What exists and works

| Component | File(s) | State |
|---|---|---|
| React SPA | `src/` | Real — Vite, React 19, `@assistant-ui/react`, framer-motion |
| API server | `server/index.ts` (915 lines) | Real — hand-rolled Node HTTP, port 4311 |
| RuntimeAdapter interface | `server/runtime-adapter.ts` | Real — the correct abstraction |
| Claude SDK adapter | `server/claude-sdk-runner.ts` (422 lines) | Real — wraps `@anthropic-ai/claude-agent-sdk` and fails closed without LiteLLM; opt-in MCP facade is local-only |
| ONEComputer adapter | `server/onecomputer-sandbox-runner.ts` (845 lines) | Real — wraps the development ONEComputer cloud sandbox; production microVM attestation remains open |
| Demo adapter | `server/demo-runner.ts` (172 lines) | Fake — scripted responses, zero model calls |
| Task store | `server/store.ts` + `server/persistence/` | Real — SQLite remains the default; opt-in Postgres/Drizzle startup, owner scope, HTTP read refresh, revision/workspace durability, and disposable runtime proofs are present |
| SSE streaming | `server/task-event-stream.ts` | Real |
| Approval service | `server/wallet-approval-service.ts` | Real — wallet-gated approvals |
| UI — cosmetic | `src/index.css`, `src/components/*` | Done — Claude-calibrated light mode, Inter font, cream palette |
| Tests | `server/*.test.ts`, `src/components/*.test.ts`, `scripts/*.test.ts` | 270 tests passing in the latest local gate |
| Container | `Dockerfile`, `docker-compose.yml` | Local hardened image verified; Compose still defaults to SQLite and requires the Postgres/auth deployment wiring |

### What is critically broken

1. **No governed runtime configured** — the local fallback is explicitly labelled Simulation and makes no model call; when the protected LiteLLM route is configured, the registry selects a compatible governed runtime instead
2. **Auth is feature-gated** — Better Auth Email OTP, session middleware, login UI, local user ownership, matching Postgres auth-handle wiring, and a Drizzle/Postgres OTP/session proof are implemented; production delivery, organization policy, and exhaustive route acceptance remain open
3. **Postgres is opt-in, not yet the production default** — migrations `0004`–`0008` cover conversation identity, owner binding, task lineage, provider message IDs, MCP config history/retention, lease idempotency uniqueness, legacy-import provenance, workspace/project bytes, project revisions, and the task-to-conversation FK. The running server selects Postgres only when explicitly configured and rejects unauthenticated owner-scoped data routes. Import/export byte round trips, complete workflow idempotency/concurrency, cross-instance live SSE, and deployment migration operations remain Phase 4 work
4. **No managed deploy path** — a non-root Docker image and local Compose smoke path now exist, but Railway/Fly configuration, secrets, auth, and production operations remain open
5. **No production sandbox attestation** — local host and development-provider paths must not be described as microVM isolation or default-deny egress
6. **Organization membership is not yet a data-plane grant** — local authenticated owners can create organizations and owners can add/remove members, but task/project/runtime access remains owner-scoped until org policy is intentionally integrated and accepted
7. **The active task remains an intentional state boundary** — durable SSE replay and the active snapshot are still owned by `useTask`; active-task mutations use Query mutation lifecycle/pending state and reconcile server-derived caches without creating a second client authority
7. **Local metadata writes are now crash-safe** — task/project/schedule/version JSON is written through same-directory temporary files and flush-before-rename; this does not replace the still-open Postgres/object-storage promotion path
8. **Remaining extension/release gaps** — production MCP secret brokering/external health attestation and browser evidence remain open in `TODO.md`; the production dependency audit gate is now clean under the reviewed esbuild override

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
# + vitest run (latest handover run: 56 files / 270 tests; the command output is authoritative)
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

### Phase 1 — Stop the bleeding (complete locally)
**8 tasks. Target: real Claude Q&A works, no silent failures.**

- Fix backend-down silent failure (`P1-01`) — complete
- Fix SSE event drop in `useTask.ts:52` (`P1-02`)
- Add SSE reconnect backoff (`P1-03`)
- Auto-select best available provider, not demo (`P1-04`)
- Add `scripts/dev-check.ts` env validation (`P1-05`)
- Serve `dist/` from `server/index.ts` for production (`P1-06`)
- Typed `ApiError` class with HTTP status (`P1-07`)
- Permanent demo-mode banner in conversation pane (`P1-08`) — complete

### Phase 2 — Harden the runtime abstraction
**10 tasks. Target: provider-neutral lifecycle and LiteLLM-routed harness boundaries; capabilities drive UI.**

- Audit and harden `RuntimeAdapter` interface (`P2-01`)
- Add `CodexRuntimeAdapter` — OpenAI Codex (`P2-02`)
- Add `AgentCoreRuntimeAdapter` — AWS Bedrock (`P2-03`)
- Add capability declaration per adapter (`P2-04`)
- Per-task working directory (`P2-05`)
- Per-frame delta coalescing in `useTask.ts` (`P2-06`)
- Draft queuing while agent is running (`P2-07`) — complete
- Fork/edit-message (`P2-08`) — complete locally; branch lineage, workspace copy, durable history truncation, API route, and assistant-ui edit action are implemented
- Fix `waiting_for_user_input` UX (`P2-09`)
- Approval panel above composer (`P2-10`)

### Phase 3 — Runtime routing layer
**7 tasks. Target: informed harness selection; mode-aware suggestions; bounded startup health and health dashboard.**

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
**13 tasks. Target: no dead controls, no hardcoded strings, explicit Zustand UI state, and TanStack Query for server-backed collections without duplicating the durable SSE projection.**
(See `plan/05-ui-overhaul.md` for details)

### Phase 6 — MCP + extensions
**4 tasks. Target: users add MCP servers; verified skill marketplace installation works. The local MCP declaration, bounded health probe, marketplace install/remove slices, live GitHub catalog verification, and protected Claude/LiteLLM skill materialization exist; authenticated ownership, secret brokering, and external health attestation remain open.**
(See `plan/06-mcp-extensions.md` for details)

### Phase 7 — Tenant theming and extensibility (planned)
`THEMING_EXTENSIBILITY.md` is a planning brief for a future white-label product surface. `TODO.md` now tracks P7-01 through P7-09. Do not start tenant-admin mutation until authenticated admin/org scope, the Postgres runtime, and the assistant-ui design foundation are accepted. Theme configuration is presentation-only: it cannot change LiteLLM routing, provider credentials, auth/session policy, OpenVTC/VTI approval authority, evidence redaction, or sandbox policy. The current ONEVibe UI remains sans-serif-only; the brief's serif/monospace examples require an explicit design/security decision before they could be considered.

---

## 6. Key files — what they do

### Frontend (`src/`)

| File | What it does |
|---|---|
| `src/App.tsx` | Root component. Zustand owns UI/composer/session state; TanStack Query owns ordinary server collections; `useTask` remains the active durable SSE snapshot boundary |
| `src/hooks/useTask.ts` | SSE streaming hook. Buffers pre-snapshot events, reconnects with bounded backoff, and preserves replay IDs; do not move the append-only stream into generic Query state |
| `src/lib/api.ts` | All HTTP calls to the server, with typed `ApiError` status/code handling and explicit response parsing |
| `src/types.ts` | Shared TypeScript types, including provider-neutral runtime capabilities and durable task/event contracts |
| `src/components/PromptComposer.tsx` | Composer and durable guidance handoff; running turns queue follow-ups through the server (P2-07 complete) |
| `src/components/AssistantThread.tsx` | Conversation rendering via `@assistant-ui/react`; running state, bounded trace, tool groups, artifacts, and explicit message branching are wired to durable task data |
| `src/components/Workspace.tsx` | Right-panel workspace and evidence inspector, including capability-aware file/preview surfaces and mobile handoff |
| `src/components/Sidebar.tsx` | Left navigation backed by Query conversation/task data, live skill count, search, and project context |

### Backend (`server/`)

| File | What it does |
|---|---|
| `server/runtime-adapter.ts` | **The most important file.** The interface all harnesses implement |
| `server/index.ts` | Main HTTP server (915 lines). Registers API routes and serves the production `dist/` fallback for non-API paths |
| `server/claude-sdk-runner.ts` | Claude Agent SDK adapter (422 lines). Real when the protected LiteLLM relay is configured; fails closed without it; local MCP facade is opt-in |
| `server/onecomputer-sandbox-runner.ts` | ONEComputer adapter (845 lines). Development-provider path only; it must not be described as production microVM evidence |
| `server/demo-runner.ts` | Fake demo adapter (172 lines). Zero model calls |
| `server/store.ts` | Task persistence (1,427 lines). SQLite via `better-sqlite3`; Postgres repository/runtime switch remains P4-02 |
| `server/runtime-readiness.ts` | Reports provider availability and capability metadata through the RuntimeRegistry |
| `server/skill-packs.ts` | Versioned built-in packs plus owner-installed marketplace materialization; demo selection is explicitly non-executing. Protected provider marketplace acceptance remains P6-02 |

---

## 7. Environment variables

```bash
# Required: all model traffic goes through this server-controlled relay.
ONEVIBE_LITELLM_URL=http://127.0.0.1:4100
ONEVIBE_LITELLM_API_KEY=
ONEVIBE_LITELLM_MODEL=claude-sonnet-5

# Optional operator-selected runtime default (demo, claude_sdk, onecomputer, remote)
ONEVIBE_DEFAULT_PROVIDER=

# Optional GitHub-backed skill catalog; defaults to the ONEVibe repository catalog.
ONEVIBE_SKILL_CATALOG_URL=https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json

# Optional Codex-compatible model alias; it is still routed through LiteLLM.
ONEVIBE_CODEX_MODEL=

# Optional AgentCore remote runtime; it must explicitly declare LiteLLM routing.
AGENTCORE_RUNTIME_URL=https://...
AGENTCORE_RUNTIME_BEARER_TOKEN=
ONEVIBE_AGENTCORE_LITELLM_ROUTED=false

# ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY are derived for the child SDK
# process from the relay configuration; do not use a direct first-party key.

# Required for ONEComputer sandbox
ONECOMPUTER_API_URL=https://...
ONECOMPUTER_SERVICE_TOKEN=oc_...
ONECOMPUTER_PROJECT_ID=proj_...

# Codex-compatible and AgentCore routes do not receive direct model or cloud
# credentials in ONEVibe. They must use server-controlled endpoints that
# explicitly declare LiteLLM routing. Raw OpenAI, Anthropic, AWS, or Bedrock
# credentials are not valid substitutes for this boundary.

# Phase 4: auth + database + sandbox (not all enabled in the local default)
BETTER_AUTH_SECRET=
RESEND_API_KEY=
# DATABASE_URL=postgres://...  # with ONEVIBE_PERSISTENCE_DRIVER=postgres, selects the reviewed Postgres TaskStore
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

When resuming work:

- [ ] Read `TODO.md`, the relevant phase plan, and the latest Linear comments
- [ ] Run `npm run check` and record the exact test count
- [ ] Open `http://127.0.0.1:5173` with the API running and inspect the current provider/mode state in the browser
- [ ] Preserve the LiteLLM-only policy: direct first-party Anthropic, OpenAI, Bedrock, or other first-party model credentials are never a fallback
- [ ] Read `server/runtime-adapter.ts` before changing a harness or provider contract
- [ ] Keep provider-specific details in server-side adapters/payloads; UI routing must use capability and health metadata
- [ ] Update `docs/IMPLEMENTATION-LOG.md`, `docs/LINEAR-BOARD.md`, and the relevant Linear issue after each meaningful slice
