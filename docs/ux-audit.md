# ONEVibe UX Audit

> Phase 1 of the UX rebuild. Distils the current frontend (`src/`) into a specification:
> what exists, what it does, what is worth keeping, and what is non-negotiable for the rebuild.
> Source: full read of `src/` (18-area sweep) + `server/index.ts` route surface, worktree `ux/rebuild` @ `67c3249`.

---

## A. Feature inventory

The app is a single-page React 19 app. Routing is hand-rolled: `history.pushState` + `popstate`,
driven by `useUiStore.view` (`/?view=…`) and `activeTaskId` (`/tasks/:id`). No react-router.

### A.1 App shell (`src/App.tsx`, 457 lines)

Owns every query/mutation and prop-drills into views. Renders:

- `ThemeProvider` (tenant theme) → sidebar + main column.
- `BackendOfflineBanner` (`.backend-offline-banner`) when health checks fail; retry button.
- `DemoModeBanner` (`.demo-mode-banner`) when the active provider is the demo runtime.
- Topbar: sidebar toggle, `.task-kicker` breadcrumb, `.status-badge`, connection chip
  (`.connection.online`), `ThemeToggle`, notifications bell, share button, `mobile-inspector-toggle`.
- View switch on `useUiStore.view` → one of the views below; `activeTaskId` overrides with the task screen.
- Global mutations: `startTask` (POST /api/tasks), `followUpMutation`, `retryMutation`,
  `cancelMutation`, `patchTaskMutation`-equivalents for project/tags/agent/epic, share, schedules,
  skills install/remove, theme admin.

### A.2 LoginPage (`/`, when auth enabled && no session)

Two-step email OTP: email (+optional name) → 6-digit OTP. OTP input strips non-digits,
`pattern="[0-9]{6}"`, `autoComplete="one-time-code"`. Error `role="alert"`. Solid a11y.

### A.3 Home / new-task screen (`view=agent`, no active task)

- `HomeHero` — greeting (time-of-day, clamp 36–52px, 800 weight), `PromptComposer`, template
  starters, `ActiveNowPanel variant="home"` (import currently broken, see §C), recent-tasks
  section that is **killed by CSS** (`display:none!important`, index.css:805) while still rendered.
- `PromptComposer` — textarea + attach (≤4 files, ≤256 KB, base64), URL references (validated,
  ≤8, no credentials in query), three popover pickers (mode ×10, provider with advisory ranking
  + `Recommended` badge, model grouped by provider with "Server default"), selected-skills chips,
  simulation note when provider is demo. Enter submits, Shift+Enter newline, ⌘K focuses.
- `Capabilities` view — static brochure of provider capabilities, disabled buttons, hardcoded English.

### A.4 Board view (`view=board`, `BoardView.tsx`)

Kanban (5 columns: todo / in_progress / done / blocked / cancelled) + list (sortable table) modes.
Filters: agent assignee, active run. Cards: status/priority chip pickers (P12-05 — imports broken,
see §C), assignee chips, live indicator, title, project + label chips. Bottom: `active-now-strip`
of running agent tasks with 10 s ticking elapsed clock. Card a11y: `role="button"`, Enter/Space,
child-interactive guard. **CSS bug: 5 columns into `repeat(4, minmax(0,1fr))` → cancelled wraps.**

### A.5 Task detail / assistant thread (`/tasks/:id`)

- `AssistantThread` — assistant-ui `useExternalStoreRuntime` bound to the durable snapshot;
  messages with metadata (`taskId, turnId, provider, inputFiles, artifacts, trace`), tool-call
  projections, thinking blocks (click → opens SidePanel), streaming cursor / typing indicator,
  follow-up composer, cancel/retry, queued-guidance display, fork/copy. Sanitization:
  `safeArtifactPath` / `safeArtifactUri` / `safeTraceDetail`.
- `Workspace` — right-side panel, **16 tabs** (preview, computer, files, versions, validation,
  evidence, …). `?tab=` URL contract with `workspaceTabs` canonical list, fallback `preview`.
  Auto-switch preview→computer on first tool event unless manually selected. Decorative macOS
  traffic lights + fake `local.onevibe.dev` URL bar.
- `ComputerTimeline` — evidence-honest execution trace (event rows, rail filters, run compare),
  URL params `?event&rail&run&compare` (replaceState only), keyboard nav, redaction rules.
- `TaskTimeline` — **plan strip only** (name lies): `InlineTaskPlan`, `ApprovalCard`,
  `UserInputCard`. `timeline.css` entirely dead.
- `SidePanel` — collapsible right panel (0→360px) with reasoning-trace markdown + `MilestoneProgress`.

### A.6 Computers view (`view=computers`)

Runtime health cards per provider (test button → `POST /api/runtime/test/:provider`),
diagnostics (`GET /api/diagnostics`), governed-runtime cards, MCP server CRUD + health
(`GET /api/mcp/:id/health`). Stale-age text never re-renders; 8px uppercase labels.

### A.7 Artefacts (`view=artefacts`) + Library (`view=library`) + SharedArtifact (`/share/:id`)

- `Artefacts` — gallery grid over all task files: thumbnails (images via `&raw=1`, code via
  excerpt fetch per card, icon tiles otherwise), category filter tabs (all/documents/images/code/
  links), search, download links. Import `../lib/artefacts` **missing** (see §C). Dead CSS `.artefacts-grid`.
- `Library` — saved items list, hardcoded English, delete per item.
- `SharedArtifact` — public share page, no error state (spinner forever on 404), not wrapped in
  `ThemeProvider`.

### A.8 Schedules (`view=schedules`)

CRUD for `TaskSchedule`: create form (name, prompt, interval/mode/runtime selects — unavailable
providers disabled), list rows sorted by `nextRunAt` with Run now (only when enabled) / Pause /
Resume / Delete (`window.confirm`). Error `role="alert"` on create; other errors toast (inconsistent).

### A.9 Skills library (`view=skills`)

Card grid of `TaskSkill` "working guides" (max 4 selected, enforced in UI + `toggleSkill`),
marketplace install/remove (remove also deselects), fallback catalog when query fails.
Honest copy ("skills do not grant tools"). No `aria-pressed` on toggles.

### A.10 Appearance + Homepage editor (`view=appearance|homepage`)

Owner-only tenant theme editors. Appearance: brand, 9 color tokens (paired color+hex inputs),
font/radius selects, live preview aside, `expectedVersion` optimistic concurrency (409 → reload
message), Escape clears banners. Homepage: hero copy, announcement, ≤6 feature cards.
Three near-identical early-return states duplicated in both files.

### A.11 Sidebar (`Sidebar.tsx`)

30 props. Brand mark, new-task button, 10-item nav (too many), server-side conversation search
(180ms debounce, ≥2 chars), conversation list grouped with epic chips (2 chips, chip before title,
filter row hidden when no epics — test-locked), project-knowledge section (3,400-char JSX blob,
line 167), `ActiveNowPanel variant="sidebar"` (broken import), load-more pagination.
Collapses ≤1250px on task routes; backdrop + 29/30 z-index ladder.

### A.12 Small components

`ApprovalCard` (VTI wallet receipt, 4 states, honest custody copy, skeuomorphic `.wallet-phone`),
`UserInputCard` (inline answer form, errors swallowed), `ValidationReport` (strict-parsed read-only),
`MilestoneProgress` (cleanest component: a11y + motion gating correct), `TaskPlan` (**dead code**),
`MarkdownText` (assistant-ui markdown, GFM), `HighlightedCode` (fragile regex highlighter),
`BrandMark`, `LoginPage`, `ThemeToggle` (system→light→dark cycle).

---

## B. Data model summary

Types in `src/types.ts` (client) — server twins in `server/types.ts` diverge slightly (see §D.6).

- **`Task`** — id, title, prompt, `status: RunStatus`, `boardStatus?: BoardStatus | null`,
  `priority?: TaskPriority | null`, `projectId`, `labels?: string[]`, `assignedAgent?`
  (comma-separated, `'human'` sentinel), `epicId?`, `provider`, `mode`, `model?`, `approval?`,
  `queuedGuidance[]`, timestamps (`createdAt/updatedAt/startedAt/completedAt`).
- **`RunStatus`** — `'queued' | 'running' | 'completed' | 'failed' | 'cancelled'` (+ transient
  `'cancelling'` from POST cancel).
- **`BoardStatus`** — `'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled'`. User-set value
  wins; otherwise derived from `RunStatus` (`boardStatusFor`).
- **`TaskPriority`** — `'urgent' | 'high' | 'medium' | 'low'` (nullable).
- **`TaskSnapshot`** — `Task` + `events: RuntimeEvent[]` + `files: WorkspaceFile[]` +
  `messages: ChatMessage[]`. The unit the task screen renders.
- **`RuntimeEvent`** — `{ id, taskId, sequence, type: string (loose client-side; 22-member union
  server-side), status?, payload, timestamp }`. Durable, append-only, deduped by `id`.
- **`ChatMessage`** — `{ id, role, content, turnId, inputFiles?, createdAt }`.
- **`ConversationSummary`** — sidebar list item: id, title, preview (180 chars, whitespace-collapsed),
  `updatedAt`, project/epic fields; sort `updatedAt desc, id desc`.
- **`Project`** — id, name, description?, `isDefault?`, `parentId?` (epic hierarchy), file counts.
- **`WorkspaceFile`** — `{ path, size, hash?, updatedAt? }` (private paths filtered server-side).
- **`RuntimeReadiness`** — `{ providers: ProviderHealth[], defaultProvider?, suggestions: Record<mode, Suggestion> }`.
- **`ProviderHealth`** — `{ id, label, available, capabilities[], detail?, latencyMs? }`.
- **`ModelInfo`** — `{ id, label, provider, contextK, tags[] }`.
- **`TaskSchedule`** — id, name, prompt, `intervalMinutes` (15/60/1440/10080), mode, provider,
  `enabled`, `nextRunAt`.
- **`TaskSkill`** — id, title, summary, icon, source (`builtin|marketplace`), `installed?`,
  `selectable?`.
- **`LibraryItem`** — `{ task: Task, files: WorkspaceFile[], versionCount? }`.
- **`TenantThemeConfig` / `TenantThemeSummary`** — tokens (9 colors + fontUi whitelist + radii),
  brand (logoUrl/Alt/Name/Sha256), homePage, navigation, features, compliance; `version` for
  optimistic concurrency.
- **Relationships**: Project 1—n Task (and 1—n Project via `parentId` = epics); Task 1—n
  RuntimeEvent / ChatMessage / WorkspaceFile; Task n—1 Project; Schedule → spawns Task;
  Skill n—m Task (via composer selection); LibraryItem = Task × files join.

---

## C. Current UX verdict

### What works (keep the behavior, reskin the chrome)

- **Evidence honesty.** ComputerTimeline, ValidationReport, ApprovalCard, demo/simulation notes —
  the product never lies about what is real. This is the brand.
- **The data spine.** `useTask` (snapshot + SSE merge, dedup by id, rAF batching, honest reconnect),
  cursor-paginated conversations, `expectedHash`/`expectedVersion` conflict handling.
- **Provider advisory ranking** in PromptComposer (score sort, Recommended badge, incompatibility
  gating) and the dense left-action row — genuinely Linear-like thinking.
- **Board card a11y contract** and epic-chip behavior (test-locked, correct).
- **MilestoneProgress** — the one component that needs zero UX surgery.
- **Theme security pipeline** (regex validation, SHA-256 logo, SVG sanitize) — security contract, keep.

### What is broken

1. **Build is red**: `ActiveNowPanel.tsx`, `ChipPicker.tsx`, `lib/board-metadata.ts`,
   `lib/artefacts.ts` were imported by commit `0f509ac` but never written. Two test files fail,
   build phase never runs. `App.tsx:419` renders `BoardView` without required `onPatchTask`.
   i18n keys `setStatus`/`setPriority`/`noPriority` missing.
2. **Board CSS**: 5 columns declared, `repeat(4, minmax(0,1fr))` grid → the `cancelled` column wraps.
3. **`.home-hero-recent` killed by `display:none!important`** (index.css:805) while HomeHero still
   renders the DOM — dead weight shipping to the browser.
4. **SharedArtifact has no error state** — a bad share ID spins forever.
5. **Workspace SSE-storm refetching**; Computers stale-age never re-renders.
6. **boot.js default mismatch**: invalid storage → light, `useTheme` → system; first-visit flash.
7. **Tenant theme stomps light mode** — inline tenant vars beat `[data-theme=light]` stylesheet vars.

### What is AI slop (design debt to delete)

- **`src/index.css` is a geological core sample**: 1,257 lines, ~2,330 rules, 14 labeled pivot
  strata ("PHASE 4"…"PHASE 14", "AESTHETIC RESET", "SIDEBAR RESTRAINT"), ~100 `!important`
  declarations warring across strata. `.composer` alone is redefined **8+ times**. `.sidebar`
  background redeclared 4× (including a gradient + `!important`). Duplicate `@keyframes spin`;
  keyframes emptied in place; three conflicting mobile-inspector media blocks; 15+ breakpoints.
  Every color is an unreadable hash alias `var(--theme-color-<hash>)`. **Rebuild, don't patch.**
- **Generic SaaS hero chrome on dense tools**: 42–52px 800-weight greeting, eyebrow + lede +
  decorative 28px lucide icon repeated across 5+ views (Schedules, Skills, Appearance, Homepage,
  Computers). This is a landing page, not a console.
- **Decoration without information**: macOS traffic lights + fake `local.onevibe.dev` URL bar
  (Workspace); `.wallet-phone` skeuomorph (ApprovalCard); `.secure-signal-cut` clip-path corner
  notches; permanent accent dot on ThemeToggle; giant `0 22px 70px` glow shadows; gradient text
  added in Phase 6 then stripped in Phase 11; `translateY(-1px)` hover lifts everywhere.
- **Illegible type**: 8–10px uppercase labels in ComputerTimeline, Computers, Appearance,
  mobile-inspector toggle. Information density ≠ unreadability.
- **Dead code**: `TaskPlan.tsx`, `timeline.css`, `onecomputer-client.ts` (client copy), ThemeSlot,
  PromptComposer `compact`/`queueable` variants, `.trust-card`/`.ambient-grid`/`.template-gallery`
  CSS clusters, mode catalog's 10 filler-icon modes.
- **Capabilities view** — a static brochure with disabled buttons. Either make it real or cut it.

---

## D. What must be preserved (non-negotiable rebuild constraints)

### D.1 Routes (pushState-based, no router lib)

| Route | View |
|---|---|
| `/` | home (agent view + HomeHero) |
| `/?view=agent\|board\|computers\|schedules\|skills\|library\|artefacts\|capabilities\|appearance\|homepage` | views per `AppView` union |
| `/tasks/:id` | task detail (AssistantThread + Workspace) |
| `/share/:id` | public SharedArtifact (outside ThemeProvider) |

`?tab=<workspaceTab>` (+ `event/rail/run/compare` for the computer tab) inside task routes.
`viewFromLocation` fallback = `agent`. Sidebar auto-collapses ≤1250px on task routes.

### D.2 API calls (`src/lib/api.ts`) — all preserved, shapes unchanged

Highlights: `createTask` (8-arg composer → POST body incl. optional `model`), `patchTask`
(PATCH `{status?, priority?}` — board metadata only, never runtime status), `followUp` /
`retryTask` (idempotency key, 202-vs-200 replay semantics), `cancelTask`, file ops with
`expectedHash` 409, `getFileExcerpt` (12k cap), conversations cursor pagination + server-side
`q`, projects CRUD + project files, schedules CRUD + run, skills + marketplace install/remove,
MCP CRUD + health, theme admin (expectedVersion, 409 `theme_version_conflict`), share
(202 approval / 200 share), search, models, runtime/diagnostics. Error envelope `{error, code?}`.

### D.3 Store shapes (zustand, `src/lib/stores.ts`)

- `useUiStore`: `view, activeTaskId, activeProjectId ('project_onevibe'), sidebarOpen,
  mobileInspectorOpen, notificationsOpen, backendOffline, retryingBackend` + setters
  (sidebarOpen/notificationsOpen accept updater fns).
- `useComposerStore`: `selectedSkills, creating, preferredModel?` + setters.
- `useSessionStore`: `authState?, authLoading` + setters.
- `useSidePanelStore`: `content: {kind:'reasoning', messageId, text} | null`, `openPanel`, `closePanel`.

localStorage keys: `onevibe-theme` (`light|dark|system`, cycle system→light→dark→system),
`onevibe_locale`, `onevibe.selected-model`, `onevibe.selected-skill-ids`.

### D.4 Auth flow

`GET /api/auth/session` on boot → `authLoading` false → if `enabled && !session` render
`LoginPage` (OTP: `send-verification-otp` → `sign-in/email-otp` → `onAuthenticated` refetch).
Sign-out → `POST /api/auth/sign-out`. OTP sanitization (digits only, 6-char gate,
`one-time-code` autocomplete) preserved.

### D.5 Live data contract

- SSE: `GET /api/tasks/:id/events`, named event `runtime_event`, frames carry durable `id`,
  `retry: 1500` preamble, `: keepalive` 15 s, `Last-Event-ID` `${taskId}:event:${sequence}`
  (task-bound, cross-task rejected). `useTask` helpers and their test contracts:
  `reconnectDelayMs` = [500,1000,2000,4000,8000], `appendRuntimeEvent` dedup by id + apply
  `event.status`, stream-interruption copy null on terminal status.
- TanStack Query keys: `['tasks']`, `['conversations']`, `['models']`, `['schedules']`,
  `['skills', userId]`, `['theme','current',scopeKey]`, `['theme','admin']`,
  `['theme','detail',tenantId]`, `['mcp']`, `['library']`. Defaults `retry:1, staleTime:15s,
  refetchOnWindowFocus:false`.

### D.6 Behavioral contracts pinned by tests (do not regress)

- AssistantThread `statusFor` mapping (streaming→running; completed→complete/stop;
  cancelled→incomplete/cancelled; failed→incomplete/error); `metadata.custom` keys;
  `safeArtifactPath/Uri/TraceDetail` sanitization.
- BoardView: `boardStatusFor(status, boardStatus)` — explicit boardStatus wins; priority nullable;
  `onPatchTask(id, {status})` and `(id, {priority})` called separately; card Enter/Space with
  child-interactive guard.
- Sidebar epic chips: exactly 2 chips, chip before title, filter row hidden when no epics.
- PromptComposer: 8-arg onSubmit; Enter/Shift+Enter; ⌘K focus; reference-URL validation
  (http(s), no userinfo, no `token|secret|api_key|password=` in query, ≤8, deduped);
  attachments ≤4 × ≤256 KB base64; provider auto-preference + `providerTouched` opt-out.
- `normalizeSelectedSkillIds`: drop invalid/duplicate, preserve order, cap 4, catalog-validated.
- ThemeProvider: `themeQueryKey(scopeKey)`, luminance/contrast helpers, contrast attributes,
  cleanup of inline properties on unmount; tenant token regexes (hex 6–8, radius `0|\d{1,3}px`,
  font whitelist).
- Milestone phase ids `understand|gather|draft|finalize`; `milestone_set`/`milestone_complete`.
- `HUMAN_ASSIGNEE='human'`; `formatElapsed` shapes; conversation preview 180 chars + fallbacks;
  `upsertConversation` sort; `readableBytes`; `CsvParseError` messages; `sanitizeSvg` strip list.
- ThemeToggle aria-label `Theme: ${preference}. Switch to ${next} theme`.
- i18n: all user strings via `t(key, locale)`, en + zh, `keyof typeof en` type safety.

### D.7 CSS/architecture invariants for the rebuild

- Import order `theme/default.css` → `timeline.css` → `index.css` (main.tsx). The rebuild
  replaces index.css wholesale; default.css hash-token contract may be **replaced by readable
  semantic tokens** (this is the point of the rebuild) as long as dark default + `[data-theme=light]`
  keep working.
- z-index ladder: sidebar 30 > backdrop 29 (mobile). `.app-shell` 252px grid + collapsed variant.
- `prefers-reduced-motion` gating on all motion; `:focus-visible` rings on every interactive
  element; `aria-label` on icon-only buttons.
- Sans-serif only (no mono/serif fonts in UI per AGENTS.md).
- No new npm dependencies without documented justification; lucide-react + framer-motion +
  assistant-ui stay.
