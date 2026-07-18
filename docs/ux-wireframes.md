# ONEVibe UX Wireframes

> Phase 2 deliverable. Target layouts for the rebuild, in ASCII.
> Structure preserves the audited routes/DOM contracts (`docs/ux-audit.md` §D);
> visuals follow `docs/ux-design-system.md`. Sidebar = 252px, topbar = 48px,
> content max = 960px unless noted. All chrome not listed here (traffic lights,
> fake URL bars, glow shadows, 42px heroes) is deleted.

---

## 1. Home / new task (`/`)

```
┌────────┬──────────────────────────────────────────────────────────────────────────────┐
│        │ ⌄ ONEVibe                              Home            ○ system  🔔  ⬒  👤    │ topbar 48px
│ SIDEBAR├──────────────────────────────────────────────────────────────────────────────┤
│        │                                                                              │
│ (§2)   │        Good afternoon, Gini                         ← --text-2xl/600,       │
│        │                                                              the only display│
│        │        ┌──────────────────────────────────────────────────────────────┐      │
│        │        │ How can I help you today?                            ▲ send  │      │
│        │        │                                                      (circle)│      │
│        │        ├──────────────────────────────────────────────────────────────┤      │
│        │        │ 📎 Attach  🔗 Reference │ General ▾  Claude ▾  Model ▾       │      │
│        │        └──────────────────────────────────────────────────────────────┘      │
│        │              composer, max 720px, radius-lg, border-default                  │
│        │                                                                              │
│        │        ┌─ Active now ────────────────────────────────────────────────┐       │
│        │        │ ● claude   Research SoftBank's portfolio      3m 12s   →    │       │
│        │        │ ● kimi     Draft board memo                   1m 04s   →    │       │
│        │        └─────────────────────────────────────────────────────────────┘       │
│        │              only when runs exist; rows are buttons to /tasks/:id            │
│        │                                                                              │
│        │        Recent                                          View all →            │
│        │        ┌──────────────────────────────────────────────────────────────┐      │
│        │        │ ● completed  Research SoftBank's portfolio      2h ago       │      │
│        │        │ ◌ failed     Draft board memo                   5h ago       │      │
│        │        └──────────────────────────────────────────────────────────────┘      │
│        │              real list (the current display:none dead section, revived)      │
└────────┴──────────────────────────────────────────────────────────────────────────────┘
```

- No eyebrow, no lede, no template-gallery chrome. Greeting is the single
  `--text-2xl` element in the app.
- Composer pickers: icon + label ghost buttons, `--text-sm`; popovers per DS §5.7.
- Demo-provider note: info-soft one-liner above composer, `--text-xs` (`role="status"`).

## 2. Sidebar

### 2.1 Expanded (252px)

```
┌────────────────────────────┐
│ ▪ ONEVibe              ⌘K  │ brand, 40px row
│ ┌────────────────────────┐ │
│ │ ＋ New task            │ │ primary button, full width, 28px
│ └────────────────────────┘ │
│ 🔍 Search…                 │ input, 28px
│                            │
│ ▦ Board                    │ ┐
│ ◷ Schedules                │ │
│ ✦ Skills                   │ │ nav section --text-sm/500
│ ▣ Artefacts                │ │ (see DS §5.1)
│ ⛭ Computers                │ │
│ ▤ Library                  │ ┘
│                            │
│ PROJECTS                   │ kicker --text-xs uppercase faint
│ ▾ ONEVibe              ＋  │ active project row
│   ⌁ epic: Q3 research      │ epic chip row (only when epics exist)
│                            │
│ ACTIVE                     │ kicker (only when runs exist)
│ ● Research SoftBank…  3m   │ ActiveNowPanel rows → task
│                            │
│ RECENT                     │ kicker
│ ⌁ Q3 · Research SoftBank…  │ ┐ conversation rows:
│   completed · 2h ago       │ │ epic chip + title (--text-sm)
│ ○ Draft board memo         │ │ status + time (--text-xs faint)
│   running · 5h ago         │ ┘
│ Load more                  │ ghost, centered
├────────────────────────────┤
│ ● Connected  ·  en ⇄ 中文  │ footer status row, --text-xs
└────────────────────────────┘
```

- Sections separated by `--space-4` + kicker labels, not divider lines.
- Project-knowledge blob moves out of the nav blob into the project section
  (collapsible `<details>`), same data, no 3,400-char JSX monolith.
- Search filters the conversation list (server-side ≥2 chars, 180ms debounce).

### 2.2 Collapsed (48px rail)

```
┌────┐
│ ▪  │ brand mark only
│ ＋ │ new task (icon button)
│ 🔍 │
│ ▦  │ ┐ nav icons, 28px hit area,
│ ◷  │ │ tooltip on hover (title attr),
│ ✦  │ │ active = --accent-soft fill
│ ▣  │ │
│ ⛭  │ ┘
│    │
│ ●  │ active-runs count dot
│    │
│ 👤 │ account / theme
└────┘
```

- Auto-collapses ≤1250px on task routes (existing rule); toggle in topbar.
- Mobile (<960px): slides over content with backdrop (z 29/30 ladder preserved),
  close control reachable in-panel.

## 3. Board view (`/?view=board`)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Board                                              [▦ Kanban | ☰ List]               │ h1 --text-xl
│ Agent ▾   Run ▾                                       2 active                       │ filter row 32px
├───────────────┬───────────────┬───────────────┬───────────────┬──────────────────────┤
│ ○ Todo      3 │ ◐ In progress 2 │ ● Done     12 │ ◼ Blocked   1 │ ✕ Cancelled   0    │ 5 columns
│ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌───────────┐ │ ┌──────────────┐   │ (grid fixed:
│ │○ Todo ▲Hi  │ │ │◐ Prog ●Med│ │ │● Done ○Low│ │ │◼ Block ▲Ur│ │ │  empty state │   │  repeat(5,…))
│ │Research   │ │ │Draft memo │ │ │GeBIZ scan │ │ │Sandbox API│ │ │              │   │
│ │SoftBank   │ │ │           │ │ │           │ │ │           │ │ │              │   │
│ │ONEVibe·2h │ │ │@claude ●L │ │ │finance·1d │ │ │@kimi · 3d │ │ │              │   │
│ └───────────┘ │ └───────────┘ │ └───────────┘ │ └───────────┘ │ └──────────────┘   │
│ ┌───────────┐ │ ┌───────────┐ │               │               │                      │
│ │ …         │ │ │ …         │ │               │               │                      │
│ └───────────┘ │ └───────────┘ │               │               │                      │
├───────────────┴───────────────┴───────────────┴───────────────┴──────────────────────┤
│ ⚡ Active now   ● claude · Research SoftBank's portfolio · 3m 12s   ● kimi · memo 1m │ strip (only
└──────────────────────────────────────────────────────────────────────────────────────┘ when runs)
```

- Column header: status dot + label + count (`--text-sm`/500, count faint).
- Cards per DS §5.2. Status/priority chips are inline pickers (no modal).
- Columns scroll independently; board area is contained (no page-level scroll
  below the fold).
- List mode: same data, sortable table (Title/Priority/Status/Updated), 32px rows.

## 4. Task detail (`/tasks/:id`)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Research SoftBank's portfolio        ● running · claude · Connected   ⤴ Share ⋯    │ topbar
├───────────────────────────────────────────┬──────────────────────────────────────────┤
│ THREAD (assistant-ui)                     │ WORKSPACE                                │
│                                           │ [Preview][Computer][Files][Versions][…]  │ tab bar 36px,
│ ┌ Milestones ────────────── 2/4 ────────┐ │ ┌──────────────────────────────────────┐ │ scrollable,
│ │ ✓ Understand  ✓ Gather  ◐ Draft  ○ Fin│ │ │                                      │ │ not 16 crammed
│ └───────────────────────────────────────┘ │ │   COMPUTER TIMELINE                  │ │
│                                           │ │   ────────────────────────────────   │ │
│ ┌───────────────────────────────────────┐ │ │   10:41:02 ▶ tool_call_started       │ │
│ │ You · 10:41                           │ │ │   10:41:04 ✓ tool_call_completed     │ │
│ │ Research SoftBank's portfolio…        │ │ │   10:41:09 ◆ artifact_created        │ │
│ └───────────────────────────────────────┘ │ │   10:41:15 ▮ screenshot (rail)       │ │
│                                           │ │                                      │ │
│ ┌───────────────────────────────────────┐ │ │   rail: event rows --text-sm,        │ │
│ │ Assistant · turn 3        ● streaming │ │ │   status glyph + timestamp           │ │
│ │ Here's what I found so far…           │ │ │   --text-faint mono→(UI font)        │ │
│ │ ▣ tool: web_search ✓ 0.8s             │ │ │                                      │ │
│ │ ▣ tool: file_write  ✓                 │ │ │                                      │ │
│ │ ▍                                     │ │ │                                      │ │
│ └───────────────────────────────────────┘ │ │                                      │ │
│                                           │ │                                      │ │
│ ┌─ Approval required ───────────────────┐ │ │                                      │ │
│ │ VTI wallet approval · intent 8f3a2c…  │ │ │                                      │ │
│ │ [ Open wallet ]                       │ │ │                                      │ │
│ └───────────────────────────────────────┘ │ │                                      │ │
│                                           │ │                                      │ │
│ ┌───────────────────────────────────────┐ │ │                                      │ │
│ │ Follow up…                        ▲   │ │ │                                      │ │
│ └───────────────────────────────────────┘ │ │                                      │ │
├───────────────────────────────────────────┴──────────────────────────────────────────┤
│ Reasoning trace (SidePanel, 360px, slides over workspace when open)                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- 55/45 split at ≥1280px; workspace stacks below thread below 1100px.
- Milestone strip collapsible, sits above messages (existing `MilestoneProgress`).
- Tool calls: single-line chips (icon, name, duration/status glyph) — no giant
  cards, no glow progress bars.
- Magic heights (`calc(100vh - 258px)`) replaced by flex column layout:
  topbar / milestones / scrollable thread / composer.
- Workspace tabs: consolidated from 16 → 6 visible (Preview, Computer, Files,
  Versions, Validation, Evidence); the `?tab=` contract and values unchanged.
  Overflow tabs live in a `⋯` menu, same tab ids.

## 5. Computers / runtimes (`/?view=computers`)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Computers                                                                            │ h1 --text-xl
├──────────────────────────────────────────────────────────────────────────────────────┤
│ RUNTIMES                                    refreshed 12s ago  [ Test all ]          │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐                 │
│ │ Claude        ● ok │ │ Kimi          ● ok │ │ Codex        ◌ down│                 │
│ │ claude-sonnet-5    │ │ kimi-k2            │ │ —                  │                 │
│ │ 142ms · default    │ │ 310ms              │ │ last error 2h ago  │                 │
│ │ [ Test ]           │ │ [ Test ]           │ │ [ Test ]           │                 │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘                 │
│   cards: --surface-panel, name --text-base/600, status dot + --text-xs,              │
│   meta --text-xs faint, ghost test button                                            │
│                                                                                      │
│ GOVERNED RUNTIME                                                                     │
│ ┌────────────────────────────────────────────────────────────────────────────────┐   │
│ │ ONEComputer sandbox     not connected            [ Learn more → ]              │   │
│ └────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│ MCP SERVERS                                                        [ + Add server ]  │
│ ┌────────────────────────────────────────────────────────────────────────────────┐   │
│ │ graphiti        ● healthy · 2 tools        cmd: npx graphiti-mcp      [⋯ menu] │   │
│ │ filesystem      ◌ unreachable                cmd: npx @mcp/fs         [⋯ menu] │   │
│ └────────────────────────────────────────────────────────────────────────────────┘   │
│   rows 40px, name --text-base/500, health dot + --text-xs, command --text-xs faint   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- No eyebrow/lede/28px decorative icon. Section kickers (`--text-xs` uppercase)
  instead of hero headers.
- Stale-age text ticks on a 10s interval (fixes the never-re-render bug).
- Health states: `● ok` success, `◐ degraded` warning, `◌ down` danger,
  `— unknown` faint. Same glyph vocabulary as board statuses.

---

## Cross-view notes

- **Glyphs**: `● ◐ ◌ ○ ◼ ✓ ✕ ▲` + lucide 14px icons. One glyph vocabulary reused
  for run status, board status, and runtime health.
- **View headers**: h1 `--text-xl`/600 + optional one-line `--text-sm` muted
  description. The eyebrow+42px-hero pattern is deleted everywhere.
- **zh locale**: all wireframe copy comes from `i18n.ts`; layout must absorb
  ~30% longer CJK strings without truncation (nav items, chips).
- **Light mode**: identical layout; tokens per DS §1.2. Verified at 1280×800
  in both themes before ship.
