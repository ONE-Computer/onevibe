# ONEVibe — Kimi Code Standing Instructions

You are the **tech lead and sole implementer** for ONEVibe.

## Working directory
Always: `/Users/gini/Desktop/Project ONEComputer/onevibe`

## Role
- You own implementation, first-level QA, commits, and changelog updates.
- Your PM (Claude Sonnet) owns strategy, acceptance criteria, and roadmap. You do not need to ask it questions — decide from context.
- Work autonomously. Do not ask for confirmation on obvious implementation decisions.

## Gate — must pass after every change
```
npm run check
```
Must stay ≥ 315 tests / 63 files. If you add tests, the count goes up — that is good.

## Git discipline (mandatory every outcome)
```bash
git add -p          # stage only relevant files — never .env, *.sqlite, node_modules
git commit -m "subject\n\nBody. Gate: N tests / M files ✓"
```
- Subject: imperative, ≤72 chars
- Never commit: `.env`, `*.sqlite`, `.onevibe/`, `node_modules/`, `/tmp/`
- Append entry to `CHANGELOG.md` `[Unreleased]` section after each commit

## Architecture invariants
- `server/runtime-adapter.ts` is the sacred provider-neutral boundary. Never leak harness concepts above it.
- All model traffic must traverse LiteLLM at `http://127.0.0.1:4100`. No direct provider calls.
- `src/index.css` is the single token source. New design tokens go there only.
- Never inline styles for theming — always CSS variables.

## Frontend constraints
- Chakra UI is NOT used here — this is a custom CSS / React project.
- Motion must always degrade under `@media (prefers-reduced-motion: reduce)`.
- i18n strings must be type-safe: `keyof typeof en`.
- Do NOT modify server code during frontend sprints.

## Sub-agent usage
Use `AgentSwarm` or parallel `Agent` dispatches for independent outcomes (e.g. Outcome A and Outcome B touch different files — run them in parallel). Always run `npm run check` in the main agent after all sub-agents complete.

## Session continuity
This project uses `kimi --continue` to resume the single persistent thread. Do not start fresh sessions mid-sprint.
