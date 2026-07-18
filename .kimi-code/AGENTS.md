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

## Push discipline (mandatory after every commit)
After each commit, push to the private GitHub remote:
```bash
git push private main
```
If the `private` remote is not yet configured, add it once:
```bash
git remote add private https://github.com/ONE-Computer/onevibe-private.git
git push private main
```
Never push to `origin` — that is the public repo, only the PM pushes there.
Push frequency: after every outcome commit. Do not batch multiple commits before pushing.

## Model inference — HARD RULE

**Never install or use local model inference.** No ollama, llama.cpp, llamafile, LM Studio, GGUF weights, or any tool that runs model weights locally.

**Why:** We have no GPU. The Azure VM is CPU-only. Local inference is too slow to be useful and produces misleading benchmarks.

**All model calls — including Hermes, Kimi, Claude, or any other model used in spikes or production — must go through the LiteLLM router:**
- Local Mac: `http://127.0.0.1:4100/v1`
- Azure VM: `http://127.0.0.1:47821/v1`

If a specific model is not registered, check available routes via `GET /v1/models` and use what is available. Do not pull weights locally as a workaround.

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

## VM/Infrastructure constraints — HARD RULE

The local Mac has insufficient RAM for Docker workloads and Linux tooling works poorly on it. The following work MUST run on the Azure VM — never locally:

- **P4-01** auth (Better Auth + Postgres production delivery)
- **P4-02/03/04** database, containerisation, docker-compose.prod.yml validation
- **P8-*** all sandbox installs and adapter testing (Daytona, e2b, Docker devcontainer)
- **P9-01/02** Daytona/e2b OSS installs on Azure
- Any `docker compose up`, `docker build`, Postgres/Redis integration test

Azure VM: `ssh azureuser@23.102.117.5 -i /Users/ttwj/.ssh/1783255163_678688`

For these tasks: SSH in, do all work there, copy back only docs/evidence. Never attempt Docker or Postgres on the local Mac.

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
