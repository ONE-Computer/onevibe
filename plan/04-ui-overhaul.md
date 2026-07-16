# Phase 4 — Professional UI

> **Goal**: No hardcoded strings, no dead controls, no swallowed errors. UI quality matches OpenWork.
> **Exit criterion**: Every one of the 50 issues in `plan/00-gap-analysis.md` is closed. State management is Zustand + TanStack Query.
> **Tasks**: P4-01 through P4-20 in `TODO.md`
> **Prerequisite**: Phases 1–3 complete.

---

## Study First

Before implementing, read these OpenWork files in `/tmp/openwork`:
- `apps/app/src/stores/` — all Zustand stores; understand split between ui-state, composer-state, session-management
- `apps/app/src/components/session/` — session surface: tabs, split view, permission panel
- `apps/app/src/components/artifact/` — artifact panel, spreadsheet editor, file viewer

---

## P4-01: Zustand Store Migration

**Problem**: `App.tsx` has 17 `useState` calls, 8 `useCallback` fetchers, and 10+ `useEffect` chains. This makes state derivation hard to follow, causes unnecessary re-renders, and makes it impossible to access state from deeply nested components without prop drilling.

**Target architecture** (3 stores):

### `src/stores/useUiStore.ts`
```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type UiStore = {
  sidebarOpen: boolean
  mobileInspectorOpen: boolean
  notificationsOpen: boolean
  activeView: AppView
  activeTaskId: string | null
  activeProjectId: string
  setSidebarOpen: (v: boolean) => void
  setActiveTaskId: (id: string | null) => void
  setActiveView: (v: AppView) => void
  // ...actions
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileInspectorOpen: false,
      notificationsOpen: false,
      activeView: 'agent',
      activeTaskId: null,
      activeProjectId: 'project_onevibe',
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      // ...
    }),
    { name: 'onevibe-ui', partialize: (s) => ({ sidebarOpen: s.sidebarOpen }) }
  )
)
```

### `src/stores/useComposerStore.ts`
```ts
// Per-task draft state: prompt, attachments, references, queued draft
type ComposerStore = {
  drafts: Map<string | 'home', { prompt: string; attachments: DraftAttachment[] }>
  queuedDraft: string | null
  // ...
}
```

### `src/stores/useDataStore.ts`
```ts
// All server-fetched collections — replaced by TanStack Query (P4-02)
// This store only holds derived state that doesn't come from the server
```

**Migration strategy**: Migrate one `useState` group at a time, starting with `activeTaskId` and `activeView` (highest prop-drilling impact). Each migration must keep `npm run check` green.

---

## P4-02: TanStack Query

**New dependencies**:
```bash
npm install @tanstack/react-query @tanstack/react-query-devtools
```

**Wrap app** in `src/main.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } }
})
// Wrap <App /> with <QueryClientProvider client={queryClient}>
```

**Replace each `useEffect` fetch** with a query hook. For each data type:

```ts
// src/hooks/useConversations.ts
export const useConversations = (cursor?: string) =>
  useQuery({
    queryKey: ['conversations', cursor],
    queryFn: () => listConversations(cursor),
    staleTime: 10_000,
  })

// src/hooks/useSchedules.ts
export const useSchedules = () =>
  useQuery({ queryKey: ['schedules'], queryFn: listSchedules })

// src/hooks/useScheduleMutations.ts
export const useCreateSchedule = () => useMutation({
  mutationFn: createSchedule,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  onError: (err) => toast.error(`Failed to create schedule: ${err.message}`),
})
```

**Benefits**: Automatic loading/error/empty states, cache invalidation on mutation, no manual `setTasks` / `setConversations` calls, no stale data.

---

## P4-03: Toast System

**New dependency**:
```bash
npm install sonner  # lightweight, zero-config toast
```

**Setup** in `src/main.tsx`:
```tsx
import { Toaster } from 'sonner'
// Inside the app tree:
<Toaster position="bottom-right" richColors />
```

**Usage** (replaces all swallowed errors):
```ts
import { toast } from 'sonner'

// Success:
toast.success('Schedule created')

// Error:
toast.error(`Failed to toggle schedule: ${err.message}`)

// With action:
toast('Workspace restored', {
  description: 'Version from 3 hours ago',
  action: { label: 'Undo', onClick: () => void restoreVersion(task.id, previousVersionId) }
})
```

**Wire to every mutation** — all 12 currently-swallowed async failures:
1. Schedule toggle
2. Schedule run-now
3. Schedule create
4. Project create
5. Project file remove
6. Project context update
7. History restore
8. Tag save
9. Task cancel
10. Task retry
11. Library item delete (P4-07)
12. File save (Workspace code editor)

---

## P4-04: Fix Dead Controls

### `<Settings2>` icons

**Sidebar.tsx:146** (Conversations header settings icon):
Wire to a "Conversation settings" panel (sort order, group by, search toggle). Minimal for now: open a small popover with "Sort: newest first / oldest first".

**Sidebar.tsx:174** (Footer user row settings icon):
Wire to a user settings panel: display name, sign out button (from P3-01 auth), theme toggle shortcut.

### `<RefreshCw>` in Workspace toolbar (`Workspace.tsx:214`)
Wire to a `refresh` action that calls `refreshSnapshot()` (already available from `useTask`). Add `aria-label="Refresh workspace"`.

### Skills pill badge (`Sidebar.tsx:137`)
Replace hardcoded `8` with `{skillCatalog.length}` or `{selectedSkills.length + '/' + 4}`.

---

## P4-05: Fix Hardcoded Identity

After P3-01 (auth) ships:
```ts
// src/hooks/useCurrentUser.ts
import { useSession } from '../lib/auth'

export const useCurrentUser = () => {
  const { data: session } = useSession()
  return {
    name: session?.user.name ?? session?.user.email?.split('@')[0] ?? 'You',
    email: session?.user.email ?? '',
    initials: getInitials(session?.user.name ?? session?.user.email ?? '?'),
  }
}
```

Replace every hardcoded reference:
- `"Terence"` → `currentUser.name`
- `TT` → `currentUser.initials`
- `"Local workspace"` → `"Personal workspace"` or org name
- `local.onevibe.dev` → `window.location.host`

---

## P4-06: Schedule Delete

**Backend**: Add `DELETE /api/schedules/:id` to `server/index.ts`

**Frontend** (`src/components/Schedules.tsx`):
1. Add trash icon button per schedule row
2. On click: show inline confirm: "Delete this schedule? This cannot be undone." with Confirm/Cancel
3. On confirm: call `deleteSchedule(id)` → TanStack Query invalidates `['schedules']` → row disappears → toast "Schedule deleted"

---

## P4-07: Library Item Delete

**Backend**: Add `DELETE /api/library/:taskId` to `server/index.ts`

**Frontend** (`src/components/Library.tsx`):
1. Add "Remove" action to each library card (behind a `...` menu or on hover)
2. Confirm dialog → delete → toast

---

## P4-08: History Restore Confirmation

**File**: `src/components/Workspace.tsx`

Replace direct `onClick`:
```tsx
// Before (dangerous):
onClick={() => void restoreVersion(task.id, version.id)}

// After (safe):
onClick={() => setRestoreTarget(version)}
```

Add a `ConfirmDialog` component:
```tsx
{restoreTarget && (
  <ConfirmDialog
    title="Restore this version?"
    body={`This will replace the current workspace with the version from ${formatDate(restoreTarget.createdAt)}. This cannot be undone.`}
    confirmLabel="Restore"
    onConfirm={async () => {
      await restoreVersion(task.id, restoreTarget.id)
      setRestoreTarget(null)
      toast.success('Workspace restored')
    }}
    onCancel={() => setRestoreTarget(null)}
    loading={isRestoring}
  />
)}
```

---

## P4-09: Evidence Log Pagination

**File**: `src/components/Workspace.tsx:265`

Replace `task.events.slice(-6)` with paginated view:
```tsx
const [showAllEvents, setShowAllEvents] = useState(false)
const visibleEvents = showAllEvents ? task.events : task.events.slice(-6)

// Render:
{visibleEvents.map(event => <EventRow key={event.id} event={event} />)}
{task.events.length > 6 && !showAllEvents && (
  <button onClick={() => setShowAllEvents(true)}>
    Show all {task.events.length} events
  </button>
)}
```

---

## P4-10–P4-20: Remaining Fixes

Quick-reference implementation notes for each remaining task:

| Task | File | Fix |
|---|---|---|
| P4-10 | `Workspace.tsx:279` | `task.projectId` → `projects.find(p => p.id === task.projectId)?.name ?? task.projectId` |
| P4-11 | multiple `<time>` | Add `dateTime={new Date(timestamp).toISOString()}` everywhere |
| P4-12 | `SkillsLibrary.tsx` | Add `disabled={selected.length >= 4 && !selected.includes(skill.id)}` + tooltip |
| P4-13 | multiple | Add `statusLabel(status: RunStatus): string` map; use everywhere |
| P4-14 | `Schedules.tsx`, `Sidebar.tsx` | Add `providerLabel(id: string): string` function; import in both |
| P4-15 | `Sidebar.tsx` | Add search `<input>` to sidebar header; wire to `listConversations(undefined, 50, query)` |
| P4-16 | `AssistantThread.tsx:57` | Add `<ChevronDown>` to `<summary>`; add `open` attribute management |
| P4-17 | `Workspace.tsx:229` | `<img onError={e => { e.currentTarget.style.display = 'none' }} ...>` |
| P4-18 | `AssistantThread.tsx:72` | Remove the unconditional `<span className="typing-indicator">` at line 72; keep only the one inside `GroupedParts` |
| P4-19 | `AssistantThread.tsx:32` | Replace `Math.ceil(file.size / 1024) KB` with `readableBytes(file.size)` |
| P4-20 | `index.html:24` | `document.querySelector('meta[name="theme-color"]')?.content = ...` |

---

## `statusLabel` Reference

```ts
// src/lib/labels.ts
export const statusLabel = (status: RunStatus): string => ({
  pending: 'Pending',
  running: 'Running',
  waiting_for_approval: 'Awaiting approval',
  waiting_for_user_input: 'Waiting for input',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
})[status] ?? status

export const providerLabel = (id: string): string => ({
  demo: 'Simulation (no model call)',
  claude_sdk: 'Claude Agent SDK',
  onecomputer: 'ONEComputer sandbox',
  remote: 'Remote runtime',
  e2b: 'e2b cloud sandbox',
})[id] ?? id
```

---

## Test Plan

1. All 50 issues from `plan/00-gap-analysis.md` — manually verify each
2. Create and delete a schedule → toast confirms → row gone
3. Create and delete a library item → toast confirms → card gone
4. Restore history version → confirm dialog → loading state → toast
5. Click both Settings2 icons → something useful opens
6. Open evidence log → see all events → collapse to 6 → expand again
7. Search conversations by keyword → results filter in real-time
8. View a task with no project name in DB → shows ID, not crash
9. Open Skills → try to select 5th skill → button disabled + tooltip
10. `npm run check` → green
