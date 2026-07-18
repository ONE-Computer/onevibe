# ONEVibe UI QA Report — 2026-07-18
> PM audit via Claude Browser at 1280×800 (desktop) and 375×812 (mobile).
> Reference standard: Perplexity Computer UX (consistent padding, restrained type scale, zero dead zones, contained scroll).

---

## Summary verdict

Current readiness: **~4/100** vs Perplexity parity target.
Six high-impact structural issues found. All are CSS-only or layout fixes — no logic changes required.

---

## Issues (ranked by visual impact)

### UI-01 — Kanban board has no contained scroll (CRITICAL)

**Symptom:** The whole page scrolls on the Board view. A Done column with 15 tasks makes the page 1395px tall; at 1280×800 you scroll 595px and the board goes off screen. Kanban columns should scroll independently within a fixed-height container.

**Root cause:** `.board-view` has no height constraint — it grows with content and body-scrolls.

**Fix:**
```css
.board-view {
  height: calc(100vh - 56px);   /* 56px = topbar */
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.kanban-columns {                /* whatever the column wrapper is */
  flex: 1;
  min-height: 0;
  overflow-x: auto;
  display: flex;
  gap: 12px;
}
.kanban-column {
  overflow-y: auto;
  flex: 0 0 240px;
}
```

---

### UI-02 — Padding system has two incompatible standards (HIGH)

**Symptom:** Navigating between views produces jarring shifts. Two completely different padding systems coexist:

| View | Top | Horizontal | Max-width |
|---|---|---|---|
| Skills | 68px | ~90px (7vw @ 1280px) | — |
| Computers | 68px | ~90px (7vw) | 1060px |
| Appearance | 68px | ~90px | — |
| Homepage | 68px | ~90px | — |
| Artefacts | 28px | 32px | 900px |
| Capabilities | 28px | 32px | — |
| Board | 24px | 24px | 1200px |

Artefacts and Capabilities feel cramped (32px horizontal). Skills/Computers feel wide but inconsistent with the narrow views. Board at `max-width:1200px` is 200px wider than Artefacts (900px).

**Fix:** Standardize all content views to a single layout system:
```css
/* Add to :root */
--layout-content-max: 960px;
--layout-view-pad-top: 48px;
--layout-view-pad-x: 48px;
--layout-view-pad-bottom: 80px;

/* Apply uniformly */
.skills-view,
.computers-view,
.appearance-view,
.homepage-editor-view,
.artefacts-view,
.capabilities-view {
  padding: var(--layout-view-pad-top) var(--layout-view-pad-x) var(--layout-view-pad-bottom);
  max-width: var(--layout-content-max);
}
```
Board keeps its own layout (see UI-01).

---

### UI-03 — Short-content views show large dark void below (HIGH)

**Symptom:** Appearance and Homepage both render an empty-state (owner-scoped theme store not configured). At 1280×800 the content is ~320px; `.main-shell { min-height:100vh }` leaves 480px of dark `#0b0d0c` background below. Feels broken.

**Fix:** Views that might have short content should fill available height:
```css
.appearance-view,
.homepage-editor-view {
  min-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
}
```
Also: Capabilities view has 292px dead zone for the same reason — add it to the list.

---

### UI-04 — h1 eyebrow label missing on most views (MEDIUM)

**Symptom:** Perplexity and Linear both show a small uppercase eyebrow label above the h1 (e.g. "Runtimes" above "Computers"). ONEVibe only shows raw h1 with no contextual category label, making views feel context-less when navigating.

Currently only Computers has an eyebrow ("Runtimes"). Skills, Artefacts, Capabilities have none.

**Fix:** Add a consistent `.view-eyebrow` element pattern:
```html
<span class="view-eyebrow">Output files</span>
<h1>Artefacts</h1>
```
```css
.view-eyebrow {
  display: block;
  font: 500 10px var(--font-ui);
  text-transform: uppercase;
  letter-spacing: .10em;
  color: var(--text-faint);
  margin-bottom: 6px;
}
```
Views to update: Skills, Artefacts, Capabilities, Appearance, Homepage.

---

### UI-05 — Mobile sidebar has no backdrop scrim (MEDIUM)

**Symptom:** At 375px the sidebar slides over the main content with no dimming overlay. There is no way to close it by clicking outside — Escape key does nothing. Users are stranded.

**Fix:**
```css
/* Add to mobile breakpoint */
@media (max-width: 960px) {
  .sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.55);
    z-index: 25;
    cursor: pointer;
  }
  .sidebar {
    z-index: 30;  /* stays above backdrop */
  }
}
```
Wire `.sidebar-backdrop` click → close sidebar in the toggle handler.

---

### UI-06 — Board max-width (1200px) inconsistent with other views (LOW)

**Symptom:** Board is 200–300px wider than other content views. Jumping from Board to Artefacts shrinks the content gutter noticeably.

**Fix:** Once UI-01 lands (contained board), board fills available width naturally — no max-width needed. Remove `max-width: 1200px` from `.board-view`.

---

## Scrolling behavior summary

The user's core complaint is "inconsistent scrolling." Root cause: ONEVibe uses body scroll (document scrolls) rather than per-view scroll. This means:

- Topbar is `sticky` ✓ (correct)
- Sidebar is `position:fixed` ✓ (correct)  
- BUT: switching views resets scroll to 0 but if view content is short, the previous scroll position may leave blank space visible
- Board: body scroll is wrong for kanban — fix is UI-01

After UI-01 and UI-02 land, scrolling will feel consistent: all nav views (sidebar links) are body-scroll with padding, and the board is a self-contained scroll region.

---

## What's already good

- Token system is solid — `--surface-*`, `--text-*`, `--accent` are well-structured
- Dark/light mode switch works
- Typography scale (`--font-size-xs` through `--font-size-xl`) is defined but not consistently used
- Topbar is visually clean with blur backdrop
- Task detail split-pane layout is correct
- Mobile responsive breakpoints exist (960px, 600px)
- Motion/animation respects `prefers-reduced-motion`

---

## Priority order for Session A

1. **UI-01** — Board contained scroll (biggest visual regression)
2. **UI-02** — Padding standardization (most impactful cross-view consistency)
3. **UI-03** — Dead zone elimination for Appearance/Homepage/Capabilities
4. **UI-04** — Eyebrow labels (quick, high Perplexity-parity value)
5. **UI-05** — Mobile sidebar backdrop
6. **UI-06** — Board max-width cleanup (do after UI-01)

Gate must stay ≥ 385 tests / 70 files after each fix.
