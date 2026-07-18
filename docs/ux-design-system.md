# ONEVibe Design System

> Phase 2 of the UX rebuild. The visual contract every rebuilt component must obey.
> Aesthetic bar: **Linear / Cursor / Raycast** — dark-mode first, dense, sharp,
> monochromatic with one accent. Palette and techniques grounded in
> [nexu-io/open-design](https://github.com/nexu-io/open-design) (`linear-app`, `raycast`
> token packages), adapted from marketing pages to a console app.

## 0. Principles

1. **Darkness is the native medium.** Hierarchy comes from luminance steps
   (canvas → surface → raised), never from color variation or drop shadows.
2. **One accent.** Indigo is the only chromatic UI color. It means "interactive /
   active / primary". Status colors carry semantics and nothing else.
3. **Typography is the hierarchy.** Size + weight + color rank information.
   No decorative chrome: no gradients, no glows, no traffic lights, no fake URL
   bars, no clip-path notches, no skeuomorphs.
4. **Density with legibility.** 13px body, 11px floor. The old 8–10px type is gone.
5. **Every pixel earns its place.** If a border, shadow, or animation doesn't
   separate or explain, delete it.

---

## 1. Color tokens

Token names are the **tenant-theme contract** (`themeVariableMap` in
`src/lib/theme.ts` writes these inline) — names must not change.

### 1.1 Dark theme (default, `:root`)

| Token | Value | Use |
|---|---|---|
| `--surface-canvas` | `#08090a` | App background |
| `--surface-sidebar` | `#0c0d0e` | Sidebar only — half-step above canvas |
| `--surface-panel` | `#101112` | Panels, cards, board columns |
| `--surface-raised` | `#18191b` | Popovers, dropdowns, modals, hover fills |
| `--border-subtle` | `rgba(255,255,255,0.05)` | Row separators, inner dividers |
| `--border-default` | `rgba(255,255,255,0.08)` | Card containment, inputs |
| `--border-strong` | `rgba(255,255,255,0.14)` | Hover borders, focused inputs, emphasized separation |
| `--text-primary` | `#f7f8f8` | Titles, primary content (never pure white) |
| `--text-secondary` | `#d0d6e0` | Body text |
| `--text-muted` | `#8a8f98` | Metadata, placeholders, secondary labels |
| `--text-faint` | `#62666d` | Timestamps, disabled, kicker labels |
| `--accent` | `#5e6ad2` | Primary CTA bg, active nav, selected states |
| `--accent-strong` | `#828fff` | Hover state of accent, accent text on dark |
| `--accent-ink` | `#ffffff` | Text/icons on accent background |
| `--accent-soft` | `rgba(94,106,210,0.14)` | Accent-tinted fills (active nav bg, selected chips) |

### 1.2 Light theme (`[data-theme="light"]`)

| Token | Value |
|---|---|
| `--surface-canvas` | `#f7f7f8` |
| `--surface-sidebar` | `#f0f0f2` |
| `--surface-panel` | `#ffffff` |
| `--surface-raised` | `#ffffff` |
| `--border-subtle` | `rgba(0,0,0,0.05)` |
| `--border-default` | `rgba(0,0,0,0.09)` |
| `--border-strong` | `rgba(0,0,0,0.16)` |
| `--text-primary` | `#1b1c1f` |
| `--text-secondary` | `#3c4048` |
| `--text-muted` | `#6e7278` |
| `--text-faint` | `#9ba0a6` |
| `--accent` | `#4f54c4` |
| `--accent-strong` | `#454bb0` |
| `--accent-ink` | `#ffffff` |
| `--accent-soft` | `rgba(79,84,196,0.10)` |

Light mode keeps accent slightly darker (`#4f54c4`) to hold ≥4.5:1 contrast on white.

### 1.3 Accent justification

**Indigo `#5e6ad2` (Linear's brand family).** The stated bar is "belongs next to
Linear and Cursor"; Linear's system is an achromatic console punctuated by a single
indigo — exactly the brief's "monochromatic with one accent". Indigo reads as
precision and trust, which matches ONEVibe's evidence-first brand. Green stays
reserved for `success` semantics; red for danger — neither can double as the
interactive accent without semantic collision.

### 1.4 Status colors

| Token | Dark | Light | Use |
|---|---|---|---|
| `--status-success` | `#4cb782` | `#1f7a4d` | completed, healthy, approved |
| `--status-warning` | `#e5b567` | `#9a6a00` | blocked, degraded, pending review |
| `--status-danger` | `#eb5757` | `#c43232` | failed, denied, destructive |
| `--status-info` | `#6ea8fe` | `#2b6cb8` | running, streaming, informational |
| `--status-cancelled` | `#8a8f98` | `#6e7278` | cancelled/expired (= muted) |

Each status also gets a soft fill: `color-mix(in oklab, var(--status-X) 14%, transparent)`
computed at use-site, not a token.

---

## 2. Typography

### 2.1 Font stack (system only — offline-first, no web fonts)

```css
--font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
           Roboto, "Helvetica Neue", Arial, sans-serif;
```

One family everywhere. **No monospace, no serif, anywhere** (repo rule — code,
evidence, hashes, and logs render in the UI font at `--text-sm`).

### 2.2 Scale

| Token | Size / line-height | Use |
|---|---|---|
| `--text-xs` | 11px / 1.4 | chips, badges, table metadata, kicker labels |
| `--text-sm` | 12px / 1.45 | secondary text, nav items, card metadata |
| `--text-base` | 13px / 1.5 | **default UI text**, buttons, inputs, lists |
| `--text-md` | 14px / 1.5 | composer input, message bodies |
| `--text-lg` | 16px / 1.35 | panel/section titles |
| `--text-xl` | 20px / 1.25 | view h1 |
| `--text-2xl` | 24px / 1.2 | the one home greeting — nothing else |

### 2.3 Weight rules

- `400` — body, descriptions.
- `500` — nav items, buttons, labels, chips. (The Linear "510" middle weight.)
- `600` — h1/h2, card titles, emphasized values.
- Never `700+`. No `text-transform: uppercase` below `--text-sm`; kickers may use
  uppercase at `--text-xs` with `letter-spacing: 0.04em` only.
- Tracking: `0` everywhere except h1 (`-0.01em`) and the home greeting (`-0.02em`).

---

## 3. Spacing + radius

### 3.1 Spacing (4px base)

`--space-1:4px · --space-2:8px · --space-3:12px · --space-4:16px · --space-5:20px · --space-6:24px · --space-8:32px · --space-10:40px · --space-12:48px`

Usage: component internal padding = `--space-2`/`--space-3`; card padding =
`--space-3`/`--space-4`; view gutters = `--space-6`; section gaps = `--space-8`.
Layout constants: `--layout-nav-height:48px`, `--layout-sidebar-width:252px`,
`--layout-content-max:960px`.

### 3.2 Radius (sharp, not soft)

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 4px | chips, badges, small buttons, inputs |
| `--radius-md` | 6px | cards, buttons, popovers |
| `--radius-lg` | 8px | modals, panels, composer |
| `--radius-pill` | 999px | status dots and pill filters only |

No radius above 8px on any surface. No nested rounded cards inside rounded cards
without 1px `--border-subtle` separation.

---

## 4. Elevation, focus, motion

```css
/* Dark: luminance stepping + border-as-shadow. Popovers/modals only. */
--elev-raised: 0 2px 4px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05);
/* Light: single restrained shadow. */
--elev-raised: 0 4px 16px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04);

--focus-ring: 0 0 0 2px color-mix(in oklab, var(--accent), transparent 30%);

--duration-fast: 120ms;  --duration-base: 180ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

- Flat surfaces have **no shadow** — containment is the 1px border.
- Hover = background step (`--surface-raised` fill or `color-mix` 4–8% white),
  never `translateY`, never scale, never glow.
- `:focus-visible` applies `--focus-ring` on every interactive element.

### 4.1 Motion system (v2 — token-only, research-derived)

Sources: assistant-ui `examples/with-tanstack/src/styles.css`, Codex desktop
`register` chunk, Linear/Raycast DESIGN.md. Every animation in the app must
compose these tokens; no ad-hoc durations or easings.

```css
/* Easings */
--ease-spring:     cubic-bezier(0.32, 0.72, 0, 1);  /* collapsibles, popovers, modals, underlines */
--ease-crossfade:  cubic-bezier(0.2, 0, 0, 1);      /* icon/text swaps */
--ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);   /* entrances, message mount */
--ease-exit:       cubic-bezier(0.8, 0, 0.4, 1);    /* exits only */
--ease-pulse:      cubic-bezier(0.4, 0, 0.6, 1);    /* infinite pulses only */

/* Durations */
--duration-press: 80ms;    /* press scale */
--duration-fast: 120ms;    /* hover bg/border steps */
--duration-base: 150ms;    /* message mount, chip mount, crossfades */
--duration-slow: 200ms;    /* collapsibles, action-bar fade, sidebar width */
--duration-modal: 320ms;   /* modal/popover entrance */

/* Stagger step for grouped children (tool blocks, suggestion chips) */
--stagger-step: 40ms;      /* applied to nth-child 2–5, capped */

/* Keyframes (defined once in default.css) */
/* fade-in:        opacity 0→1 */
/* rise-in:        opacity 0→1 + translateY(4px→0) */
/* popover-in:     opacity 0→1 + scale(.95→1) + translateY(2px→0) */
/* shimmer-sweep:  background-position -100%→250% (skeletons) */
/* shimmer-text:   background-clip:text highlight sweep, 3s linear infinite;
                   highlight = color-mix(currentColor 20%, transparent);
                   bg-size 50% 200% */
/* stream-sweep:   300%-wide gradient strip translate(-66%)→0, .5s linear
                   forwards — the ONLY streaming reveal (Codex pattern);
                   gradient = transparent → color-mix(fg 6%, transparent) → transparent */
/* pulse-soft:     sonar ring scale 1→2, opacity .75→0, 2s (live status dots) */
/* dot-blink:      streaming ● cursor, opacity 1→.5, 2s var(--ease-pulse) infinite */
/* spin:           360° .8s linear infinite (spinners, rare) */

/* Component-scoped */
--hairline: 0 0 0 0.5px rgba(255,255,255,0.12);   /* dark floating surfaces */
--hairline: 0 0 0 0.5px rgba(0,0,0,0.10);         /* light floating surfaces */
```

**Usage rules**

- Message mount: `rise-in` at `--duration-base` with `--ease-out-expo`.
- Hover on rows/cards: background/border color transition `--duration-fast`
  linear. Ghost buttons may hover via `opacity: 0.6` (Raycast) instead.
- Press feedback: `scale(0.98)` or `translate-y-px` at `--duration-press`.
- Collapse/expand: height 0→auto at `--duration-slow` `--ease-spring`;
  chevron rotates −90°→0 same timing; content enters fade + rise-4px +
  blur(2px→0).
- Popovers/dropdowns: `popover-in` at `--duration-modal` `--ease-spring`,
  `backdrop-filter: blur(8px)`, `--hairline` ring, background
  `color-mix(panel 95%, transparent)`.
- Live status: `pulse-soft` sonar dot; transient labels use `shimmer-text`,
  never a spinner beside gray text.
- Exits: elements exiting a layout get `position: absolute` during the exit
  so siblings don't jump (Codex TransitionGroup pattern).
- Floating pills over content: `backdrop-filter: blur(8px)` +
  `color-mix(input-bg 70%, transparent)` + `--hairline`.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* streaming renders instantly: no sweep, no cursor pulse */
}
```

---

## 5. Component patterns

### 5.1 Sidebar nav item

```
┌──────────────────────────────┐
│ ▦  Board                  12 │   icon 14px · label --text-sm/500 · count --text-xs faint
└──────────────────────────────┘
  height 28px · radius --radius-sm · pad-x --space-2
```

- Default: transparent bg, `--text-muted` icon + `--text-secondary` label.
- Hover: `color-mix(white 4%)` fill, text → `--text-primary`.
- Active: `--accent-soft` fill, `--text-primary`, icon takes `--accent-strong`.
  No left border stripe, no pill outline.
- Count badge right-aligned, `--text-faint`, no background.

### 5.2 Task card (board)

```
┌────────────────────────────────────────┐
│ ● Todo   ▲ High        @claude ● Live  │  chip row --text-xs
│ Research SoftBank's portfolio          │  title --text-base/500 --text-primary
│ ONEVibe · finance · 2h ago             │  meta --text-xs --text-faint
└────────────────────────────────────────┘
  bg --surface-panel · border --border-default · radius --radius-md
  pad --space-3 · stack gap --space-2
```

- Hover: border → `--border-strong`. No lift, no shadow.
- Whole card is one `role="button"` target (Enter/Space), chips inside are their
  own interactive elements (existing child-guard behavior preserved).
- Live indicator: 6px `--status-info` dot + `--text-xs` label; dot pulses only
  under `prefers-reduced-motion: no-preference`.

### 5.3 Chip / badge

```
┌──────────┐  ┌──────────┐  ┌────────┐
│ ● Todo   │  │ ▲ High   │  │ finance│
└──────────┘  └──────────┘  └────────┘
 status chip   priority chip   label chip
```

- Height 20px, pad-x `--space-2`, radius `--radius-sm`, `--text-xs`/500.
- Status chip: 6px status dot + label; bg = status soft fill; text = status color
  (dark) / status color (light). Clickable variants are pickers (dropdown caret 10px).
- Priority chip: icon + label, `--text-secondary` on `--surface-raised`.
- Label chip: `--text-muted` on transparent with `--border-subtle` border.
- Never more than one filled (non-subtle) chip per row — status owns the fill.

### 5.4 Buttons

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────┐
│  New task   │ │   Cancel    │ │  ⋯ Options  │ │ ✕  │
└─────────────┘ └─────────────┘ └─────────────┘ └────┘
   primary        secondary       ghost           icon
```

- Shared: height 28px (sm) / 32px (md), pad-x `--space-3`, radius `--radius-sm`,
  `--text-base`/500, transition background `--duration-fast`.
- **Primary**: bg `--accent`, text `--accent-ink`; hover bg `--accent-strong`.
  One per view region.
- **Secondary**: bg `--surface-raised`, border `--border-default`, text
  `--text-primary`; hover border `--border-strong`.
- **Ghost**: transparent, text `--text-muted`; hover fill `color-mix(white 5%)`,
  text `--text-primary`.
- **Icon**: 28×28px square ghost, 14px icon, always `aria-label`.
- **Danger**: ghost structure, text `--status-danger`; hover fill = danger soft.
- Disabled: `opacity: 0.45`, no hover change, `cursor: default`.

### 5.5 Input

```
┌────────────────────────────────────────┐
│ Search conversations…                  │
└────────────────────────────────────────┘
  height 32px · bg --surface-panel · border --border-default · radius --radius-sm
  pad-x --space-3 · text --text-base · placeholder --text-faint
```

- Focus: border → `--accent`, plus `--focus-ring`. No background change.
- Label above at `--text-xs`/500 `--text-muted` (8px gap); never placeholder-only
  on forms (search fields excepted, they carry `aria-label`).
- Error: border `--status-danger` + `--text-xs` message below, `role="alert"`.

### 5.6 Modal

```
        ┌──────────────────────────────────────┐
        │ Delete schedule                  ✕   │  header --text-lg/600
        ├──────────────────────────────────────┤
        │ “Weekly brief” runs every Monday.    │  body --text-base --text-secondary
        │ This cannot be undone.               │
        ├──────────────────────────────────────┤
        │                    [ Cancel ] [Delete]│ footer right-aligned
        └──────────────────────────────────────┘
  width 440px max · bg --surface-raised · elev-raised · radius --radius-lg
  overlay rgba(0,0,0,0.6) (dark) / rgba(0,0,0,0.3) (light)
```

- Replaces every `window.confirm`. Escape closes; focus trapped; focus returns to
  trigger on close. Destructive confirm = danger-primary button.

### 5.7 Popover / picker (composer pickers, chip pickers)

```
┌──────────────────────────┐
│ ● Todo                   │
│ ◐ In progress        ✓   │   selected: check right, row bg --accent-soft
│ ◼ Blocked                │
└──────────────────────────┘
  bg --surface-raised · elev-raised · radius --radius-md · pad --space-1
  item height 28px · radius --radius-sm
```

- Opens on trigger click; **closes on Escape, outside click, or selection**
  (current pickers lack this — fixed in rebuild). One popover open at a time.
- `role="menu"`/`menuitem`, `aria-expanded` on trigger.

### 5.8 Empty state

```
              ◌
     No tasks yet
     Create your first task to see it here.
              [ New task ]
```

- Centered in its container, icon 20px `--text-faint`, title `--text-base`/500
  `--text-secondary`, body `--text-sm` `--text-muted`, one optional action.
  Never a blank area, never a dashed-border box.

### 5.9 Banner (offline / demo)

- Full-width strip under topbar, height 32px, `--text-sm`.
- Offline: `--status-warning` soft fill, warning icon 14px, retry ghost button.
- Demo: `--status-info` soft fill. No gradients, no pulse.

---

## 6. Token inventory (implementation contract for `src/index.css`)

```css
:root {
  /* surfaces */  --surface-canvas --surface-sidebar --surface-panel --surface-raised
  /* borders */   --border-subtle --border-default --border-strong
  /* text */      --text-primary --text-secondary --text-muted --text-faint
  /* accent */    --accent --accent-strong --accent-ink --accent-soft
  /* status */    --status-success --status-warning --status-danger --status-info --status-cancelled
  /* type */      --font-ui --text-xs --text-sm --text-base --text-md --text-lg --text-xl --text-2xl
  /* space */     --space-1 --space-2 --space-3 --space-4 --space-5 --space-6 --space-8 --space-10 --space-12
  /* radius */    --radius-sm --radius-md --radius-lg --radius-pill
  /* layout */    --layout-nav-height --layout-sidebar-width --layout-content-max
  /* elevation */ --elev-raised --focus-ring
  /* motion */    --duration-fast --duration-base --ease-standard
}
[data-theme="light"] { /* §1.2 + §1.4 light values + light --elev-raised */ }
```

Rules enforced by review: **no raw hex/px outside this block**; tenant-theme token
names unchanged; `timeline.css` deleted and its live rules absorbed; dark is the
absence of `data-theme`, light overrides only the tokens listed above.
