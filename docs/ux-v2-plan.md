# ONEVibe UX v2 — Improvement Plan

> Synthesizes four research sources into one execution plan:
> **assistant-ui** (local clone, `reference/assistant-ui`),
> **Linear** + **Raycast** DESIGN.md (open-design design-systems library),
> **Codex desktop app** (deminified source, `~/SecureCodex/reference/codex-app`).
> This plan supersedes the phasing in `ux-rebuild-plan.md`; the constraints,
> token palette, and wireframes from the earlier docs still bind.

---

## 0. What the research changed

The original plan ("rewrite components one by one, keep it flat") would have
produced a competent Linear knock-off. The research shows what actually
separates tier-A product UI from a knock-off — and it is **not** more
decoration. It is:

1. **A motion language, not animations.** Codex has exactly four easing curves
   and every component uses them. assistant-ui has two parameterized keyframe
   families (`enter`/`exit`) and every entrance is a composition of them.
   ONEVibe currently has ad-hoc transitions per component. We adopt a small
   motion token set and every component uses only those tokens.

2. **Streaming is the product.** Codex replaced the blinking caret with a
   300%-wide gradient sweep (`SmoothingOverlay`, .5s linear, translate(-66%)→0)
   plus smoothed block mounting (height 0→auto .15s). assistant-ui uses a
   pulsing ● cursor + text smoothing at 250ms drain. ONEVibe's stream currently
   pops text in with zero treatment — the single cheapest "wow" fix in the app.

3. **Transient labels shimmer.** Every "is working…" / "Preparing preview…"
   label in Codex and assistant-ui is a `background-clip:text` shimmer, not a
   spinner next to gray text. ONEVibe has ~15 such labels.

4. **Hover reveals, not hover highlights.** assistant-ui action bars and Codex
   thread-row actions mount on hover (`opacity-0 → opacity-100`, 200ms fade)
   with reserved space so nothing reflows. This alone removes most visual noise.

5. **Elevation = hairline + luminance, not shadows.** Codex:
   `0 0 0 .5px #ffffff1f` hairline ring + 4-step elevation geometry
   (`0 1px 2px -1px` … `0 8px 16px -4px`) + `backdrop-blur` on floating
   surfaces. Raycast: multi-layer inset highlights. Linear: pure luminance
   stepping. Our flat-border approach was directionally right; v2 adds the
   hairline ring + blur for popovers/modals only.

6. **Performance is UX.** Codex puts `content-visibility:auto` +
   `contain-intrinsic-size:auto 240px` on every turn row — near-free
   virtualization for long threads. Our AssistantThread renders every event.

7. **Rotating wait-verbs.** Codex cycles "Thinking / Reading / Planning…"
   through a text-swap (enter translateY(3px) .6s, exit -5px .5s). Cheap,
   delightful, and makes waits feel shorter.

### What we deliberately do NOT copy

- **Monospace anywhere** — project rule overrides Codex/Raycast mono-for-code.
- **Codex's approval escalation UX** — our approval authority is external
  (OpenVTC/VTI); we keep the existing approval card, restyled only.
- **Gradients as decoration** — the streaming sweep is a functional gradient,
  allowed; no decorative gradients on surfaces.
- **Raycast's heavy inset-shadow buttons** — one subtle inset highlight max.
- **assistant-ui as a dependency** — pattern port only (decided in
  `ux-rebuild-plan.md`); no new npm deps this phase.

---

## 1. Phase overview

| Phase | Scope | Gate |
|---|---|---|
| **P1 Research synthesis** | This doc + motion addendum to `ux-design-system.md` §4 | docs committed |
| **P2 Token + motion layer** | Rewrite `src/theme/default.css`, slim `src/index.css` head, delete `timeline.css`, update `theme-literals.test.ts` | `npm run check` green |
| **P3 Shell** | Sidebar → Topbar → HomeHero (new-task screen) | check green + commit each |
| **P4 Core surfaces** | BoardView (fix 5-col grid) → AssistantThread/Workspace (streaming, tool blocks, composer) | check green + commit each |
| **P5 Secondary surfaces** | Computers, Artefacts, Library, Schedules, Skills, Appearance/settings | check green + commit each |
| **P6 Polish + QA** | Microanimation audit, Playwright QA dark+light @1280×800, zero console errors, CHANGELOG, push | acceptance criteria §6 |

Each phase ends with `npm run check` (≥394 tests / 72 files) and its own
commit; no phase starts on a red gate.

---

## 2. P2 — Token + motion layer (the foundation)

Everything later phases use is defined here first. Full values live in
`ux-design-system.md` §4 (motion addendum); summary:

**New token families added to the existing palette:**

- Easings: `--ease-spring` (0.32,0.72,0,1) · `--ease-crossfade` (0.2,0,0,1) ·
  `--ease-out-expo` (0.16,1,0.3,1) · `--ease-exit` (0.8,0,0.4,1)
- Durations: 80 / 120 / 150 / 200 / 320 ms
- Keyframes (defined once): `fade-in`, `rise-in` (opacity+translateY 4px),
  `popover-in` (zoom-95 + rise + fade), `shimmer-sweep`, `pulse-soft`,
  `dot-blink`, `spin`, `stream-sweep` (Codex gradient, 300% strip)
- Component-scoped vars: `--shimmer-highlight`, `--stream-sweep-gradient`,
  `--hairline-dark` / `--hairline-light`
- One `@media (prefers-reduced-motion: reduce)` kill-switch neutralizing every
  keyframe and transition.

**File surgery (from earlier recon, still valid):**

- `src/theme/default.css`: replace font stack with system stack, add palette +
  motion tokens; keep hashed `--theme-color-*` block (legacy blob still
  references it — deleted only after component passes) and the
  `--theme-font-ui` tail; consolidate `--layout-content-max` to 960 and drop
  the index.css:42 override; `--layout-nav-height` 56→48.
- `src/index.css`: line 1 becomes font-family/synthesis/rendering only; move
  the semantic blocks (lines 32–51) into default.css; components' CSS gets
  rewritten per phase P3–P5, not here.
- Delete `src/timeline.css` (39 lines, dead) + its import `src/main.tsx:6`.
- Update `scripts/theme-literals.test.ts` for the new font stack assertion and
  the removed timeline.css.

**Invariant:** ThemeProvider's 15 inline var names
(`--surface-canvas/panel/sidebar/raised`, `--text-primary/secondary/muted/
faint`, `--accent`, `--accent-strong`, `--border-default`, `--border-subtle`,
`--font-ui`, `--radius-asymmetric`, `--radius-14px`) keep working unchanged —
the light-theme overrides in index.css (~94 hits) depend on them.

---

## 3. P3 — Shell: Sidebar, Topbar, HomeHero

**Sidebar**
- Thread/project rows: hover bg step 120ms; actions (`…`) mount on hover
  `opacity 0→1` 150ms, focus-visible equals hover (Codex `ItemActions`
  pattern); active row = 2px accent leading bar, not a filled pill.
- "Is working" rows get shimmer-text treatment instead of static dot.
- Section collapse: height 0→auto 200ms `--ease-spring`, chevron −90°→0
  (assistant-ui collapsible pattern).
- Width transition 200ms on collapse toggle; keyboard nav with visible
  `--focus-ring`.

**Topbar**
- 48px (`--layout-nav-height`), breadcrumb with `/` separators, right-side
  status cluster. No shadow; 1px `--border-subtle` bottom only.

**HomeHero (new-task screen)**
- Codex pattern: large prompt headline + composer as the entire screen.
  Headline mounts 200ms rise; suggestion chips stagger in at 40ms intervals
  (max 5) with 8px rise 200ms each.
- Composer: rest + focus shadow lift (rest `0 4px 16px -8px` → focus
  `0 6px 24px -8px`, border-color transition 150ms) — the one place a shadow
  is allowed on a flat surface, from assistant-ui.
- Send button: press `scale(0.96)` 80ms; send↔disabled crossfade 150ms.
- Keep `renderToStaticMarkup`-safe (tests pin this).

## 4. P4 — Core surfaces

**BoardView**
- Fix the known 5-column grid bug (recon finding).
- Column headers: count chip `--text-xs` faint; cards: border-as-container,
  hover = border-strong + 2px rise is FORBIDDEN (no translateY per design
  rule; hover = border + bg step only).
- Card mount stagger 40ms on first paint only; drag states unchanged
  (logic preserved), drag-over column = 4% white color-mix wash.
- Priority/status chips per §5.3 of the design doc.

**AssistantThread / Workspace** (the centerpiece — budget the most time here)
- Message mount: opacity 0→1 + translateY(4px→0), 150ms ease-out
  (assistant-ui message pattern).
- **Streaming**: Codex gradient sweep on incoming markdown blocks
  (`stream-sweep`, .5s linear forwards) + pulsing ● cursor while the run is
  live (2s, ease-in-out); smoothed block mount height 0→auto 150ms.
  Reduced-motion: instant render, no sweep.
- Tool-call blocks: collapsed by default; expand = height 0→auto 200ms
  `--ease-spring`, chevron rotate 200ms, content enters fade+rise-4px+blur(2px
  →0); tool-group stagger 40/80/120/160ms for children 2–5.
- **Thinking label**: shimmer text ("Thinking…" / rotating wait-verbs:
  Thinking → Reading → Planning → Drafting, swap every 2.4s via
  translateY(3px) enter / -5px exit, Codex `Root--U07b5` pattern).
- Hover action bar (copy, retry): mounts on message hover, 200ms fade,
  reserved space so the thread never reflows (assistant-ui `min-h-7.5` trick).
- Long threads: `content-visibility:auto` + `contain-intrinsic-size:auto 240px`
  on turn rows (Codex) — no virtualization library.
- Approval card: restyle only — hairline ring + tinted status badge
  (`bg accent/10 text accent`, Codex pending-badge pattern). Logic untouched.
- Composer: same treatment as HomeHero composer + attachment chip mount
  popover-in.
- Scroll: smooth on run start, instant during stream; scroll-to-bottom button
  mounts/unmounts with popover-in.

## 5. P5 — Secondary surfaces

- **Computers/runtimes**: status dot with `pulse-soft` sonar for live sessions
  (2s, scale 1→2 fade); card grid with contained scroll; connect/error states
  get shimmer + banner treatments.
- **Artefacts**: thumbnail grid, version badge (tinted chip), filter tabs with
  animated active indicator (2px underline slides 150ms, `--ease-spring`).
- **Library / Skills / Schedules**: list rows with hover-mounted actions,
  shimmer loading rows (text-shaped skeletons: height 72% of line, radius
  999px — Codex `LoadingLine`), empty states per §5.8.
- **Appearance**: swatch cards with 150ms border-strong hover; theme switch
  applies instantly (no transition on canvas — color transitions only on
  interactive elements).

All secondary surfaces reuse P3/P4 primitives: no new keyframes, no new
easings, no new shadows.

## 6. P6 — Polish + QA gate

1. **Motion audit**: grep for any `transition:`/`animation:` not using tokens;
   any duration outside the 80–320ms scale; any `transform: translateY` on
   hover. Fix or justify.
2. **Token audit**: `theme-literals.test.ts` covers hex/px leakage; manual
   grep for hardcoded `rgba(` outside default.css.
3. **Playwright QA** (`dev:all`, CDP :9223): every view at 1280×800, dark AND
   light: Home, Board, Task thread, Computers, Artefacts, Library, Schedules,
   Skills, Appearance. Screenshots → `docs/browser-screenshots/qa-v2-*.png`.
   Zero console errors.
4. **Reduced-motion pass**: emulate `prefers-reduced-motion`, verify no
   animation runs and nothing is broken.
5. CHANGELOG `[Unreleased]` entry; final `npm run check`;
   `git push origin ux/rebuild`.

---

## 7. Success measures

| Signal | Before (audit) | Target |
|---|---|---|
| First impression | "hackathon demo" | belongs next to Linear/Cursor |
| Streaming feel | text pops in | gradient sweep + pulse cursor |
| Motion consistency | ad-hoc | 4 easings, 5 durations, token-only |
| Transient states | static gray text / spinners | shimmer + rotating verbs |
| Thread perf on 200 events | full render | content-visibility windowing |
| Console errors on dev boot | unknown | 0 |

---

## 8. Research appendix (verified values)

### assistant-ui (`reference/assistant-ui`, examples/with-tanstack/styles.css:95-253)
- `.animate-in { 150ms; ease-out; fill-mode:both }`; keyframes `fade-in`,
  `slide-in-from-bottom-1/2/4` (0.25/0.5/1rem), `slide-in-from-top-2`,
  `zoom-in-95/out-95`.
- Collapsible/popover easing `cubic-bezier(0.32,0.72,0,1)`; icon crossfade
  `cubic-bezier(0.2,0,0,1)`; press `active:scale-[0.98]` / `translate-y-px`.
- Stream cursor: `::after` "●" pulse 2s `cubic-bezier(0.4,0,0.6,1)` infinite;
  smoothing drainMs 250; auto-off under reduced motion.
- Composer focus shadow lift (rest `0 4px 16px -8px /.08` → focus
  `0 6px 24px -8px /.12`).
- Reasoning/tool: 200ms height 0→auto, chevron −90°→0, content
  fade+slide-top-4+blur-2px, stagger 40/80/120/160ms nth-child 2–5,
  `useScrollLock` freeze 200ms.
- Shimmer: background-clip:text, highlight 20% currentColor, `--shimmer-speed:
  200`px/s linear infinite; skeleton sweep 1000ms.
- Action bars mount on hover, reserved-space trick; dropdowns
  zoom-95+slide-2+fade, `bg-popover/95 backdrop-blur`, sideOffset 6.

### Linear (open-design DESIGN.md)
- Canvas `#08090a`, panel `#0f1011`, elevated `#191a1b`, hover `#28282c`;
  text `#f7f8f8`/`#d0d6e0`/`#8a8f98`/`#62666d`; brand `#5e6ad2`, accent
  `#7170ff`/`#828fff`; borders white 5%/8%; surfaces white 2–5% never solid;
  radius 2/4/6/8/12/22/9999; weights 400/510/590; negative tracking display
  only; elevation = luminance stepping.

### Raycast (open-design DESIGN.md)
- Bg `#07080a` blue-tinted never pure black; surface `#101111`, card
  `#1b1c1e`; hover via opacity 0.6 transition not color swap; multi-layer
  inset highlights; state glows 15% alpha; radius 6 workhorse, pills 86px;
  body tracking +0.2px, weight 500 baseline.

### Codex desktop (`~/SecureCodex/reference/codex-app/deminified`)
- Easings: enter `cubic-bezier(.19,1,.22,1)`, exit `(.8,0,.4,1)`, snappy-exit
  `(.65,0,.4,1)`, move `(.65,0,.35,1)`; Popover .35s/.2s scale .95→1;
  Tooltip .25s; Pressable .15s.
- Streaming: `SmoothingOverlay` 300%-wide gradient strip, translate(-66%)→0,
  .5s linear forwards; `SmoothedCodeBlock` height/opacity .15s; NO caret.
- Shimmer text: `background-clip:text`, 3s infinite, bg-size 50% 200%,
  `--shimmer-contrast` theme overrides.
- Text-swap wait-verbs: enter translateY(3px) .6s enter-ease .4s delay; exit
  -5px .5s snappy-exit.
- TransitionGroup: `--tg-*` vars; exits `position:absolute; inset:0` so
  siblings don't jump.
- `content-visibility:auto` + `contain-intrinsic-size:auto 240px` per turn;
  `scrollbar-gutter:stable both-edges`.
- Hairline `0 0 0 .5px #ffffff1f` dark / `#0000001a` light; elevation geo
  `0 1px 2px -1px` … `0 8px 16px -4px`; backdrop-blur pills.
- Pending badge: `h-5 min-w-8 rounded-full bg-orange/10 text-orange`.
- Focus ring 2px offset 2px, blue-400 dark / blue-500 light.
- Home hero: AnimatePresence mode=wait .28s in /.18s out; rotating
  project-aware prompt with dotted-underline inline select.
