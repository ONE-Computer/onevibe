# Phase 2 — Real Agent Runtime

> **Goal**: Claude writes a file to disk; it appears in the workspace panel. Draft queuing works. Fork/edit-message works.
> **Exit criterion**: Submit "Write a Python hello world to hello.py" → Claude writes the file → file appears in workspace file list → you can click it and see the content.
> **Tasks**: P2-01 through P2-07 in `TODO.md`
> **Prerequisite**: Phase 1 complete. `claude_sdk` is the default.

---

## Study First

Before implementing, read these OpenWork files in `/tmp/openwork`:
- `apps/server/src/opencode-plugins/openwork-capabilities-knowledge.ts` — how system-prompt steering is injected
- `apps/app/src/sync/transcript-reconcile.ts` — merging streamed partials with snapshots
- `apps/app/src/components/chat/composer/composer.tsx` — production composer with draft queue
- `apps/app/src/sync/session-sync.ts` — per-frame delta coalescing pattern

---

## P2-01: Wire Tool Execution

**Context**: `server/claude-sdk-runner.ts` wraps `@anthropic-ai/claude-agent-sdk`. The agent can use tools. The question is whether tool execution results (especially file writes) are surfaced back as `runtime_event` entries and visible in the workspace panel.

**Investigation needed**:
```bash
grep -n "tool" server/claude-sdk-runner.ts | head -30
grep -n "files" server/claude-sdk-runner.ts | head -20
grep -n "workingDir\|cwd\|workspace" server/claude-sdk-runner.ts | head -20
```

**Expected fix**: Each task needs a dedicated working directory:
```ts
// server/store.ts or server/index.ts
const taskWorkingDir = path.join(DATA_DIR, 'tasks', task.id, 'workspace')
await mkdir(taskWorkingDir, { recursive: true })
// Pass to adapter
const adapter = new ClaudeSdkRuntimeAdapter({ ..., workingDir: taskWorkingDir })
```

After each tool call that writes files, emit a `runtime_event` of type `file_written` so the workspace panel can refresh:
```ts
// In claude-sdk-runner.ts after tool execution:
store.appendEvent(taskId, {
  type: 'file_written',
  lane: 'artifact',
  label: result.path,
  payload: { path: result.path, size: result.size }
})
```

The workspace panel's "Files" tab calls `/api/tasks/:id/files` which calls `store.getFiles()`. Verify this reads from `taskWorkingDir`, not a hardcoded path.

---

## P2-02: Delta Coalescing

**Context**: Currently every SSE `message_delta` event triggers a React state update via `setSnapshot`. For long Claude responses (1000+ tokens), this means 1000+ re-renders of `AssistantThread`.

**Fix**: Add a frame buffer in `useTask.ts`:
```ts
const deltaBuffer = useRef<Map<string, string>>(new Map()) // messageId → accumulated delta
const frameScheduled = useRef(false)

const flushDeltas = useCallback(() => {
  frameScheduled.current = false
  if (!deltaBuffer.current.size) return
  const deltas = new Map(deltaBuffer.current)
  deltaBuffer.current.clear()
  setSnapshot(current => {
    if (!current) return current
    // Apply all buffered deltas to messages in one update
    return applyDeltasToSnapshot(current, deltas)
  })
}, [])

// In SSE message handler, for delta events:
if (event.type === 'message_delta') {
  const existing = deltaBuffer.current.get(event.messageId) ?? ''
  deltaBuffer.current.set(event.messageId, existing + event.content)
  if (!frameScheduled.current) {
    frameScheduled.current = true
    requestAnimationFrame(flushDeltas)
  }
  return // Don't call setSnapshot directly
}
```

This batches all deltas within a single animation frame (~16ms) into one state update. Matches OpenWork's `deltaFlushBuffer` pattern exactly.

---

## P2-03: Draft Queuing

**Context**: OpenWork allows sending a follow-up while the agent is running. The message queues locally and is sent automatically when the agent goes idle.

**Current state**: `PromptComposer.tsx` has `queueable` prop. When `queueable === true`, the placeholder says "Guide the next turn". But there's no actual local queue — the message is sent immediately via `sendFollowUp`, which the server may or may not handle.

**Fix**:
1. Add `useComposerStore` (Zustand) or extend `App.tsx` state with `queuedDraft: string | null`
2. When composer sends while `task.status === 'running'`:
   - Store the message locally in `queuedDraft`
   - Show a dismissible banner: "Your message will send when Claude finishes"
   - Don't call `sendFollowUp` yet
3. In `useTask.ts`, watch for `snapshot.status` transitioning from `running` → `completed` or `waiting_for_user_input`:
   ```ts
   useEffect(() => {
     if (!snapshot || !queuedDraft) return
     if (snapshot.status === 'completed' || snapshot.status === 'waiting_for_user_input') {
       void sendFollowUp(snapshot.id, queuedDraft).then(() => setQueuedDraft(null))
     }
   }, [snapshot?.status, queuedDraft])
   ```
4. Show the queued draft in the conversation as a greyed-out "pending" message bubble

---

## P2-04: Fork / Edit-Message

**Context**: OpenWork allows editing any prior user message to branch a new conversation. This is critical for iterative work.

**Backend**: Needs a new endpoint:
```
POST /api/tasks/:id/fork
Body: { fromMessageId: string, newPrompt: string }
Response: Task (new forked task)
```

The fork creates a new task with the same project/provider/mode, truncated history up to `fromMessageId`, with `newPrompt` as the new last user message, and starts running.

**Frontend**:
1. In `AssistantThread.tsx`, on hover of any user message, show an "Edit" button
2. Clicking Edit opens an inline editor (replace message bubble with textarea pre-filled)
3. On confirm: call `forkTask(taskId, messageId, newPrompt)` → navigate to new task
4. Show a "Branched from [original title]" badge in the new task's conversation header

**API function** to add to `src/lib/api.ts`:
```ts
export const forkTask = async (taskId: string, fromMessageId: string, newPrompt: string) =>
  parse<Task>(await fetch(`/api/tasks/${taskId}/fork`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromMessageId, newPrompt })
  }))
```

---

## P2-05: `waiting_for_user_input` UX Fix

**Files**: `src/components/AssistantThread.tsx`, `src/lib/assistant-message.ts`

**Problems**:
1. `isRunning` in `AssistantThread.tsx:192` includes `waiting_for_user_input` → "Writing…" header shows
2. `UserInputCard` exists but may not be prominently positioned
3. Send button disabled with no explanation

**Fix**:
1. Remove `waiting_for_user_input` from `isRunning` condition:
```ts
const isRunning = task.status === 'pending' || task.status === 'running'
```
2. Add separate `isWaiting` flag for `waiting_for_user_input` state
3. When `isWaiting`, show a dedicated banner above the composer:
```tsx
{task.inputRequest && (
  <div className="input-request-banner">
    <strong>Claude is waiting for your answer:</strong>
    <p>{task.inputRequest.prompt}</p>
    {task.inputRequest.options.length > 0 && (
      <div className="input-options">
        {task.inputRequest.options.map(opt => (
          <button key={opt} onClick={() => void answerInput(task.id, task.inputRequest!.id, opt)}>
            {opt}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```
4. When `isWaiting`, composer placeholder: "Type your answer…" (not "Reply to ONEVibe")

---

## P2-06: Real Workspace File Browser

**Files**: `src/components/Workspace.tsx`

**Current problem**: "Files" tab in workspace shows files from `task.files` (populated by server). But:
1. When `task.previewPath` is null, the workspace shows "Building workspace" forever even for completed tasks
2. The file list may not auto-refresh after agent writes files

**Fix**:
1. The "Building workspace" placeholder should only show when `task.status === 'running'`. When `status === 'completed'` and `previewPath === null`, show: "No preview generated for this task type."
2. In `App.tsx`, subscribe to `snapshot.events` for `type === 'file_written'` events and trigger a files refresh
3. Files should be clickable: clicking opens the file content in a `CodeMirror` editor panel
4. Add a download button per file that fetches `/api/tasks/:id/file?path=...` and triggers browser download

---

## P2-07: Permission Approval Panel

**Files**: `src/App.tsx`, `src/components/` (new `ApprovalPanel.tsx`)

**Current state**: `ApprovalCard.tsx` exists but is likely rendered inside the workspace, not prominently in the conversation flow.

**Fix**: Render mid-conversation above the composer, matching OpenWork's pattern:
```tsx
// In conversation-pane, immediately above PromptComposer:
{snapshot?.approval?.state === 'pending' && (
  <ApprovalPanel
    approval={snapshot.approval}
    onApprove={() => void fetch(`/api/tasks/${snapshot.id}/approvals/${snapshot.approval!.id}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' })
    }).then(refreshSnapshot)}
    onDeny={() => void fetch(`/api/tasks/${snapshot.id}/approvals/${snapshot.approval!.id}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'denied' })
    }).then(refreshSnapshot)}
  />
)}
```

`ApprovalPanel` design: full-width amber card, shows action in plain English, two prominent buttons (Approve / Deny), expiry countdown, wallet URL as a link.

---

## Test Plan

1. Create a task: "Write a Python hello world to hello.py" → files tab shows `hello.py` → click → see content
2. Send a follow-up while Claude is running → queued draft banner appears → auto-sends when Claude finishes
3. Click "Edit" on a prior user message → edit text → new forked conversation opens
4. Trigger `waiting_for_user_input` → "Writing…" header is gone → input request banner shows → answer it → Claude continues
5. Long response (ask for a 500-word essay) → no per-token jank → smooth streaming
6. `npm run check` → green
