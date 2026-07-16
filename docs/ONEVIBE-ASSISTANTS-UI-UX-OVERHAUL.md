# ONEVibe assistants-ui UX overhaul

Status: **P0 product-quality program**  
Updated: 2026-07-16  
Design constraint: **sans-serif typography only**

## Implementation update — 2026-07-16

The execution-narrative slice is now backed by real running state: the assistant-ui projection renders durable user/assistant turns, native tool parts, a compact operational summary, and task-bound artifact cards; tool-backed tasks open directly in the Computer inspector. A follow-up browser pass removed duplicate tool rows from the summary and made general tasks open on their latest CLI command/result, while keeping hidden chain-of-thought out of the product. The broader native composer, inspector, typography, and responsive visual-regression work remains open.

The visible typography contract is now enforced at the product surface: body, controls, metadata, terminal/code previews, and timeline labels resolve to the same sans-serif stack. This closes the rendering-level font-family violation for the current shell; a complete responsive visual-regression suite is still required.

The assistant message now uses `MessagePrimitive.GroupedParts` for adjacent tool calls. The thread presents a collapsible operational group, while the Computer inspector remains the detailed command/result and artifact surface.

On mobile, the inspector is now an explicit handoff rather than a permanently compressed second column: `View computer` opens the full-height evidence surface and `Back to conversation` restores the thread. Exact-width screenshot automation remains open.

## North star

ONEVibe should feel like a calm, premium agent workspace: one obvious place to talk, one durable conversation history, one clear execution narrative, and one contextual artifact/computer inspector. The interface should feel closer to a high-quality AI product than an operations console.

The user should be able to:

1. Open a new conversation and immediately understand what ONEVibe can do.
2. Say “hello” and receive a normal assistant response without an invented plan or artifact workflow.
3. Ask for a document, slide deck, or other artifact and see the agent’s work unfold inline.
4. Expand reasoning/tool activity only when useful, without losing the conversational narrative.
5. Review generated files, screenshots, validation, and approvals in a contextual inspector.
6. Move between conversations, skills, projects, and artifacts without losing task state.

## What the assistant-ui study changes

The cloned reference repository is at:

`/Users/gini/Desktop/Project ONEComputer/reference/assistant-ui`

Reference commit studied: `f1dcd8b`.

The production templates and examples establish these patterns:

- `ThreadPrimitive.Root` + `ThreadPrimitive.Viewport` as the primary conversation layout.
- `ThreadPrimitive.Empty`, welcome content, and `ThreadPrimitive.Suggestions` for a deliberate empty state.
- `ComposerPrimitive.Root`, `Input`, `AttachmentDropzone`, `Attachments`, `Send`, `Cancel`, and dictation primitives for a complete composer.
- `MessagePrimitive.Parts`, `GroupedParts`, `Error`, `ActionBar`, `BranchPicker`, and edit composers for durable message interactions.
- Runtime adapters (`useChatRuntime`, `useExternalStoreRuntime`, and custom transports) as the boundary between backend streaming and UI state.
- Collapsible reasoning, grouped tool calls, sources, typed tool fallbacks, approvals, and generative UI for progressive disclosure.
- A virtualized thread pattern based on keyed message rendering, measured variable-height rows, sticky-bottom follow, and an explicit jump-to-latest affordance.

ONEVibe should reuse these primitives and patterns while retaining its own backend, SSE protocol, evidence model, and OpenVTC approval boundary.

## Current UX diagnosis

### 1. The thread is assistant-ui-shaped, not assistant-ui-native

`src/components/AssistantThread.tsx` now uses `useExternalStoreRuntime`, durable task status, native tool parts, and a measured virtualized turn list, but it still manually owns the message visuals, attachment state, and composer footer. The result is a real runtime-driven projection, but not yet a complete assistant-ui-native conversation shell.

### 2. The conversation and inspector still need a single contextual narrative

The assistant thread now removes duplicate raw tool rows, and the Computer rail owns detailed command/result evidence. The task page still has separate conversation, plan, and inspector surfaces; the next step is contextual selection and typed inline links so the user can follow one narrative without manually reconciling panels.

### 3. The home composer is too dense and exposes implementation details too early

The provider picker, mode picker, template gallery, selected skills, safety disclosure, attachment controls, policy label, and starter prompts all compete for attention. The screenshots show the runtime menu occluding the primary composer. Advanced controls should move into a command palette / popover and remain closed until requested.

### 4. The visual language is too small and telemetry-heavy

Many labels use 7–10px metadata styles and mono-like eyebrow treatments. The result feels like a developer console rather than a premium enterprise product. The redesign must use readable type, more whitespace, fewer borders, and progressive disclosure.

### 5. Typography violates the new design requirement

The current UI and generated surfaces use `IBM Plex Mono`, `ui-monospace`, and other mono declarations. The overhaul must remove serif and monospace font families from the visible ONEVibe product surface. Use one sans-serif family for display, body, metadata, controls, and code-like evidence labels; use weight, color, spacing, and containers instead of a typeface switch.

### 6. The current artifact/computer surface is powerful but not contextual

The Computer rail contains valuable evidence, but it competes with the conversation as a second application. It should become an inspector that opens when the user selects a tool call, screenshot, file, deck, validation report, or approval. On mobile it becomes a bottom sheet or route, not a permanently compressed second column.

## Target information architecture

```text
ONEVibe shell
├── Thread list / search / projects
├── Top bar: workspace, runtime truth, theme, share
├── Conversation surface
│   ├── Welcome + suggestions
│   ├── Durable user/assistant messages
│   ├── Collapsed reasoning + grouped tool activity
│   ├── Inline artifact cards / generative UI
│   └── Runtime-aware composer
└── Context inspector
    ├── Preview / deck / document
    ├── Computer screenshots + terminal
    ├── Files + diffs + validation
    └── External wallet approval details
```

The conversation remains the primary surface. The inspector is selected evidence, not another chronological transcript.

## UX workstreams

### P0 — runtime-native conversation foundation

- Introduce a real assistant-ui runtime adapter for the durable ONEVibe task/SSE contract.
- Map `pending`, `running`, `waiting_for_user_input`, `waiting_for_approval`, `completed`, `failed`, and `cancelled` into truthful assistant-ui state.
- Expose streaming assistant text as a running message rather than refreshing a completed snapshot with `isRunning: false`.
- Preserve durable server history as the authority; assistant-ui remains a projection and interaction layer.
- Remove duplicate raw timeline rows from the default conversation view.

### P0 — premium empty state and composer

- Use `ThreadPrimitive.Empty` / `ThreadPrimitive.Suggestions` for a quiet, responsive welcome state.
- Make the composer a single high-quality surface with dropzone, attachment previews, send/stop, retry, and keyboard behavior.
- Put runtime, mode, and skills behind a compact command palette with clear truth labels.
- Default to real chat when configured; demo is an explicit simulation choice.
- Prevent menus from occluding the composer and verify keyboard/focus behavior.

### P0 — progressive execution narrative

- Render assistant text, reasoning summaries, grouped tools, sources, and approvals through `MessagePrimitive.GroupedParts`.
- Use collapsible tool groups with status, duration, safe input summaries, and bounded results.
- Never display hidden chain-of-thought; show only provider-approved reasoning summaries and operational evidence.
- Keep wallet approval external and render it as a read-only request card with a deep link.

### P1 — artifact and Computer inspector

- Render PPTX/PDF/document/preview artifacts as typed inline cards and open them in the inspector.
- Move terminal, screenshots, files, diffs, and validation into selected evidence panels.
- Keep causal ordering and event hashes visible on demand, not in every row.
- Support desktop split view and mobile bottom-sheet/route behavior.

### P1 — thread list, skills, and projects

- Replace the dense sidebar list with assistant-ui-compatible thread navigation patterns: search, recents, active state, unread/running indicator, and accessible keyboard navigation.
- Make skills a nested, searchable command menu with category, description, version, execution status, and permission-neutrality explanation.
- Make project context visibly scoped to the next conversation and expose it through a compact context drawer.

### P1 — sans-serif visual system and accessibility

- Adopt a single sans-serif family such as Inter or Geist across the entire product surface.
- Remove `IBM Plex Mono`, `ui-monospace`, `monospace`, serif, and decorative font fallbacks from visible ONEVibe UI.
- Establish readable type tokens, minimum body/control sizes, consistent radii, spacing, focus rings, color contrast, and reduced-motion behavior.
- Replace telemetry-like uppercase microcopy with plain-language labels.
- Add desktop, tablet, mobile, dark, and light visual regression snapshots.

### P1 — interaction quality and reliability

- Add optimistic user-message insertion only when paired with a durable server acknowledgement.
- Make reconnect, retry, stop, queued guidance, and failure states obvious without duplicating messages.
- Preserve scroll position and show a new-activity affordance when the user reads older content.
- Add message edit, regenerate, branch, copy, export, and attachment review where the backend contract supports them.

## Acceptance bar

The overhaul is not complete when the page merely resembles an assistant-ui example. It must satisfy:

- No fake response or fabricated artifact path for ordinary chat.
- One authoritative durable conversation projection.
- Real running/stop/error/retry state from the backend.
- No duplicate plan/activity transcript in the default view.
- Artifact/computer evidence remains inspectable and task-bound.
- No visible serif or monospace typography.
- Keyboard navigation, reduced motion, readable contrast, and 390px/mobile layout pass.
- Browser screenshots demonstrate the empty state, simple chat, running tool call, artifact review, approval request, and failure/retry state.
- `npm run check` plus a browser acceptance matrix pass before the Linear parent moves to Done.

## Delivery order

1. Truthful chat/runtime adapter and P0 fake-runtime backlog (`ONE-233`–`ONE-237`).
2. Thread shell/composer migration to assistant-ui-native primitives.
3. Progressive reasoning/tool/artifact rendering.
4. Inspector and responsive navigation.
5. Skills/projects command surfaces.
6. Sans-serif design-system cleanup and visual regression.

The redesign must not broaden into website generation until the simple-chat and document-artifact journeys are reliable.

## 2026-07-16 — first shell overhaul pass

The first implementation pass addressed the most visible failure from browser review: at the browser's effective 1140px width, the old layout rendered the sidebar, conversation, and Computer inspector simultaneously. The conversation was compressed to roughly 408px and read like a telemetry console rather than an assistant product.

Implemented in the local ONEVibe app:

- The conversation is now the primary surface below 1250px; `View computer` opens a full-height, task-scoped inspector and `Back to conversation` returns to the thread. Desktop split view remains available on wider screens.
- Completed operational traces are progressive-disclosure details instead of a permanently expanded checklist. Live traces stay open while a provider turn runs; the complete server-backed trace remains available on demand.
- The assistant-ui message projection now includes a visible provider error surface through `MessagePrimitive.Error`, while tool calls remain grouped and artifact cards remain task-bound.
- The visual hierarchy now uses readable sans-serif sizing, larger message/composer controls, less telemetry-like microcopy, more whitespace, and a calmer light-surface treatment while retaining the ONEComputer green trust signal.
- Reduced-motion behavior is explicit, and the responsive inspector handoff was browser-checked with no horizontal overflow.

Verification: `npm run check` passed with 37 test files / 207 tests, production build, and E2E harness typecheck. Browser verification used persisted task `task_f8d51a10de4f4d`; the completed trace is collapsed by default, the real artifact cards remain visible, and the Computer handoff toggles the two surfaces without changing backend state. The live Claude gate later passed chat SSE, restart recovery, Markdown plus Bash evidence, and failure/retry recovery; the limitation remains host-process local proof only.

## 2026-07-16 — five-phase polish pass

A second same-day pass closed the remaining P0/P1 items visible in the
browser acceptance matrix. Each phase is one commit against `main`
with `npm run lint` + `npm run test 207/207` green.

### Phase 1 — remove IBM Plex Mono / monospace declarations

`src/index.css` (66 hits) and `src/timeline.css` (2 hits) still carried
`'IBM Plex Mono'`, `ui-monospace`, and other mono declarations for
uppercase kickers, section labels, evidence IDs, kbd shortcuts,
timeline anchors, workspace metadata, and notification counters. All
now resolve to the same Inter / system sans-serif stack used
elsewhere, closing the visible typography-contract violation from the
P1 sans-serif system workstream. `.claude/launch.json` is now
gitignored so the local preview harness does not enter the tree.

### Phase 2 — home / empty-state density

The composer no longer wraps a nested three-card template gallery, the
"Before you delegate" safety accordion no longer sits inside the
composer body, and the home-badge plus three-bullet assurance strip
below the starter prompts are gone. The hero clamps from 88px → 64px
so the composer stays above the fold at 1440x900. Copy trimmed:
"Give your team a capable cloud agent…" → "A capable cloud agent…".
Unused `starterTemplates` / `slideTemplates` / `chatTemplates`
constants removed with the gallery.

### Phase 3 — assistant message + tool-call polish

- Drop the "ONEVibe" sender label from every assistant turn; header
  now shows a quiet timestamp plus a Live badge while running.
- Rename the tool-call fallback string from "Governed runtime" to
  "Secure runtime" (cosmetic subtitle; "Governed" preserved for real
  evidence badges, approval labels, and durable ledger references).
- Bump tool-call typography: strong 11→12px 600, small 9→10.5px, body
  10→11.5px, timing chip 9→10px. Bump artifact-card: strong 10→12px
  600, small 8→10.5px, evidence eyebrow 7→10px (drop uppercase).
- Working trace collapses to "Review working trace (N steps)" once
  the turn completes; live traces still open automatically.

### Phase 4 — sidebar hierarchy + OpenVTC relocation

The "OpenVTC protected · External approvals enabled" card previously
occupied prime footer real estate in the sidebar at the same weight
as the primary user affordance. Moved to a compact "OpenVTC"
trust-chip in the topbar-right that collapses to icon-only under
720px. Conversation-row titles 11→12px, subtitles 9→10px, section
labels 10→10.5px so the sidebar reads as content, not chrome.

### Phase 5 — copy audit + acceptance evidence

Surgical copy audit: "governed" retained wherever it reflects real
enforcement (Library "Open governed task" opens the durable evidence
trail; notification "Review the governed task evidence" points at the
same ledger). Removed where cosmetic:
- `Loading governed workspace…` → `Loading task…`
- composer aria-label `Continue this governed task` → `Continue this task`
- mode picker `Flexible governed task` → `Flexible task with evidence`
- workspace placeholder `The governed workspace is materializing.` →
  `Building the task workspace.`

Acceptance screenshots at 1440x900 and 390x844 for welcome, skills,
library, computers, and schedules are stored in
`docs/evidence/2026-07-16-ux-overhaul/`. Follow-up: exact-width
visual-regression baselines and an active-task screenshot on a live
provider run — the same open items called out in the previous pass.

## 2026-07-16 — Claude/Perplexity reference alignment

The reference examples exposed two remaining gaps in the first pass: the thread was still a bespoke scroll/footer shell, and assistant responses were plain paragraphs rather than Markdown. The current slice now follows the high-value assistant-ui patterns without importing fake state:

- `ThreadPrimitive.Viewport` and `ThreadPrimitive.ViewportFooter` own the scroll and sticky composer boundary; the durable task/SSE adapter remains the source of truth.
- `@assistant-ui/react-markdown` with GFM is the `MessagePrimitive` text renderer. Markdown is now semantic and readable, including code spans, lists, headings, tables, and links.
- User turns are right-aligned document-like bubbles; assistant turns are quiet, readable content with hover/focus actions, grouped tool activity, progressive operational traces, and task-bound artifact cards.
- At 1139px, the active task collapses the history rail and shows conversation plus Computer evidence side-by-side. At narrower widths, the app falls back to the explicit inspector handoff so neither surface becomes unusably narrow.

This is a substantial parity improvement, but it does not close the program: native assistant-ui attachment primitives, branch/regenerate semantics, exact-width visual baselines, and the remaining Manus artifact interactions are still open.
