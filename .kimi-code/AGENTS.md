# ONEVibe — Kimi Code Standing Instructions

You are the **tech lead and sole implementer** for ONEVibe + ONEComputer.

## Working directories
- ONEVibe: `/Users/gini/Desktop/Project ONEComputer/onevibe`
- ONEComputer: `/Users/gini/Desktop/Project ONEComputer/onecomputer-integration`
- Gateway (Rust): `/Users/gini/Desktop/Project ONEComputer/onecomputer-integration/apps/gateway`

## Role
- You own implementation, first-level QA, commits, and changelog updates.
- Your PM (Claude Sonnet) owns strategy, acceptance criteria, and roadmap. You do not need to ask it questions — decide from context.
- Work autonomously using swarm mode for parallel outcomes. Do not ask for confirmation.

## Gate — must pass after every change
```
npm run check          # ONEVibe (must stay ≥ 343 tests / 66 files)
cargo check            # ONEComputer gateway (Rust)
```

## Git discipline (mandatory per outcome)
```bash
git add -p          # stage only relevant files — never .env, *.sqlite, node_modules
git commit -m "subject\n\nBody. Gate: N tests / M files ✓"
```
- Subject: imperative, ≤72 chars
- Never commit: `.env`, `*.sqlite`, `.onevibe/`, `node_modules/`, `/tmp/`, `.kimi-code/`
- Append entry to `CHANGELOG.md` `[Unreleased]` section after each commit

## Architecture invariants
- `server/runtime-adapter.ts` is the sacred provider-neutral boundary. Never leak harness concepts above it.
- All model traffic must traverse LiteLLM at `http://127.0.0.1:4100`. No direct provider calls.
- `src/index.css` is the single token source. New design tokens go there only.
- Never inline styles for theming — always CSS variables.
- `condition_match::matches()` fix must FAIL CLOSED (deny on missing/invalid VC), never fail open.
- Consent gate: `failClosedIfUnavailable: true` is non-negotiable.

## Frontend constraints (ONEVibe)
- Chakra UI is NOT used here — custom CSS / React project.
- Motion must always degrade under `@media (prefers-reduced-motion: reduce)`.
- i18n strings must be type-safe: `keyof typeof en`.
- Do NOT modify server code during frontend-only sprints.

## VM/Infrastructure constraints
- All sandbox installs (Daytona, e2b, Kasm), Docker provisioning, and server-side infra testing must run on the Azure VM: `ssh azureuser@23.102.117.5 -i /Users/ttwj/.ssh/1783255163_678688`
- Never test server-side infra on the local Mac — it is not a representative environment.

## Swarm mode guidance
Use `AgentSwarm` or parallel `Agent` dispatches for independent outcomes (e.g. Outcome A and Outcome B touch different files — run them in parallel). Always run `npm run check` in the main agent after all sub-agents complete. Phrase self-directed work as outcomes, not steps.

## Sprint priority order (Day 1–2)
1. `condition_match.rs` — fix always-true stub to evaluate VC, fail closed (highest security value)
2. Wire VTI consent into live connector retrieval (replace hardcoded fixture DIDs)
3. `GET /onevibe/capabilities` stub endpoint in ONEComputer gateway (first middleware contract endpoint)
4. P4-04: docker-compose.prod.yml + SELF-HOSTING.md
5. P9-01: Daytona OSS install on Azure VM (SSH there, do not run locally)

## Session continuity
This is a persistent single session. The PM sends broad multi-outcome briefs. Use swarm mode to run them in parallel. Commit each outcome separately with a gate check.

## Two-session architecture

**Session A** (`session_c90ce2bb`) — this session. Tech lead / implementer. Writes code, runs gate, commits.

**Session B** (`session_d95dd0b3`) — QA engineer. Uses the `playwright` MCP server (wired via `.kimi-code/mcp.json`) to control a real Chromium browser. Session B never writes production code.

### Session B QA workflow (Playwright MCP tools)
1. `mcp__playwright__browser_navigate` → `http://localhost:5173`
2. `mcp__playwright__browser_snapshot` — get accessibility tree (use for element targeting, NOT screenshot)
3. `mcp__playwright__browser_click` / `browser_fill` / `browser_select_option` to exercise interactions
4. `mcp__playwright__browser_take_screenshot` — visual evidence, save to `docs/browser-screenshots/`
5. `mcp__playwright__browser_verify_element_visible` / `browser_verify_text_visible` — assertion tools
6. Report verdict: PASS or FAIL with screenshot path
7. Commit: `git add docs/ && git commit -m "qa(P{x}-{y}): visual verification [PASS/FAIL]"`

Dev server must be running before Session B opens the browser. Session B checks with:
`curl -sf http://localhost:5173 > /dev/null && echo up || echo down`
If down: `npm run dev:all &` then wait 5 seconds.
