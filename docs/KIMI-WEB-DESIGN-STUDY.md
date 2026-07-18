# Kimi Code Web — Design Study for ONEVibe
> Studied: 2026-07-18. Source: https://github.com/MoonshotAI/kimi-code/tree/main/apps/kimi-web
> Purpose: competitive intelligence + patterns to adopt in ONEVibe's agentic chat UX.

---

## Stack (for reference)
- Vue 3 (Composition API) + Vite 6 + TypeScript
- Pure CSS custom properties — no Tailwind, no CSS-in-JS
- Inter Variable + JetBrains Mono Variable (proper variable fonts)
- markstream-vue for streaming-aware markdown
- xterm.js v6 for embedded terminal

---

## Layout architecture

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (264px, resizable)  │  Chat column  │  SidePanel│
│  ┌──────────────────────────┐│  ┌──────────┐ │  ┌───────┐│
│  │ logo + workspace list    ││  │ header   │ │  │ diff  ││
│  │ session rows             ││  │ messages │ │  │ think ││
│  │  └ busy spinner / badge  ││  │ composer │ │  │ agent ││
│  └──────────────────────────┘│  └──────────┘ │  └───────┘│
│  ResizeHandle (4px drag)     │               │  slide-in  │
└─────────────────────────────────────────────────────────┘
```

Key insight: **the right SidePanel keeps the message stream clean**. Thinking traces, file diffs, and subagent detail all open there — never inline-expanded past a teaser in the chat.

---

## Patterns ONEVibe should adopt

### 1. Contextual right panel (P9-15) ← highest value
The SidePanel opens contextually for:
- **Thinking blocks**: auto-collapses to last paragraph teaser after streaming; full text in panel
- **Edit tool diffs**: `+N −M` chip in the tool row; clicking opens DiffPanel in the right panel
- **Subagent detail**: "Open Detail" button → AgentDetailPanel (only appears when a matching task exists)

Implementation:
- Panel width: ~360px, slides in from right
- Open/close: `0.26s cubic-bezier(0.16,1,0.3,1)` width transition
- Managed by a single `sidePanelContent` reactive state — only one thing open at a time
- Chat column shrinks to accommodate (flex layout)

### 2. Tool group consolidation
Consecutive tool calls group under a single collapsible `ToolGroup` header:
- Header: aggregate status dot + tool count + "N tool calls" label + rotating chevron
- Body collapses with `grid-template-rows: 0fr/1fr` (see pattern 3)
- First/middle/last cards get different border-radius via `stackPosition` prop (creates stacked card visual)

**ONEVibe gap**: `ComputerTimeline` does this for evidence rail (P5-14), but `AssistantThread` chat stream doesn't. Tool calls in chat appear as individual items — needs a `ToolGroup` wrapper component.

### 3. CSS `grid-template-rows: 0fr/1fr` collapse ← easy win
```css
/* WRONG — what we currently do */
.collapsible-body { max-height: 0; overflow: hidden; transition: max-height 0.2s; }
.collapsible-body.open { max-height: 9999px; } /* arbitrary large value, jank on close */

/* RIGHT — Kimi's pattern */
.collapsible-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.2s; }
.collapsible-body > * { min-height: 0; overflow: hidden; } /* critical — inner must have min-height:0 */
.collapsible-body.open { grid-template-rows: 1fr; }
```
Pair with `inert` attribute on collapsed content (see pattern 4).
iOS Safari note: inner scrollable containers need explicit `min-height: 0` or collapse breaks.

### 4. `inert` attribute for collapsed content
```tsx
<div className="collapsible-body" aria-hidden={!open}>
  <div inert={!open || undefined}>  {/* removes from focus + a11y tree */}
    {children}
  </div>
</div>
```
Better than `visibility:hidden` or `display:none` — no ARIA hacking needed.

### 5. Thinking block: live window → auto-collapse → side panel
During streaming:
- Show a 5-line scrolling window pinned to bottom (CSS: `overflow:hidden`, fixed height, `scroll-snap`)
- Subtle "thinking..." label with animated dot

After streaming completes:
- Auto-collapse to the last non-empty paragraph as a teaser
- No inline expand button — clicking opens the full thinking trace in the right SidePanel
- CSS: `grid-template-rows: 0fr/1fr` transition + JS to extract last paragraph

**ONEVibe gap**: we have no thinking block handling at all. When we add Claude extended thinking or Kimi's thinking output, this is the exact pattern to use.

### 6. ContextRing — token usage in composer toolbar
A compact arc in the toolbar right shows context fill (0–100%).
- At ≥80%: a `/compact` chip appears inline as a low-friction affordance
- At ≥95%: ring turns warning color
- Tooltip shows: "X / Y tokens · K% context used"

**ONEVibe gap**: no context visibility. This is a high-value low-effort power-user feature.

### 7. Boot script for theme flash prevention
```html
<!-- index.html — render-blocking, but tiny -->
<script src="/boot.js"></script>  <!-- applies data-color-scheme before bundle loads -->
```
```js
// boot.js
const scheme = localStorage.getItem('kimi-web.color-scheme') || 'system';
if (scheme === 'dark' || (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.setAttribute('data-color-scheme', 'dark');
}
```
**ONEVibe gap**: we have a brief theme flash on load. Same pattern fixes it. CSP-safe as an external file.

### 8. Hover-only action buttons (no layout reservation)
Kebab / action buttons use `opacity: 0; pointer-events: none` at rest.
The row label fills full width when idle. Actions appear on hover with no layout shift.
Better than reserving space for buttons that are usually invisible.

### 9. Scroll stability on history prepend
When loading older messages, anchor to `.turn-anchor[data-turn-id]` before inserting, preventing viewport jump. Relevant when we add conversation history pagination.

### 10. Approval card minimization
The approval/pending-action card (blocks the composer) has a minimize toggle.
Collapses to a thin warning band — user can keep reading while approval is pending.
The minimized state gets `inert` so it's not in focus order.
**ONEVibe relevance**: needed for P9-08 (approval notifications in task view).

---

## Design token comparison

| Token | Kimi Web | ONEVibe | Action |
|---|---|---|---|
| UI font | Inter Variable | Inter (static) | Upgrade to variable font |
| Mono font | JetBrains Mono Variable | system-ui mono | Add JetBrains Mono Variable |
| Dark bg | `#0d1117` | current near-black | Consider aligning |
| Ease curve | `cubic-bezier(0.16,1,0.3,1)` | same ✅ | — |
| Duration base | `160ms` | same ✅ | — |
| Spacing grid | 4px | 4px ✅ | — |
| Radius scale | xs=4 sm=6 md=8 lg=12 xl=16 2xl=20 | similar | Audit for alignment |
| Z-index scale | 0/100/200/250/300/400/600/9999 | ad-hoc | Formalise in index.css |
| `grid-rows` collapse | everywhere | max-height hacks | Migrate (see pattern 3) |
| `inert` on collapse | yes | no | Add (see pattern 4) |

---

## Implementation roadmap for ONEVibe

| Item | P-item | Effort | Value |
|---|---|---|---|
| Contextual right panel | P9-15 | L | ★★★★★ |
| Tool group consolidation in AssistantThread | P9-16 | M | ★★★★ |
| `grid-rows` collapse migration | CSS cleanup | S | ★★★ |
| `inert` on collapsed content | CSS/a11y | S | ★★★ |
| Thinking block: live window + auto-collapse | P9-17 | M | ★★★★ |
| ContextRing token usage | P9-18 | S | ★★★ |
| Boot script for theme flash | quick fix | XS | ★★ |
| Variable fonts (Inter + JetBrains Mono) | style | S | ★★ |
| Approval card minimization | P9-08 dependency | S | ★★★ |
