---
name: kimi-pm-protocol
description: How Claude (as PM) should brief, monitor, and fall back when Kimi K3 is the tech lead/implementer.
whenToUse: At sprint start, after context compaction, or when deciding whether to wait for Kimi vs implement directly.
---

# Claude PM ↔ Kimi K3 operating protocol

## Role split

| Role | Agent | Responsibilities |
|---|---|---|
| PM / BA / QA / Roadmap | Claude Sonnet | Write briefs, fix gate failures, commit docs, implement when Kimi is unreliable |
| Tech lead / Implementer | Kimi K3 | Write production code, run gate, commit features |

## Brief format (what Kimi needs)

Write briefs as **outcomes**, not steps. Kimi is a senior engineer — describe what to build and the acceptance criteria, not how.

```
**P{phase}-{num} — {title}**

{1-3 sentence description of what to build and why}

Files affected: {list specific files or components}

Acceptance:
- {concrete acceptance criterion 1}
- {concrete criterion 2}
- Must pass `npm run check` (gate: 371 tests / 69 files minimum)

Ship as a single commit: `feat(P{phase}-{num}): {description}`
```

Keep it under ~200 words. Kimi loses context in long prompts.

## When to wait vs implement directly

**Wait for Kimi** (WebSocket established, server healthy) when:
- Task requires deep file traversal across many files
- Task is well-scoped with clear acceptance criteria
- Multiple independent items can be parallelised

**Implement directly** (Claude does it) when:
- Kimi server is unreliable or WebSocket can't be established
- Gate is broken and blocking further work
- Task is small (< ~3 files, < 50 lines)
- Brief failed twice and Kimi produced nothing

In this sprint: Claude implemented P9-19, P9-27, P9-20, P9-21 directly because Kimi's tool execution was unreliable outside the browser UI.

## Monitoring Kimi progress

Evidence that Kimi is working:
- `git log --oneline -3` shows new commits in the last 30 min
- `kimi server` process is running (curl :58627 returns HTML)

Evidence that Kimi is stuck (act on this):
- No new commits after 30+ minutes despite a brief being sent
- Browser UI shows session idle / no tool calls
- Server process was killed (connection refused)

## What Kimi cannot do reliably

- **`kimi -p` mode**: Kimi returns a text completion but executes no tools. Safe for queries, useless for implementation.
- **Piped stdin** (`echo "brief" | kimi --yolo`): Kimi reads the prompt into its composer but doesn't auto-submit. Session exits after showing the prompt.
- **Corrupted session resume**: Abandoned sessions with dangling step_uuid will always fail on `-S <id>` resume.
- **REST API without WebSocket**: `POST /sessions/{id}/prompts` enqueues the prompt but the agent loop never runs.

## Gate rules Claude must enforce

Before committing any code:
- `npm run check` must pass
- No hardcoded hex colors, rgba(), or bare px border-radius in CSS (use `var(--token)`)
- TypeScript strict: no unused imports (`TS6133`), no implicit `any`
- Test count must not decrease from baseline

If Kimi ships a commit that breaks the gate, Claude fixes it immediately and notes the fix in the roadmap log.

## Roadmap log

After every significant event, append a row to `docs/AUTONOMOUS-ROADMAP.md` → `## Scheduled check-in log`:

```
| 2026-07-18 {event label} | {commits} | ✅ {test count} | {summary} |
```

This is the audit trail for the user when they return from holiday.
