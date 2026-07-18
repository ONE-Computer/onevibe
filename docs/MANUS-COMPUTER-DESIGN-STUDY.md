# Manus Computer — Design Study for ONEVibe
> Studied: 2026-07-18. Screenshots: docs/design-screenshots/manus-[A-G]*.png
> Read alongside: PERPLEXITY-COMPUTER-DESIGN-STUDY.md, KIMI-WEB-DESIGN-STUDY.md
> Audience: Kimi K3 (implementer) + future engineers on P9-15, P9-25, P9-26, P9-27

---

## Screenshots reference

| File | What it shows |
|---|---|
| `manus-A-chat-right-panel-editor.png` | Three-column layout — right panel in Editor mode (syntax-highlighted code) |
| `manus-B-right-panel-terminal.png` | Right panel in Terminal mode (live shell output) |
| `manus-C-right-panel-media.png` | Right panel in Media viewer mode (rendered image + "Jump to live" pill) |
| `manus-D-task-complete-suggestions.png` | Chat — "Task completed" + 5-star rating + 4 follow-up suggestions |
| `manus-E-task-progress-scrubber.png` | Right panel bottom — video scrubber + Task progress milestones |
| `manus-F-files-modal.png` | "All files in this task" full-screen modal with type tabs |
| `manus-G-sidebar-tasks.png` | Left sidebar — task list with thumbnails, user avatar, referral card |

---

## Layout architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Left sidebar (~220px)    │  Chat column (~380px)  │  Right panel (~400px) │
│                          │                        │                        │
│  [M] Manus logo    🔍 ≡  │  Model: Manus 1.6 Lite │  "Manus's computer"   │
│                          │         ↓  ⊞ ···       │  ────────────────────  │
│  [+] New task            │                        │  Manus is using        │
│  🤖 Agent                │  [file card]           │  Editor · Reading      │
│                          │  View all files >      │  file edm/…            │
│  ── Tasks ──────────     │                        │  ────────────────────  │
│  Task 1 (thumbnail)      │  ✓ Task completed      │                        │
│  Task 2                  │  ☆☆☆☆☆ How was this?  │  [Editor / Terminal /  │
│  Task 3 (active)  ●      │                        │   Media viewer]        │
│  Task 4                  │  [follow-up 1]  >      │                        │
│  ...                     │  [follow-up 2]  >      │  ────────────────────  │
│                          │  [follow-up 3]  >      │  |< >  ●────────• Live │
│  ── Referral CTA ──      │  [follow-up 4]  >      │                        │
│                          │                        │  Task progress  3/3 ↓  │
│  [avatar] Terence Tan    │  [composer]            │  ✓ Milestone 1         │
│           💬 🔔           │  + Message Manus 🎙 ↑ │  ✓ Milestone 2         │
│                          │  Manus Desktop         │  ✓ Milestone 3         │
└──────────────────────────────────────────────────────────────────────────┘
```

Key proportion: right panel is **~40% of total viewport** — a first-class live workspace, not a sidebar. The center chat column is actually *narrower* than the right panel at ~38%.

---

## Pattern 1: Live right panel with "Manus is using [Tool] · [action]" header

**The most important Manus pattern.** The right panel has a persistent sub-header that reads:

> "Manus is using **Editor** · Reading file edm/7May2026EDM-ema…"
> "Manus is using **Terminal** · Executing command mkdir -p /h…"
> "Manus is using **Media viewer** · Viewing image /home/ubuntu…"

Format: bold tool name + `·` separator + truncated current action. Updates on every tool call. Always visible without scrolling.

The panel body switches between three rendering modes:
- **Editor**: syntax-highlighted code view (observed: HTML/CSS with color tokens — pink keywords, teal strings, orange values). No line numbers visible.
- **Terminal**: `ubuntu@sandbox:~$` prompt in green. Full stdout rendered, small monospace font, white on near-black. Long output scrollable.
- **Media viewer**: Rendered image (email template preview). Fills panel with padding. A "Jump to live" pill overlaid when viewing historical frames.

**ONEVibe implementation (P9-15 revised):**
- Right panel component `AgentWorkspacePanel` with tab states: `editor | terminal | browser | files`
- Sub-header: `"Agent is [verb]ing · [truncated file/command]"` fed from the live SSE stream's current tool event
- Switches rendering mode on each tool-call event type:
  - `file_read` / `file_write` → Editor mode (highlight with Shiki or Prism)
  - `bash` / `shell` → Terminal mode (xterm.js or a styled `<pre>`)
  - `browser` / `screenshot` → Browser mode (iframe or `<img>`)
- Panel width: 360–400px. Never collapses during active run.

---

## Pattern 2: Video-style replay scrubber with "• Live" indicator

Bottom of the right panel (visible in `manus-E-task-progress-scrubber.png`):

```
|<  >   ●───────────────────────────────• Live
```

- `|<` = jump to start of task
- `>` / `||` = play / pause replay
- Filled dot on track = current scrub position
- `• Live` = red/orange dot + "Live" label at right end

When scrubbing historical frames, a **"Jump to live"** pill button overlays the media viewer content — one click snaps back to real-time.

**ONEVibe already has replay** (durable SSE events, `executionBoundary`, replay suffix). The gap is the **visual control layer**:
- Replace the current checkpoint list / `← n/m →` stepper with a video-player-style scrubber bar
- Add `• Live` indicator (red dot) that activates when playhead = latest event
- Add "Jump to live" overlay CTA on the right panel when viewing historical frames
- This is P9-25.

---

## Pattern 3: Task milestone progress (separate from step trace)

Below the scrubber, a collapsible "Task progress N/N" section shows 3–5 high-level milestones:

```
Task progress  3 / 3  ↓
✓  Draft refined informative content and technical breakdown
✓  Reconstruct the HTML with original placeholders and new content
✓  Upload to CDN and deliver final results
```

These are **not** step-trace items. They are user-facing deliverables, written from the user's perspective. The agent sets them at task start; they get checked off as achieved.

**ONEVibe gap (P9-26):** Our execution trace shows tool calls. We need a separate milestone layer — 3–5 outcome sentences the agent commits to at start, checked off as work proceeds. These appear in the right panel's persistent section, always visible. The step trace is the detail; the milestones are the promise.

---

## Pattern 4: "Task completed" + star rating + follow-up suggestions

After the agent finishes, the chat column shows (in sequence):

1. A file card: icon + filename + file type + size — inline in chat, not just a link
2. "View all files in this task" text link
3. Green ✓ + "Task completed" — bold, center-aligned treatment
4. "How was this result?" + ☆☆☆☆☆ star rating — inline feedback
5. Four suggested follow-up actions, each a full sentence with an icon and `>` chevron:
   - 🔄 "Make the process we used here into a re-usable skill with /skill-creator"
   - 💬 "Compare the original HTML and the latest draft HTML, highlighting the differences."
   - ✏️ "Apply the new content to the original HTML, maintaining its style and including placeholder images."
   - 💬 "Generate a new draft of the email with a more informative tone, less sales language..."

The follow-up suggestions teach users what to do next AND how to invoke features (the `/skill-creator` slash command is surfaced here as a natural next step).

**ONEVibe gap (P9-27):** No task-completion treatment at all. When a run ends, nothing changes in the UI except the spinner stopping. Build: (1) "✓ Task completed" header in chat column, (2) inline output file card(s), (3) 2–4 contextual follow-up suggestions generated by the model based on what was produced.

---

## Pattern 5: "All files in this task" modal with type tabs

Triggered by "View all files in this task" link. Full-screen overlay:

```
All files in this task  [copy link]  [×]

[All] [Documents] [Images] [Code files] [Links]

Earlier
  🔵 filename.html        Jun 8  ···
  📄 compute_briefing.py  Jun 8  ···
  📄 watchlist.json       Jun 8  ···
```

- Tab filter by file type: All / Documents / Images / Code files / Links
- Each row: colored type icon + filename + date + 3-dot context menu
- "Earlier" section label groups files by time

**ONEVibe gap:** File listing exists but no type-tab filter. This is a polish item to add to P9-20 (Artefacts gallery page).

---

## Pattern 6: Sidebar task list with thumbnails

The left sidebar shows a persistent task history list with:
- Small thumbnail/icon per task (auto-generated from task type or first output)
- Truncated task title
- Active task highlighted with filled dot
- Multi-user tasks have a small person avatar overlaid on the thumbnail

The task titles observed show real diversity: English tasks, Chinese tasks (Chinese investment deck generation), technical tasks. The sidebar doesn't hide previous context — it's always browsable.

**ONEVibe gap:** History items in the sidebar show only text titles, no thumbnails. Low priority but a polish signal.

---

## Summary: what Manus does that neither Perplexity nor Kimi Web does

1. **Live agent desktop** — the right panel is literally the agent's screen. You watch it work.
2. **DVR scrubber** — replay any historical frame of the agent's workspace with video controls.
3. **Task milestones** — separate from step trace. High-level promises checked off as achieved.
4. **Post-task suggestions** — contextual follow-up actions generated from what was produced.
5. **File type modal** — structured file management with type filtering.

All five are worth implementing in ONEVibe. They are the reason Manus feels like a professional tool rather than a chatbot.
