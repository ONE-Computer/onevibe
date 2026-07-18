---
name: sprint
description: Show the current sprint brief and resume work on it. Use this when starting a new session or after a break to re-orient.
whenToUse: When the user says "resume sprint", "what are we working on", "continue sprint", or starts a session fresh.
---

Read the current sprint brief and status, then continue work:

1. Read `/tmp/kimi-sprint-brief.md` — current Sprint 1 brief (if it exists)
2. Read `/tmp/kimi-ux-overhaul-brief.md` — Sprint 2 brief
3. Run `git log --oneline -5` to see what was committed
4. Run `git diff --stat HEAD` to see uncommitted work
5. Check `/tmp/kimi-qa-report.txt` if it exists (Sprint 1 completion report)

Then:
- If Sprint 1 is not complete: continue Sprint 1 outcomes in order (A → B → C → D)
- If Sprint 1 is complete (qa-report shows all DONE/PARTIAL): start Sprint 2
- Use AgentSwarm or parallel Agents for independent outcomes
- Run `npm run check` after each outcome and commit

Report status and proceed.
