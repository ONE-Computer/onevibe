# ONEVibe UX Rebuild — Execution Plan

> Phase 3 of the UX rebuild. Architecture decision, sequencing, and gates.
> Inputs: `docs/ux-audit.md` (contracts), `docs/ux-design-system.md` (visual spec),
> `docs/ux-wireframes.md` (layouts). This document is the how.

---

## 1. Architecture decision

**Build the design system from scratch as CSS custom properties in this repo.
Do not adopt open-design as a dependency, and do not add any npm package.**

### What open-design actually is

`github.com/nexu-io/open-design` is a **token reference repository**, not an
installable component library. Its value is the extracted token schemas of
Linear (`linear-app/tokens.css`), Raycast (`raycast/tokens.css`), and others:
exact hex ladders, spacing steps, elevation-by-luminance techniques. There is
nothing to `npm install` — the right way to use it is to steal its values and
its *method*, both of which are already baked into `docs/ux-design-system.md`
(palette, luminance stepping, hairline borders, focus-ring technique).

### Why not a component library

- The audit (§D) fixes every route, API call, store shape, and DOM contract.
  A component library would fight those contracts, not serve them.
- The repo has hard rules no library satisfies out of the box: sans-serif-only
  (no mono anywhere), tenant-theme token names are a live contract
  (`ThemeProvider` sets 15 specific custom properties inline), i18n en+zh for
  every string, reduced-motion gating, no new deps without justification.
- The existing stack (React 19, Vite, TS strict, Zustand, TanStack Query,
  Lucide, framer-motion) already covers motion and icons. Missing is only
  *discipline* — which is a token layer, not a dependency.

### What we borrow from open-design (verbatim techniques)

| Technique | Source | Where applied |
|---|---|---|
| Neutral palette stepped by luminance, not saturation | linear-app | `--surface-*`, `--text-*` ladders |
| One accent, desaturated indigo `#5e6ad2` | linear-app | `--accent` family |
| Elevation = lighter surface + hairline border, no drop shadows | linear-app | cards, popovers, sidebar |
| 4px spacing base, 11–24px type scale, floor 11px | linear-app/raycast | `--font-size-*`, `--space-*` |
| Focus ring via `color-mix(in oklab, accent, transparent)` | raycast | `:focus-visible` global rule |
| Compact 28px control height for dense tool surfaces | raycast | buttons, inputs, selects |

---

## 2. File strategy

CSS today is split across three files; the rebuild keeps that split and
rewrites each in place:

| File | Role | Action |
|---|---|---|
| `src/theme/default.css` (338 lines) | Canonical token file — header already prohibits raw colors/px outside it | **Rewrite fully** to the design-doc token set. Dark default in `:root`; `[data-theme="light"]` overrides. |
| `src/index.css` (1257 lines) | All component styles | **Rewrite fully**, in passes aligned with the component order below. No raw hex/px — tokens only. |
| `src/timeline.css` (39 lines) | Legacy timeline styles | Audit for live selectors; absorb survivors into `index.css`, delete the file and its `main.tsx` import. |

### Tenant-theme contract (non-negotiable)

`src/components/ThemeProvider.tsx` sets these 15 custom properties inline;
`:root` must define every one so tenant overrides compose correctly:

```
--surface-canvas --surface-panel --surface-sidebar --surface-raised
--text-primary --text-secondary --text-muted --text-faint
--accent --accent-strong
--border-default --border-subtle
--font-ui
--radius-asymmetric --radius-14px
```

`--radius-asymmetric` and `--radius-14px` are legacy names from the tenant
schema; keep them as **semantic aliases** (`--radius-panel`, `--radius-control`
point at them) so tenant `radiusBase`/`radiusButton` overrides keep flowing to
the right places. Additional internal tokens (`--accent-ink`, `--accent-soft`,
`--border-strong`, status colors, spacing, layout constants) are additive and
safe.

### Logic is frozen

No changes to `src/lib/**` (except the gate-fix modules), `src/types.ts`,
stores, hooks, or API calls. Component rewrites may restructure JSX and class
names, but every preserved selector referenced by tests
(`docs/ux-audit.md` §D.5) must survive.

---

## 3. Sequencing

### Step 0 — Gate repair (commit: `fix(gate): restore missing board/artefacts modules`)

The tree references four modules that do not exist; two test files fail on
import. Create them, wire `onPatchTask`, add missing i18n keys. Baseline after
this step: **0 TS errors, all tests green** (currently 389/70 with 2 files
failing).

1. `src/lib/board-metadata.ts` — `boardStatusFor(runStatus, boardStatus)`,
   `boardStatusLabelKey: Record<BoardStatus, I18nKey>`.
2. `src/lib/artefacts.ts` — `categoryOf(path)`, `filterArtifactEntries`,
   `ArtifactEntry`, `FileCategory` types.
3. `src/components/ChipPicker.tsx` — `StatusChipPicker`, `PriorityChipPicker`
   (inline dropdown, `aria-haspopup="listbox"`, keyboard navigable).
4. `src/components/ActiveNowPanel.tsx` — shared active-runs panel,
   `variant: 'sidebar' | 'home'`, built on `activeAgentRuns`/`elapsedSeconds`/
   `formatElapsed` from `src/lib/assignees.ts`.
5. `src/lib/i18n.ts` — add `setStatus`, `setPriority`, `noPriority`,
   `boardTodo`, `boardInProgress`, `boardDone`, `boardBlocked`,
   `boardCancelled` (en + zh).
6. `src/App.tsx` — import `patchTask` + `BoardStatus`/`TaskPriority` types,
   add `handlePatchTask` (calls `patchTask`, folds result into
   `updateTasksCache`), pass to `BoardView`.

### Step 1 — Token layer (commit: `feat(ux): design system tokens`)

Rewrite `src/theme/default.css` to the full design-doc inventory. Keep every
existing class in `index.css` compiling against new token names **in the same
commit** — this pass is a mechanical value swap, not a visual redesign yet.
Delete `timeline.css` after absorbing live rules. Verify: `npm run check`
green, dev server renders, dark + light both sane at 1280×800.

### Step 2 — Component passes (one commit each)

Order chosen by dependency: shell first, then views by centrality. After each:
`npm run check` green → screenshot dark + light → commit
`feat(ux): rebuild <Name>`.

1. **Sidebar** — nav item spec, project section, ActiveNowPanel, conversation
   rows, footer. (`Sidebar.test.tsx` pins `epic-chip`, `epic-filter-row`.)
2. **Home / HomeHero** — kill dead hero chrome, revive recent list, announcement
   + feature cards per wireframe. (`HomeHero.test.tsx` pins tenant projection.)
3. **BoardView** — 5-column grid fix, card spec, chip pickers, list mode,
   active-now strip.
4. **AssistantThread** — message bubbles → plain blocks, composer, tool cards,
   thinking blocks. (Largest surface; `AssistantThread.test.ts` pins projections.)
5. **Workspace / ComputerTimeline** — 16 tabs → 6 visible + overflow (ids
   unchanged), 55/45 flex split, artifact cards.
6. **Computers** — section kickers, runtime cards, MCP config rows.
7. **Artefacts** — gallery grid, thumbs, filter tabs.
8. **Library, Schedules, SkillsLibrary** — table/card spec, shared empty states.
9. **Small components** — ShareDialog, ApprovalCard, ThemeToggle, BrandMark,
   DataTable, notifications, toasts.
10. **Appearance / HomepageEditor** — admin forms on the new control spec.

### Step 3 — QA and ship

- `npm run dev:all` in background; Playwright at 1280×800.
- Every view, dark **and** light: snapshot + screenshot to
  `docs/browser-screenshots/qa-<view>-<theme>.png`; zero console errors.
- Keyboard pass on sidebar, board cards, chip pickers, composer.
- `npm run check` final; update `CHANGELOG.md` [Unreleased];
  `git push origin ux/rebuild`.

---

## 4. Standing rules for every pass

- `npm run check` after each component; fix TS errors immediately, never
  accumulate.
- All CSS values via tokens — lint review per commit: no raw hex/px outside
  `theme/default.css`.
- All user-visible strings through `t(key, locale)`, en + zh, typed
  `keyof typeof en`.
- Every interactive element: visible `:focus-visible`, `aria-label` when
  icon-only, keyboard reachable.
- Motion gated under `@media (prefers-reduced-motion: reduce)`.
- No comments except non-obvious WHY; no comments narrating the change.
- Tests are the contract — if a rewrite breaks a test, the rewrite is wrong
  unless the test itself encodes the old visual bug (then fix test + note in
  commit body).
- No new npm dependencies. Framer-motion and Lucide already present cover
  motion and icons.

## 5. Risks

| Risk | Mitigation |
|---|---|
| `index.css` rewrite strands a selector still used by an unrewritten component | Rewrite in passes; grep class names before deleting any block |
| Tenant-theme vars regress | Keep the 15 names defined; ThemeProvider tests + Appearance view QA each pass |
| Timeline tab consolidation breaks `ComputerTimeline.test.ts` | Tab ids unchanged; overflow menu renders same `role="tab"` elements |
| Light theme an afterthought | Every component pass screenshots both themes before commit |
