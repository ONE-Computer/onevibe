# Symphony / Linear-style Project Board — Design Study for ONEVibe
> Studied: 2026-07-18. Screenshots: docs/design-screenshots/symphony-[A-D]*.png
> Source: Linear (linear.app) as used by the ONEComputer/ONEVibe project itself
> Purpose: design input for a Jira/Symphony-style work board surface inside ONEVibe

---

## Screenshots reference

| File | What it shows |
|---|---|
| `symphony-A-linear-inbox.png` | Linear inbox + issue list — sidebar navigation, project tags, date labels |
| `symphony-B-issue-detail.png` | Issue detail panel — title, Scope section, Required implementation bullets, Properties sidebar |
| `symphony-C-board-agent-filter.png` | Board filter menu — **Agent** and **Agent Session** as first-class filter dimensions |
| `symphony-D-kanban-board.png` | Kanban view — Todo/In Progress columns, cards with priority icons, project tags, dates |

---

## The key insight: agents as first-class assignees

`symphony-C-board-agent-filter.png` is the most important screenshot. The Linear board filter shows:

```
Filter by:
  Status         ▸
  Assignee       ▸
  Agent          ▸   ← AI agent is a first-class dimension alongside human assignee
  Agent Session  ▸   ← individual session of an agent run
  Creator        ▸
  Priority       ▸
  Labels         ▸
  Relations      ▸
  Suggested label▸
  Dates          ▸
```

And the filter options for **Agent**: "No agent  37 issues" / "Any agent". This means: tasks can be assigned to AI agents. You can see which tasks a given agent is running, and filter the board by agent execution state.

This is the core ONEVibe opportunity: **the work board is where humans and AI agents share a task queue**. Humans create issues; agents pick them up, work on them, and report back. The board is the shared coordination surface.

---

## Layout architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Sidebar (~220px)           │  Main content (fluid)                        │
│                            │                                              │
│  [logo] ONEComputer ▼ 🔍 ✎ │  [tab: Active] [Backlog] [All issues]   ⚙ ≡ │
│                            │                                              │
│  ○ Inbox         (1)       │  ○ Todo   11    [···] [+]                    │
│  ✦ My issues               │  ┌─────────────────────────────────────────┐ │
│                            │  │ ONE-210  ⚠ NORTH-6: Pin OpenVTC...     │ │
│  Workspace ▼               │  │          [!] [ONEComputer × OpenVTC...] │ │
│    Projects                │  │          Created Jul 12                 │ │
│    Views                   │  │──────────────────────────────────────── │ │
│    ··· More                │  │ ONE-206  ⚠ NORTH-3: Prove live...      │ │
│                            │  └─────────────────────────────────────────┘ │
│  Your teams ▼              │                                              │
│  ☁ ONEComputer ▼           │  ⟳ In Progress  26   [···] [+]              │
│    🏠 Home                  │  ┌─────────────────────────────────────────┐ │
│    ☑ Issues                │  │ ONE-218 > P0 EPIC: Stable backend E2E   │ │
│    ⊞ Projects              │  │          [!] [ONEVibe — Backend E2E]    │ │
│    👁 Views                 │  │          BE-3: Claude Agent SDK...      │ │
│                            │  │          Created Jul 16                 │ │
│  Try ▼                     │  └─────────────────────────────────────────┘ │
│    Invite people           │                                              │
│    Initiatives             │                                              │
│                            │                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

The issue detail panel (symphony-B-issue-detail.png):
```
┌─────────────────────────────────────────────────────────────────────┐
│ [←] ONEComputer › Issues › ONE-239  ···                  3/37  ↓ ↑  │
│                                                                     │
│  [UX][P0] Migrate thread shell and                  Properties      │
│  runtime state to assistant-ui-native               ──────────────  │
│  primitives                                         ⟳ In Progress   │
│                                                     ! Urgent        │
│  Scope                                              👤 Assign       │
│  ─────                                                              │
│  Replace the current hand-rolled assistant-ui       Labels          │
│  wrapper with a backend-aware assistant-ui          ○ Add label     │
│  runtime adapter.                                                   │
│                                                     Project         │
│  Required implementation                            🛡 ONEVibe —    │
│  ─────────────────────                                Backend E2E   │
│  • Map ONEVibe task/SSE state into                    & Manus Parity│
│    assistant-ui isRunning, message status,                          │
│    cancellation, errors, and retry.                                 │
│  • Preserve SQLite/task SSE as the source of                        │
│    truth; assistant-ui is only the UI                               │
│    runtime/projection.                                              │
│  • Stream assistant deltas into one durable                         │
│    assistant message without duplicate                              │
│    refresh artifacts.                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Pattern 1: Project-scoped issue list with status columns

**List view** (`symphony-A-linear-inbox.png`, `symphony-C-board-agent-filter.png`):
- Issues grouped by status: `In Progress (26)`, `Backlog`, `Todo (11)`
- Each row: issue ID `ONE-XXX` + priority icon + title (truncated) + epic breadcrumb `> P0 EPIC: …` + project tag chip + date
- Project tag chip uses colour coding: `ONEVibe — Backend E2E & M…` has a red border
- Active tasks show a sub-progress indicator: `0/1` (subtask progress)

**Kanban view** (`symphony-D-kanban-board.png`):
- Columns: Todo / In Progress (expandable, currently visible)
- Cards: issue number in small text, priority icon, title, project chip, date
- Column headers: count badge + `···` menu + `+` add button

**ONEVibe gap**: ONEVibe has a task list but no project-scoped issue board. This is **P12-01**: a Projects → board view surfacing tasks grouped by status (Todo / In Progress / Done / Blocked), with Kanban and List toggle.

---

## Pattern 2: Issue detail with structured specification

The issue detail (`symphony-B-issue-detail.png`) is essentially a mini-spec:
- Bold title with `[UX][P0]` type/priority tags inline
- **Scope** section: 1–2 sentence plain English description of WHY this issue exists
- **Required implementation** section: numbered/bulleted technical requirements
- Right sidebar: Status chip (In Progress / Todo / Done), Priority chip (Urgent / High / Medium / Low), Assignee, Labels, Project

This format maps directly to how ONEVibe tasks already work — every task IS an issue being executed by an agent. The gap is the **structured metadata layer** around tasks: priority, labels, project membership, explicit scope/acceptance criteria.

**ONEVibe gap**: Tasks currently have just title + conversation. No priority, no labels, no explicit scope vs. implementation structure. This is **P12-02**: enrich task metadata — priority field, label tags, project assignment, and a "Brief" field (replaces unstructured first message with a structured Scope + Acceptance block).

---

## Pattern 3: Agents as first-class assignees and filter dimension

This is the most ONEVibe-specific insight from the screenshots.

In `symphony-C-board-agent-filter.png`, the filter panel shows:
- **Agent**: filter to tasks assigned to a specific AI agent (vs. human)
- **Agent Session**: filter to a specific run/session of an agent

This means the board shows both human-assigned work and agent-assigned work in the same view. When an issue is assigned to an agent, it moves to "In Progress" automatically when the agent starts, and to "Done" when the run completes successfully.

**The implication for ONEVibe**: a task being run by an agent IS an issue in the board. The board is not a separate planning surface — it is the live view of what all agents (and humans) are working on right now. An agent picks up a task = the card moves to In Progress. The agent commits an artefact = the card gets an attachment. The agent finishes = Done.

**ONEVibe gap (P12-03)**: Agent assignment on tasks. Each task can be assigned to: (a) an agent, (b) a human, or (c) both (human reviews agent output). The board's "In Progress" column shows all currently-running agent tasks live. Agents are visible workers in the same board as humans.

---

## Pattern 4: Epic hierarchy + breadcrumb navigation

In the list view, some issues show a parent epic breadcrumb:
```
ONE-218  BE-3: Claude Agent SDK...  > P0 EPIC: Stable backend E2E  [tag]
ONE-217  BE-2: Conversation-scoped... > P0 EPIC: Stable backend E2E  0/1  [tag]
```

This epic → issue → subtask hierarchy is how work is decomposed. For ONEVibe:
- A **Project** is the top-level container (e.g. "Q3 Competitive Intelligence")
- A **Sprint / Epic** is a themed group of tasks
- A **Task** is one agent run
- A **Subtask** (future) is one tool call / step within a task

For now the relevant gap is the Project → Task grouping with epic-style labelling.

**ONEVibe gap (P12-04)**: Project container with tasks grouped under it, visible as breadcrumbs in task list. Already partial — ONEVibe has Projects and Tasks — but the board doesn't show the hierarchy visually.

---

## Pattern 5: Inline status + priority chips (no modals)

In Linear, you change a task's status or priority by clicking a chip directly in the card or detail panel — no modal, no form. The chip pops a small inline picker. Immediate, fluid.

This is the right interaction model for ONEVibe's investment professional audience. They're not filling out forms; they're moving work through stages.

**ONEVibe gap**: task status changes require page navigation or full-card interaction. No inline chip pickers. **P12-05**: inline status chip on task cards (Todo → In Progress → Done → Blocked), clickable to change.

---

## The ONEVibe project board vision

Synthesising the above: ONEVibe's project board is a **shared command surface for humans + AI agents**:

```
My Projects
──────────────────────────────────────────────────────────────────
  Q3 Macro Research          [6 tasks — 2 running, 1 blocked]  ▸
  Portfolio Risk Review      [4 tasks — 1 running, 3 done]     ▸
  Earnings Season Tracker    [8 tasks — 0 running, 5 done]     ▸
  + New project

Active now (3 agent runs)
──────────────────────────────────────────────────────────────────
  ● Fetching FX rates for macro brief...    [agent: Kimi K3]  live ●
  ● Writing earnings summary for AAPL...    [agent: Claude]   live ●
  ● Analyzing sentiment in 12 filings...    [agent: Codex]    live ●
```

Each running agent task is a card. You can click into the card to see the live workspace (Manus-style right panel). When it's done, the card moves to Done with output artefacts attached. A human can reassign, reprioritize, or give clarification from the board without opening the full task view.

---

## Recommended backlog items

| ID | Title | Priority |
|---|---|---|
| P12-01 | Project board view — Kanban + List toggle, tasks grouped by status | High |
| P12-02 | Task metadata enrichment — priority, labels, project assignment, Brief field | High |
| P12-03 | Agent assignment — tasks assignable to agents; board shows live agent runs | High |
| P12-04 | Epic/project hierarchy breadcrumbs in task list | Medium |
| P12-05 | Inline status/priority chip pickers on task cards | Medium |
| P12-06 | "Active now" panel — cross-project view of all currently-running agent tasks | Medium |

---

## What this means for sprint planning

These are not just UX polish items. The project board transforms ONEVibe from a "chatbot where you start one task at a time" into a **workspace where you manage multiple concurrent agent runs**. For an investment professional running 3–5 parallel research tasks with different agents, this is the difference between a toy and a tool.

P12-01 and P12-03 are the core: the board + agent-as-assignee. These should enter the backlog after the current P9 swarm (P9-19, P9-25, P9-26, P9-27) lands. They do not depend on any P9 items.
