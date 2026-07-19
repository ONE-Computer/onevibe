# ONEVibe V2 frontend conventions

Every V2 component lives under `src/v2/`, is a focused single-responsibility React
component, and co-locates its styles in a CSS module (`Component.tsx` +
`Component.module.css` + `Component.test.tsx` side by side). These rules are
enforced at review time, not by a linter — read them before writing any code.

## Styling — the hard rules

1. **Tokens only.** All color, spacing, radius, typography, shadow, and motion
   values come from `src/theme/default.css`. Allowed groups:
   - Surfaces/borders/text: `--surface-*`, `--border-*`, `--text-*`, `--overlay-*`,
     `--grid-line`, `--hairline`
   - Accent/status: `--accent*` (`--accent`, `--accent-strong`, `--accent-ink`,
     `--accent-soft`, `--accent-border`), `--status-*`, `--success`, `--warning`,
     `--danger`, `--info`, `--warning-soft`, `--info-soft`, `--green-soft`
   - Elevation: `--elev-*`, `--shadow`, `--shadow-soft`, `--focus-ring`
   - Type: `--font-ui`, `--font-display`, `--text-2xs` … `--text-2xl`,
     `--font-weight-*`
   - Space: `--space-1` … `--space-16`; layout: `--layout-*`
   - Radius: `--radius-sm/md/lg/pill` (prefer these) or a specific `--radius-Npx`
   - Motion: `--duration-*`, `--ease-*`, `--stagger-step`
2. **Never** a hardcoded hex, `rgb()`/`rgba()`/`color-mix()` literal, or
   `hsl()` in component CSS. If a value you need does not exist as a token, the
   design system is missing a token — flag it in your report; do not improvise.
3. **Never** a pixel `font-size` — use the `--text-*` scale. Never a hardcoded
   spacing value — use `--space-*` (1px borders and 1px–2px optical nudges are
   fine). Icon `size={N}` props in JS are fine.
4. **No `!important`.** No inline `style={{}}` for color, spacing, or typography
   (dynamic values like a progress-bar width percentage are OK).
5. **Sans-serif only.** `font-family: var(--font-ui)` everywhere, including code,
   hashes, and evidence. Serif and monospace stacks are prohibited in visible UI.
6. **No `[data-theme]` overrides in component CSS.** Components consume semantic
   tokens; dark and light fall out of the token layer automatically. If a token
   genuinely needs a per-theme value, it belongs in `default.css` — flag it.
7. Legacy aliases (`--bg`, `--panel`, `--line`, `--muted`, `--color-*`,
   `--shadow-sm/base/lg`) exist only for the legacy `src/index.css`. V2 code
   must not use them.

## Motion

- CSS transitions/animations use `--duration-*` + `--ease-*` tokens.
- Every animation/transition must be neutralized under
  `@media (prefers-reduced-motion: reduce)` in the same module.
- `framer-motion` is allowed where it carries UX weight (view transitions,
  popovers). Keep `AnimatePresence mode="wait"` patterns from legacy where they
  exist.

## Accessibility

- Every interactive element: visible `:focus-visible` style (use
  `box-shadow: var(--focus-ring)`), keyboard reachable, `aria-label` when
  icon-only.
- Buttons are `<button>`, links are `<a>`. No clickable `<div>`.

## Component rules

- Named exports. `interface ComponentProps` for props. No default exports.
- **Props contracts are pinned.** A V2 component replacing a legacy component
  keeps the exact same exported props type as the legacy one. If you believe the
  contract should change, do not change it — note it in your report.
- Data only through `src/lib/api.ts` and existing hooks/stores. No new runtime
  dependencies. No changes to `src/types.ts`, routing, or auth flow.
- Strings: preserve the legacy component's behavior (hardcoded EN, or the
  existing `locale` prop pattern). Do not start an i18n migration.
- Every async surface designs its **loading**, **empty**, and **error** states.
  No bare spinners without context, no blank boxes.

## CSS modules

- camelCase class names (`.paneHeader`), consumed as `styles.paneHeader`.
- Compose layout inside your own component's root; never style a parent or
  global selector (`:global` is prohibited except for third-party roots that
  have no other hook, e.g. assistant-ui primitives — flag any use).
- Root element of the component gets the module's root class; keep legacy
  `data-*`/`role`/aria attributes that tests or e2e rely on.

## Tests

- Vitest with `renderToStaticMarkup`, matching the existing test style; wrap in
  the same mocked `ThemeContext` value the legacy tests use when the component
  consumes theme context.
- The V2 test file keeps **at least** the legacy test count and preserves every
  behavioral/data-flow assertion (callbacks wired, data rendered, API calls).
  DOM-structure and class-name assertions may be rewritten to the new markup.
