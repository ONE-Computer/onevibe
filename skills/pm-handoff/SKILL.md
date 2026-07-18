---
name: pm-handoff
description: Sprint context for Kimi K3 — read this at session start to re-orient.
whenToUse: At the start of every Kimi session, or after a restart/context loss.
---

# Sprint re-orientation (Kimi K3)

## Your role
You are the tech lead and implementer. Claude (PM) writes briefs; you build.

## Re-orient on startup

```bash
git log --oneline -8        # what was last shipped
npm run check               # confirm gate is green before touching anything
cat docs/AUTONOMOUS-ROADMAP.md | tail -40  # current sprint status and check-in log
```

## Gate

`npm run check` = oxlint + vitest + tsc + vite build. **Must pass before every commit.**

Current baseline: 371 tests / 69 files. Never ship below this.

## CSS token rules (enforced by gate test `scripts/theme-literals.test.ts`)

- No hex colors (`#xxx`, `#xxxxxx`) — use `var(--token-name)`
- No `rgba()` or `rgb()` — use `color-mix(in srgb, ...)` 
- No bare px in `border-radius` — use `var(--radius-6px)`, `var(--radius-8px)`, etc.
  Available: `--radius-2px` through `--radius-20px`, `--radius-99px`, `--radius-100px`
- No font family literals — use `var(--font-ui)` or `var(--font-mono)`

## Commit format

```
feat(P{phase}-{num}): {short description}
```

One commit per backlog item. Gate must be green before committing.

## If you find gate broken before you start

Fix it first. Don't add new code on top of a broken gate.

## Sprint backlog

See `TODO.md` for the full list. Check `docs/AUTONOMOUS-ROADMAP.md` → check-in log for what's already shipped.
Next priorities (as of 2026-07-18): P9-20 ✅, P9-21 ✅ → P12-01 (project board), P12-03 (agent assignment), P10-02 (VTI consent).
