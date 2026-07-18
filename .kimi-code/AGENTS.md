# ONEVibe — Kimi Code Standing Instructions
> This is the first document you must read at the start of every session.
> It defines what you are building, why it matters, and how to work.

---

## 1. What you are building

**ONEVibe** is a governed AI work platform. A user opens it, writes a task in plain English ("Research SoftBank's portfolio", "Draft a board memo", "Build a signup page"), and an AI agent runs that task inside a sandboxed, policy-enforced computer. The user watches the work happen, steers it mid-run, and receives a production-ready artifact with a verifiable audit trail.

ONEVibe is the **end-user face** of a two-product platform:

| Product | Role |
|---|---|
| **ONEVibe** | What the user sees and touches: conversation, artifacts, connector management, approval cards, execution trace, project board |
| **ONEComputer** | The governed infrastructure beneath: MITM gateway, connector broker (48+ OAuth apps), VTI identity, sandbox lifecycle, CISO console, policy enforcement |

Neither product works without the other. They are one platform with two faces.

### The north-star metric
**Weekly Verified Outcomes (WVO):** distinct weekly active users who complete at least one task that produces an opened, exported, or connected-system artifact whose evidence chain verifies. Every design and implementation decision should move WVO.

### The target user
Investment professionals, knowledge workers, product teams, and enterprise IT/compliance admins. The UI must feel like **Perplexity** or **Linear** — fast, precise, opinionated, professional. Never toy-like, never generic SaaS.

---

## 2. Platform architecture

```
Browser (task UX only)
  → ONEVibe API / durable event timeline (Node.js :4311)
      → Runtime adapter          [server/runtime-adapter.ts — SACRED BOUNDARY]
          → Local demo runner
          → LiteLLM relay (http://127.0.0.1:4100) → Claude / Codex / Kimi
          → AgentCore (AWS Bedrock)
      → Workspace adapter
          → Local confined directory OR ONEComputer sandbox API
      → Policy adapter
          → ONEComputer Rust gateway / policy service
      → Approval adapter
          → OpenVTC Trust Task → VTI Wallet (mobile)
      → Evidence adapter
          → local hash chain OR OpenVTC evidence service
```

### The two sacred abstractions
1. **`server/runtime-adapter.ts`** — the harness boundary. Every AI runtime (Claude, Codex, Kimi, AgentCore, A2A) is an implementation of this interface. Never leak harness-specific concepts into the UI data model.
2. **`ONECOMPUTER_URL`** — the governance boundary. All connector calls, approvals, sandbox execution, and audit trail live behind this endpoint. ONEVibe is never the authority on these.

### Data flow
- Tasks live in SQLite (dev) or Postgres (prod). Each task has an ordered, durable event stream.
- The frontend consumes normalized events: `assistant_text_delta`, `tool_call_started`, `artifact_created`, `approval_requested` — never raw provider events.
- `src/index.css` is the single CSS token source. `src/theme/default.css` is the checked-in token boundary. Never inline styles for theming.

### Key files to know
| File | Purpose |
|---|---|
| `src/App.tsx` | Root — routing, global mutations (followUpMutation, retryMutation), sidebar |
| `src/lib/api.ts` | All frontend→API calls. TypeScript-typed responses. |
| `server/index.ts` | All API routes. ~1500 lines — read in sections. |
| `server/runtime-adapter.ts` | Runtime interface. Read before any adapter work. |
| `src/index.css` | All CSS. Token definitions in `:root`. Single source of truth. |
| `src/types.ts` + `server/types.ts` | Shared type contracts. Keep in sync. |
| `src/lib/i18n.ts` | All user-visible strings — en + zh. Never hardcode UI strings. |
| `docs/TODO.md` | The canonical feature backlog. Phase 1–21. Read before planning. |
| `docs/AUTONOMOUS-ROADMAP.md` | The sprint log. PM check-ins every 30 min. |
| `docs/ACCEPTANCE-CRITERIA.md` | What "done" means for every feature. Read before implementing. |

---

## 3. What is actually real today (honest audit — 2026-07-18)

| Component | Status |
|---|---|
| Task creation, streaming, SSE reconnect, replay | ✅ Production quality |
| LiteLLM routing (all model calls) | ✅ Real, enforced |
| Project board (kanban + list, P12-01) | ✅ Shipped |
| Task metadata: priority, labels (P12-02) | ✅ Shipped |
| Agent assignment + live indicator (P12-03) | ✅ Shipped |
| Epic/breadcrumb hierarchy (P12-04) | ✅ Shipped |
| P9-15 to P9-27 (side panel, milestones, completion UX) | ✅ Shipped |
| Docker production stack (P4-04) | ✅ Shipped |
| Follow-up message refresh (followUpMutation onSuccess) | ✅ Fixed |
| Board contained scroll (UI-01/02/03/04/05/06) | ✅ Fixed |
| VTI consent gate wired live (P10-02) | ❌ NOT YET — highest security priority |
| condition_match.rs VC evaluation (P10-03) | ⚠️ Partial — unknown conditions still fail-open |
| ONEVibe → ONEComputer live connection | ❌ Not yet (P11) |
| Postgres/production deployment | ❌ In progress (P4-01/02/03) |
| Real sandbox isolation (ONEComputer microVM) | ❌ Planned (P8) |

**Gate: `npm run check` — currently 394 tests / 72 files. Must not drop.**

---

## 4. Session architecture

Three parallel Kimi sessions work concurrently. Never cross the boundaries.

| Session | ID | Working dir | Branch | Responsibility |
|---|---|---|---|---|
| **Session A** | `session_c90ce2bb` | `onevibe/` | `main` | New features, platform innovation — ships to `main` |
| **Session C** | `session_560510e2` | `openvtc/vta-mobile-agent-ios/` | `main` | iOS P18 app (SwiftUI, UniFFI Rust) |
| **Session D** | `session_c1bba0b5` | `onevibe-session-d/` | `fix/session-d-stabilization` | Bug hunting and fixing only — ships to `fix/session-d-stabilization` |

**Merge protocol:** Every 30 minutes, Session D's fixes on `fix/session-d-stabilization` are cherry-picked or merged into `main` so Session A always has a clean, stable base to build on. The PM (Claude) handles the merge — Kimi sessions do not merge across branches.

Session B (dedicated QA) has been retired. Sessions A and D self-QA before committing.

---

## 5. Gate — non-negotiable

```bash
cd /Users/gini/Desktop/Project ONEComputer/onevibe
npm run check
```

This runs: oxlint + vitest (full suite) + TypeScript typecheck + Vite production build.

**Must pass ≥ 394 tests / 72 files after every commit. If you break it, fix it before committing anything else.**

On iOS (Session C): `xcodebuild test` — currently pending Xcode install. Do code-review self-QA instead.

---

## 6. How to work: broad strokes, not scripts

You are a **tech lead running a swarm**. Each brief from the PM describes outcomes — not steps. You decompose each outcome into parallel subagent work, run the swarm, integrate results, self-QA, and commit.

### Swarm-first mentality
- If a brief has 3+ independent outcomes, use `AgentSwarm` to run them in parallel.
- Each subagent owns one outcome: one focused codebase area, one commit, one gate check.
- The main agent integrates, runs the full gate, and pushes.

### The brief philosophy
The PM gives you **context + outcomes + acceptance criteria**. You figure out *how*. Do not wait for step-by-step instructions. If the acceptance criteria doc is unclear, infer from the codebase and TODO.md.

### Finding the right files
Before touching code, always:
1. Read `docs/ACCEPTANCE-CRITERIA.md` for the feature's acceptance gate.
2. Grep for the relevant type, component, or route to understand the current shape.
3. Read the surrounding files — don't modify in isolation.

---

## 7. Self-QA workflow (mandatory before every commit)

For every feature or fix:

1. Start dev server: `npm run dev:all &` — wait 5 seconds
2. Playwright MCP — navigate `http://localhost:5173`, exercise the feature:
   - `mcp__playwright__browser_navigate` → URL
   - `mcp__playwright__browser_snapshot` — confirm element structure
   - `mcp__playwright__browser_click` / `browser_fill` — test key interactions
   - `mcp__playwright__browser_take_screenshot` → save to `docs/browser-screenshots/qa-<feature>-<ISO>.png`
3. Kill dev server: `pkill -f "vite|tsx.*server"`
4. Run gate: `npm run check` ≥ 394 / 72
5. Only then commit.

---

## 8. Git discipline

```bash
# Stage only relevant files — never .env, *.sqlite, node_modules, /tmp/, .kimi-code/
git add -p

# Commit format:
git commit -m "type(scope): imperative summary ≤72 chars

Body: what changed and why. Gate: N tests / M files ✓"
```

- `feat(P12-03)`: new feature linked to TODO item
- `fix(follow-up)`: bug fix
- `fix(UI-01)`: UI/CSS fix
- `docs(P13-05)`: documentation only

**Push after every commit:**
```bash
git push private main        # Session A
git push private fix/session-d-stabilization   # Session D
```

Never push to `origin` — that is the public repo. Only the PM pushes there.

**Append to `CHANGELOG.md` [Unreleased] after every commit.**

---

## 9. Hard rules — never violate

### Model inference
All model calls must go through LiteLLM at `http://127.0.0.1:4100/v1`. Never:
- Install or run ollama, llama.cpp, llamafile, LM Studio, GGUF weights locally
- Make direct API calls to Anthropic, OpenAI, or any provider
- Use local model inference of any kind (the Mac has no GPU — local inference is useless and misleading)

### Architecture invariants
- `server/runtime-adapter.ts` is the sacred boundary. Never leak harness concepts above it.
- `src/index.css` is the single token source. New design tokens go here only.
- `condition_match::matches()` fix must **fail closed** (deny on missing/invalid VC), never fail open.
- Consent gate: `failClosedIfUnavailable: true` is non-negotiable.
- All user-visible strings must go through `src/lib/i18n.ts` (en + zh).

### Infrastructure
- Docker, Postgres, sandbox installs: Azure VM (`ssh azureuser@23.102.117.5 -i /Users/ttwj/.ssh/1783255163_678688`) only. Never on local Mac.
- Never commit: `.env`, `*.sqlite`, `.onevibe/`, `node_modules/`, `/tmp/`, `.kimi-code/`

### Session D (bug hunt) rules
- `fix/session-d-stabilization` branch only.
- Bug fixes only — no new features, no new dependencies.
- Gate ≥ 394 / 72 after every commit.
- The PM merges D's fixes into Session A's `main` every 30 minutes.

---

## 10. Frontend constraints

- **No Chakra UI** — this is a custom CSS / React project.
- Motion must always degrade under `@media (prefers-reduced-motion: reduce)`.
- i18n strings must be type-safe: `keyof typeof en`.
- FontAwesome for icons only — no other icon libraries.
- Do NOT modify server code during frontend-only work (and vice versa).
- Accessibility: every interactive element needs a visible `:focus-visible` style, `aria-label` if icon-only, and keyboard navigability.

---

## 11. Design reference standards

Target UX quality: **Perplexity** level. Every view should feel like it was designed, not assembled.

Key design studies in `docs/`:
- `PERPLEXITY-COMPUTER-DESIGN-STUDY.md` — primary reference for task UX, artefacts, skills
- `MANUS-COMPUTER-DESIGN-STUDY.md` — reference for side panel, milestone panel, completion UX
- `KIMI-WEB-DESIGN-STUDY.md` — reference for tool groups, thinking blocks, context ring
- `SYMPHONY-IDEAS-DESIGN-STUDY.md` — reference for project board, agent assignment

Principles:
- No dark voids below content. Views fill the viewport height.
- Consistent padding system: `--layout-view-pad-top/x/bottom` tokens, `--layout-content-max: 960px`.
- Eyebrow labels (`.view-eyebrow`) above every h1.
- Status and loading states for every async operation.
- Empty states are informative, not blank.

---

## 12. Current sprint priorities (Session A — as of 2026-07-18)

In order of importance:

1. **[SECURITY CRITICAL] P10-02** — Wire `authorizePersonalConnectorRetrievalWithVtiConsent` into the live connector retrieval path. Currently called only from workflow fixtures, bypassed in production. `failClosedIfUnavailable: true`. Write an integration test that proves a retrieval without a valid consent decision returns `consent_required`. See `docs/ACCEPTANCE-CRITERIA.md#P10-02`.

2. **P13-05** — Wire Graphiti MCP server into ONEVibe's MCP config. Agent can call `graphiti_search`, `graphiti_add_episode`. See `docs/GRAPHITI-SPIKE.md` for the Azure findings.

3. **P12-05** — Inline status + priority chip pickers (no modal, inline dropdown). `PATCH /api/tasks/:id`. See `docs/ACCEPTANCE-CRITERIA.md#P12-05`.

4. **P12-06** — "Active now" cross-project panel: persistent section in home + sidebar showing all running agent tasks across all projects.

5. **P9-20** — Artefacts gallery: promote artefacts to a top-level navigation destination (thumbnail grid, version badge, filter tabs: All / Mine / Shared).

6. **P9-22** — Memory management page: show what the agent knows about the user (firm, role, preferences). Editable. Clear all. Audit trail.

---

## 13. Current sprint priorities (Session D — bug hunt)

Session D works exclusively from `onevibe-session-d/` on `fix/session-d-stabilization`.

The mandate: find and fix every bug in the existing feature set. Not new features — stability only.

**Discovery sweeps (run in parallel using AgentSwarm):**
- Sweep A: runtime crash paths (unhandled promises, JSON.parse without try/catch, null dereferences)
- Sweep B: state management (missing mutation callbacks, stale closures, useEffect deps, race conditions)
- Sweep C: API contract mismatches (src/lib/api.ts vs server/index.ts — response shapes, error handling)
- Sweep D: UI rendering defects (empty states, NaN dates, missing loading states, conditional render crashes)
- Sweep E: CSS/layout defects (z-index overlaps, media query gaps, undefined CSS variables, focus styles)
- Sweep F: server stability (missing input validation, await without try/catch, SQLite injection risk, memory leaks)
- Sweep G: accessibility (missing alt, aria-label, label associations, focus traps, keyboard nav)

Write findings to `docs/bugs/sweep-[A-G].md`. Triage: P0 crashes → P1 silent failures → P2 wrong renders → P3 UX → P4 polish. Fix in order.

---

## 14. Session continuity

Each Kimi session is persistent. The PM sends broad multi-outcome briefs. You run them as a swarm, commit each outcome, and push. The next brief arrives at the next 30-min check-in.

If this is a resumed session: read `docs/AUTONOMOUS-ROADMAP.md` to see the last check-in row and understand what was shipped and what is next.
