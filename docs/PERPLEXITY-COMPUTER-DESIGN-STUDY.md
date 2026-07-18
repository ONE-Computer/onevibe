# Perplexity Computer — Design Study for ONEVibe
> Studied: 2026-07-18. Screenshots: docs/design-screenshots/perplexity-[A-F]*.png
> Companion to: KIMI-WEB-DESIGN-STUDY.md
> Purpose: design synthesis for ONEVibe's non-technical knowledge-worker audience.

---

## Screenshots reference

| File | What it shows |
|---|---|
| `perplexity-A-chat-right-rail.png` | Chat view — right rail with Artefacts, Sources, Usage |
| `perplexity-B-terminal-inline.png` | Agent running terminal commands inline in chat |
| `perplexity-C-steps-list.png` | "Completed 40 steps" collapsed list — plain-English step labels |
| `perplexity-D-usage-panel.png` | Right rail expanded to show credits used + worked-for duration |
| `perplexity-E-settings-credits.png` | Settings → Usage and credits modal |
| `perplexity-F-settings-prefs.png` | Settings → Preferences (theme, font, AI model) |

---

## Critical correction: Perplexity DOES have a right rail

Earlier analysis was wrong. Perplexity Computer has a **persistent right rail** at ~180px wide, always visible alongside the chat. It is **not** a slide-in panel — it is a fixed, narrow contextual column that shows:

- **Artefacts**: links to files produced in this session (e.g. "Japan IT Services Monitor", "watchlist.json")
- **Sources**: connectors used ("Connectors · 2 ↗")
- **Usage**: credits consumed + worked-for duration (e.g. "1,546.09 credits · 38m 11s")

The right rail is **narrow and quiet** — it doesn't compete with the chat, it complements it. This is different from Kimi Web's SidePanel (which slides in and replaces content) and different from what Manus does.

**The Manus right rail** (as the user correctly noted) is more powerful: it shows the live agent workspace — browser, terminal, files, thinking — in a full-panel view alongside the chat. That's the pattern we actually want to reference for ONEVibe's P9-15.

---

## The three right-rail models to synthesise

```
Perplexity Computer        Kimi Web                  Manus
──────────────────         ────────────────           ──────────────────────
[Chat        │ Rail]       [Chat  │ SidePanel]        [Chat  │  Live workspace]
              ~180px              ~360px, slide-in          ~50% width
              fixed                contextual               always on
              artefacts,           thinking,                browser/terminal/
              sources,             diffs,                   files, thinking
              usage                subagents                in real-time
```

**ONEVibe target**: Manus-style live workspace panel (P9-15), with a narrower Perplexity-style persistent rail for artefacts + governance status (P9-20 dependency).

---

## Layout architecture (from screenshots)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Sidebar (90px icon+label)  │  Chat main column     │  Right rail     │
│                            │                       │  (~180px fixed) │
│  [*] logo                  │  ┌─────────────────┐  │                 │
│  + New                     │  │ session header  │  │  Artefacts      │
│  Computer                  │  │ ─────────────── │  │  > file 1  ↓   │
│  Spaces                    │  │ user message    │  │  > file 2  ↓   │
│  Artefacts                 │  │                 │  │                 │
│  Customise                 │  │ ✓ Completed     │  │  Sources        │
│  ───────────               │  │   40 steps  ↓   │  │  Connectors ↗  │
│  Connectors                │  │                 │  │                 │
│  Skills                    │  │ assistant reply │  │  Usage          │
│  Workflows                 │  │                 │  │  1,546 credits  │
│  Memory                    │  │ terminal blocks │  │  38m 11s        │
│  ───────────               │  │ inline          │  │                 │
│  History                   │  │                 │  │                 │
│  [avatar] username         │  │ [composer]      │  │                 │
│                            │  └─────────────────┘  │                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Pattern 1: "Completed N steps" — collapsed execution trace

The step list in `perplexity-C-steps-list.png` is the clearest example. 40 steps, all collapsed behind a single header. Each row is a plain-English verb phrase:

```
✓ Completed 40 steps  ↓

  ⟳ Loading skill finance/finance-markets
  ✓ Listing existing tracking files for this scheduled briefing
  ✓ Reading cron_tracking/cac7b/ed/run_state.json
  ✓ Reading cron_tracking/cac7b/ed/last_email_payload.json
  ✓ Reading japan_it_monitor/watchlist.json
  ✓ Checking available finance connector tools for quotes and historical prices
  ✓ Fetching tool details
  ✓ Fetching live quotes for Japan IT services watchlist plus USD/JPY
  ✓ Fetching daily close history since early January for YTD calculations
  ✓ Downloading quote and history CSVs returned by the finance connector
  ✓ Writing to japan_it_monitor/compute_briefing.py
  ✓ Fetching USD/JPY spot (FX) for context
  ✓ Computing day and YTD moves from finance CSVs
  ... (more)
  ✓ Sending notification: Japan IT alert: Hitachi -5.08% (>3.0% threshold)
  ✓ Writing to cron_tracking/cac7b/ed/run_state.json
```

**Key rules:**
- File paths are shown as-is (file names are meaningful to this user)
- Step icons: ✓ (done), ⟳ (loading/in-progress)
- Each step is ONE line — no sub-detail inline, no arguments shown
- Chevron `↓` to expand the full list; default is collapsed on completion

**ONEVibe gap**: Raw `tool_use` JSON. Action: build `StepTrace` component (P9-19).

---

## Pattern 2: Terminal output inline (not in a panel)

`perplexity-B-terminal-inline.png` shows terminal blocks directly in the chat column — NOT offloaded to the right panel. Each block:
- Dark background terminal window
- Shows the command at top (the `curl` command or `ls` command)
- Shows stdout output below
- Clean monospace, no wrapping

The right rail is **not** used for terminal output — terminals are inline. The right rail is only for persistent artefacts and metadata.

**ONEVibe implication**: For P9-15, keep terminal/code output inline in the chat. The right panel (Manus-style) is for: thinking traces, file diffs, subagent workspace — the richer/longer content.

---

## Pattern 3: Right rail — artefacts as persistent session links

`perplexity-A-chat-right-rail.png` and `perplexity-D-usage-panel.png` show the right rail clearly:

- **Artefacts section**: produced files linked by name, with a download/open icon. Always visible — doesn't disappear as conversation scrolls.
- **Sources section**: which connectors were used, with a count badge and link to view
- **Usage section**: credits consumed (Text: 1,546.09) and time worked (38m 11s). Can expand to show a breakdown by modality (Text/Image/Video/Audio).

This rail is the answer to "what did this session produce and cost?" — always answerable without scrolling back.

**ONEVibe implementation for P9-20**: A narrow persistent right column on the task view showing: produced artefacts (linked), connectors used, VTI governance status (approved/pending/blocked), time elapsed.

---

## Pattern 4: Plain-English composer with skill mode toggle

The composer bar at the bottom shows:
- Text input: "Type a command..."
- Left: `+` attachment / `Computer` mode chip (tappable — switches between Computer / Search / etc.)
- Right: `Orchestrator ▼` model selector + voice + send

The `Computer` mode chip is key — it tells the user they're in "agentic mode" vs "search mode". Simple, clear.

**ONEVibe gap**: our composer doesn't surface which agent mode is active. The runtime picker is buried. This maps to our `RuntimeSelector` UX — it should be a chip in the composer, not a modal.

---

## Pattern 5: Settings architecture — the Computer section

`perplexity-E-settings-credits.png` and `perplexity-F-settings-prefs.png` show the settings modal has two sections:

**Account**: Account, Preferences, Personalisation, Memory settings, Notifications, Usage and credits, Analytics

**Computer** (separate section): Configuration, Connectors, Skills, Memory, Credential vault

This distinction is meaningful: Computer settings are agent-specific. Users understand they are configuring the agent, not their user account.

**ONEVibe gap**: our settings are flat. We should group: User settings vs. Agent/Computer settings vs. Governance settings (the ONEComputer stuff).

---

## Pattern 6: Usage visibility — credits as a first-class concept

The usage section in `perplexity-D-usage-panel.png`:
- "Credits used: 1,546.09"  — the full session cost
- "Worked for: 38m 11s"     — wall-clock time
- Breakdown: Text / Image / Video / Audio credits used separately

This is radical transparency about cost and time. For a professional user it answers: "Was this agent run worth it?"

**ONEVibe equivalent**: not credits, but: "Model calls: N", "Tokens: ~Xk", "Connectors accessed: 3", "Duration: Xm Ys". This belongs in the right rail or the session summary.

---

## The fundamental design synthesis

After seeing both Perplexity Computer and studying Kimi Web, with the user's note about Manus:

| Dimension | Perplexity | Kimi Web | Manus | **ONEVibe target** |
|---|---|---|---|---|
| Execution trace | Collapsed "N steps", plain English | Full thinking blocks visible | Full live workspace panel | Collapsed by default (P9-19), expandable per step |
| Right rail | Narrow fixed: artefacts + usage | Slide-in 360px: thinking/diff/agents | Wide fixed: live browser/terminal/files | **Two-layer**: narrow persistent rail (artefacts + governance status) + wide slide-in for live workspace (Manus pattern) |
| Terminal output | Inline in chat | Inline in chat | In right workspace panel | Inline in chat |
| Artefacts | Right rail links + gallery page | Inline in chat | Right workspace panel | Right rail (persistent links) + gallery page (P9-20) |
| Theme | White + light sidebar | Dark | Dark | White default (P9-23), dark optional |
| Audience signal | Knowledge worker | Developer | Developer/power user | Investment professional |

---

## Revised P9 priority order for ONEVibe

1. **P9-19** StepTrace: collapsed "N steps" + plain-English labels — removes the biggest intimidation factor
2. **P9-15** Right rail (two-layer): narrow persistent artefacts/governance rail + Manus-style live workspace slide-in
3. **P9-20** Artefacts gallery page (full-page view, versioned, shareable)
4. **P9-21** Capabilities/Skills discovery page
5. **P9-16** Tool group consolidation in AssistantThread
6. **P9-22** Memory management page
7. **P9-24** Composer mode chip (runtime as chip, not modal)
8. **P9-17** Thinking block: live window + auto-collapse
9. **P9-23** Light mode as default
10. **P9-18** ContextRing token usage

---

## What Manus does that we should reference for P9-15

The user specifically flagged Manus's right rail as the gold standard. Key characteristics (from prior knowledge of the product):
- **Wide** (~45-50% of screen width) — not a narrow strip
- **Always on** — doesn't slide in/out, it's the permanent companion to chat
- **Shows the live agent workspace**: browser tab rendering, file tree, terminal with live output, thinking trace
- **Tabs** within the panel: Browser / Terminal / Files / Thinking
- Users can **watch the agent work in real time** in the panel while the chat column shows the narrative

For ONEVibe: the right panel should show the **governed sandbox** live — what the agent is doing inside the ONEComputer-managed execution environment. This makes governance tangible, not abstract.
