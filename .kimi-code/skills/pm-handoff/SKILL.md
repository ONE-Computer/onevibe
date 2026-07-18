---
name: pm-handoff
description: Protocol for receiving and acting on a brief from the PM (Claude) during the autonomous sprint.
whenToUse: When you receive a new brief from Claude acting as PM, or when starting work after a restart/context loss.
---

# PM → Kimi handoff protocol

## Role assignments (locked for this sprint)
- **Claude Sonnet**: PM / BA / QA / Roadmap. Writes briefs, fixes gate failures, commits docs and emergency fixes.
- **Kimi K3**: Tech lead / implementer. Reads briefs, writes production code, runs gate, commits.

## When you receive a brief

1. Read the brief fully before writing any code.
2. Run `git log --oneline -5` to understand current state.
3. Run `npm run check` to confirm the gate is green before starting.
4. Implement in the order specified. Each item = one commit.
5. After implementing a visual/interactive feature: **run `npm run dev &`, open `http://localhost:5173` in your browser, verify the feature renders and works, then kill the dev server** (`pkill -f "vite"`). `npm run check` passing is NOT sufficient — it only verifies compilation, not that the UI works.
6. After gate passes and visual verification is complete: commit.
7. When all items are done, report: "Done. Gate: X tests / Y files ✅. Commits: [list]. Visual QA: confirmed [what you checked]."

## Gate (`npm run check`)

Must pass before every commit. It runs:
- oxlint (lint)
- vitest (unit tests)  
- tsc (TypeScript strict)
- vite build (bundle)

Current baseline: 371 tests / 69 files. Do not ship commits that reduce this number.

## Brief format from PM

Briefs follow this pattern:
```
**P{phase}-{num} — {title}**
{what to build}
{specific files/components/routes affected}
{acceptance criteria}
Must pass `npm run check`.
```

Implement exactly what the brief says. Do not add features beyond scope.

## What to do if gate breaks

1. Run `npm run check 2>&1` and read the errors carefully.
2. Fix the specific error — do not rewrite unrelated code.
3. Common causes: unused imports (TS6133), missing type annotations, hardcoded CSS values (hex colors, rgba(), px border-radius — use `var(--radius-Xpx)` and `var(--token)` instead).
4. Re-run gate. Only commit once green.

## What to do at context loss / restart

1. Run `/sprint` skill to re-orient.
2. Check `docs/AUTONOMOUS-ROADMAP.md` for the check-in log — it shows what was last shipped.
3. Run `git log --oneline -8` to see recent commits.
4. Continue the next unshipped item from the roadmap.

## CSS token rules (enforced by gate)
- No hardcoded hex colors (`#xxx`) — use `var(--token-name)`
- No `rgba()` or `rgb()` — use `color-mix(in srgb, ...)` or a `var(--effect-...)`
- No bare `px` in `border-radius` — use `var(--radius-6px)`, `var(--radius-8px)`, etc.
- Font families must use `var(--font-ui)` or `var(--font-mono)`, not literal names
- All radius tokens available: `--radius-2px` through `--radius-20px`, `--radius-99px`, `--radius-100px`
