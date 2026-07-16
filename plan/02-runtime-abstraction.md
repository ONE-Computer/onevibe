# Phase 2 — Harden the Runtime Abstraction

> **Goal**: `RuntimeAdapter` is airtight. Adding a new harness is one new file. No harness concepts bleed into the UI or data model. Codex and AgentCore ship as real, selectable providers.
>
> **Exit criterion**: User selects "Codex" in the provider picker, sends a message, gets a real Codex response. User selects "AgentCore", gets a real Bedrock response. Switching providers mid-session shows a clear capability diff. `npm run check` green.
>
> **Tasks**: P2-01 through P2-10 in `TODO.md`
> **Prerequisite**: Phase 1 complete.

---

## The core principle

The harness is a pluggable detail. ONEVibe must never:
- Branch on `provider === 'claude_sdk'` in UI components
- Expose Claude-specific tool names, token types, or API shapes to the conversation pane
- Require UI changes when adding a new adapter

If any of those are true today, they are bugs to fix in P2-01.

---

## P2-01: Audit and harden `RuntimeAdapter`

**File**: `server/runtime-adapter.ts`

Read the current interface. The canonical contract must be:

```ts
export interface RuntimeAdapter {
  // Metadata — declared once, static per adapter class
  readonly providerId: Task['provider']
  readonly capabilities: RuntimeCapability[]

  // Lifecycle
  initialize(task: Task, workingDir: string, mcpConfigs: McpConfig[]): Promise<void>
  run(
    prompt: string,
    context: RunContext,
    signal: AbortSignal
  ): AsyncIterable<RuntimeEvent>
  cancel(): Promise<void>
  destroy(): Promise<void>

  // File system (optional — only if 'file_system' in capabilities)
  getFiles?(): Promise<WorkspaceFile[]>
  getFile?(path: string): Promise<{ content: string; contentHash: string }>
  writeFile?(path: string, content: string, expectedHash?: string): Promise<{ contentHash: string }>

  // Sandbox preview (optional — only if 'preview_url' in capabilities)
  getPreviewUrl?(): Promise<string | null>
}

export type RuntimeCapability =
  | 'streaming'          // streams token deltas in real time
  | 'tool_use'           // agent can call tools / MCP servers
  | 'file_system'        // produces real files in a working directory
  | 'sandboxed'          // execution is isolated from the host process
  | 'preview_url'        // can serve a live HTTP preview of generated content
  | 'computer_use'       // can control a desktop/browser
  | 'fork'               // supports conversation branching

export type McpConfig = {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
}
```

**Audit checklist** — for each existing adapter:
1. Does it implement all required methods?
2. Does it leak provider-specific types into `RunContext` or `RuntimeEvent`?
3. Does `server/types.ts` contain any fields that are only meaningful for one provider?
4. Are there any `if (provider === 'claude_sdk')` branches in `server/index.ts`? Move them inside the adapter.

**Key rule**: `server/index.ts` must not know which adapter is running. It calls `adapter.run()` and receives `RuntimeEvent[]`. Nothing else.

---

## P2-02: Codex Adapter

**File**: `server/codex-runner.ts` (new)

**Context**: ONEVibe exposes a Codex-compatible coding harness through LiteLLM's OpenAI-compatible streaming endpoint. It is a code-focused alternative to the Claude SDK for document, website, app, and data work, while keeping model routing under the same server-controlled data-sovereignty boundary.

**Required env vars**:
```
ONEVIBE_LITELLM_URL=http://127.0.0.1:4100
ONEVIBE_LITELLM_API_KEY=
ONEVIBE_CODEX_MODEL=
```

**Capability declaration**:
```ts
readonly capabilities: RuntimeCapability[] = ['streaming', 'tool_use', 'file_system']
```

ONEVibe routes this adapter through the protected LiteLLM OpenAI-compatible
endpoint rather than a direct `OPENAI_API_KEY` or first-party provider
endpoint. The current implementation provides bounded workspace read/write
tools and does not claim `sandboxed` until a real isolated Codex execution
boundary is proven.

**Implemented structure**:
```ts
export class CodexRuntimeAdapter extends RuntimeAdapterBase {
  readonly providerId = 'codex' as const
  readonly capabilities = ['streaming', 'tool_use', 'file_system'] as const
}
```

The current implementation uses `fetch` against `/v1/chat/completions`,
normalizes streamed deltas, and exposes only `workspace_read` and
`workspace_write` tools. These tools are path-confined and bounded. It does
not expose a shell, direct OpenAI credential, or sandbox capability.

**Normalization**: The critical work is `normalizeCodexEvent` — map Codex's event shapes to ONEVibe's canonical `RuntimeEvent` schema. Never let Codex-specific fields appear outside this file.

**Registration** is through `RuntimeRegistry`. The provider is available only
when the protected LiteLLM relay is configured; an explicit Codex-compatible
model alias is recorded in runtime evidence. Live provider acceptance remains
pending a configured relay alias and E2E run.

---

## P2-03: AgentCore Adapter

**File**: `server/agentcore-runner.ts` (new, or promote from `server/onecomputer-agent-sdk-worker.ts`)

**Context**: AWS Bedrock AgentCore is a managed agent runtime. It already has a partial implementation in `AGENTCORE-AWS-RUNTIME.md` and `server/onecomputer-agent-sdk-worker.ts`. Formalise it as a full `RuntimeAdapter`.

**Required env vars**:
```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-2
AGENTCORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:...
```

**Capability declaration**:
```ts
readonly capabilities: RuntimeCapability[] = ['streaming', 'tool_use', 'sandboxed']
```

**Key detail**: AgentCore SSE parsing already exists in `agentcore_client.py` (in the Streamlit POC). Port that parsing logic to TypeScript in this adapter's `normalizeAgentCoreEvent()`.

**Registration**: expose when all three AWS env vars are set.

---

## P2-04: Runtime capability declaration

**What this enables**: The UI must never branch on `provider === 'claude_sdk'`. Instead:

```tsx
// WRONG — leaks provider identity into UI:
{snapshot.provider === 'claude_sdk' && <FilesTab />}

// CORRECT — driven by capability:
{selectedProvider.capabilities.includes('file_system') && <FilesTab />}
{selectedProvider.capabilities.includes('preview_url') && <PreviewTab />}
{selectedProvider.capabilities.includes('computer_use') && <ComputerTab />}
```

**Changes needed**:
1. Add `capabilities: RuntimeCapability[]` to `RuntimeProviderState` in `src/types.ts`
2. `/api/runtime` response includes `capabilities` per provider
3. `src/components/Workspace.tsx` — replace all `provider === 'xxx'` branches with capability checks
4. `src/App.tsx` — same
5. Mode routing in `PromptComposer` — when user picks `'app'` mode, suggest providers with `'file_system'` + `'sandboxed'`

---

## P2-05: Per-task working directory

**File**: `server/index.ts`, each adapter

Every task gets `{DATA_DIR}/tasks/{taskId}/workspace/` created before the adapter runs. The adapter receives this path via `initialize(task, workingDir, mcpConfigs)`.

After each agent turn, `server/index.ts` calls `adapter.getFiles?.()` and stores the result in the task snapshot as `task.files`. The workspace panel's Files tab reads this — no more "Building workspace" spinner for completed tasks.

```ts
// server/index.ts, in task creation:
const workingDir = path.join(DATA_DIR, 'tasks', task.id, 'workspace')
await mkdir(workingDir, { recursive: true })

const adapter = createAdapter(provider)
await adapter.initialize(task, workingDir, enabledMcpConfigs)
```

---

## P2-06–P2-10: Agent UX improvements

These are harness-agnostic UX improvements that apply regardless of which adapter is running.

### P2-06: Delta coalescing
Buffer SSE token deltas per animation frame in `useTask.ts`. Pattern from OpenWork `session-sync.ts`. Prevents per-token React re-renders during long Claude or Codex responses.

```ts
const deltaBuffer = useRef<Map<string, string>>(new Map())
const frameScheduled = useRef(false)

const flushDeltas = useCallback(() => {
  frameScheduled.current = false
  if (!deltaBuffer.current.size) return
  const deltas = new Map(deltaBuffer.current)
  deltaBuffer.current.clear()
  setSnapshot(current => current ? applyDeltas(current, deltas) : current)
}, [])

// For delta events: buffer instead of calling setSnapshot
deltaBuffer.current.set(event.messageId, (deltaBuffer.current.get(event.messageId) ?? '') + event.delta)
if (!frameScheduled.current) {
  frameScheduled.current = true
  requestAnimationFrame(flushDeltas)
}
```

### P2-07: Draft queuing
When `task.status === 'running'`, store draft locally. Show "Will send when ready." Auto-drain when status transitions to `completed` or `waiting_for_user_input`.

### P2-08: Fork/edit-message
New endpoint `POST /api/tasks/:id/fork` → body: `{ fromMessageId, newPrompt }` → creates a new task with truncated history and new prompt → navigates to it. UI: hover any user message → "Edit" button inline.

### P2-09: `waiting_for_user_input` UX
Remove from `isRunning`. Show `UserInputCard` prominently above composer with the agent's question and option buttons. Composer placeholder: "Type your answer…"

### P2-10: Permission approval panel
Render `task.approval` as a full-width amber card **above the composer** — not buried in the workspace sidebar. Two large buttons: Approve / Deny. Expiry countdown. This is how OpenWork's `PermissionApprovalPanel` works and it is correct.

---

## Test plan

1. Select "Codex" in provider picker → send "Write hello.py" → file appears in Files tab
2. Select "AgentCore" → send a message → streaming response appears
3. Select a provider without `'file_system'` capability → Files tab is hidden
4. Select a provider with `'computer_use'` capability → Computer tab appears
5. Long response (500+ tokens, any provider) → no per-token jank, smooth streaming
6. Send follow-up while agent running → queued banner → auto-sends on idle
7. `npm run check` → green
