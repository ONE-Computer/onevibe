# Phase 3 — Runtime Routing Layer

> **Goal**: The UI surfaces harness selection as a first-class, informed choice. The right harness is suggested for each task mode. Users understand what each runtime can and cannot do. Operators can configure defaults.
>
> **Exit criterion**: Open the provider picker, see capability badges per runtime, see "Recommended for this mode" suggestion, select a runtime, get a clear "what this runtime can do" summary. `npm run check` green.
>
> **Tasks**: P3-01 through P3-07 in `TODO.md`
> **Prerequisite**: Phase 2 complete (all adapters implement capability declaration).

---

## Why this phase exists

With two adapters (Claude SDK + ONEComputer) the current flat dropdown is fine. With four or more (Claude SDK, Codex, AgentCore, e2b, remote), the flat dropdown becomes a liability: users don't know which to pick, pick wrong, and get degraded results for their use case.

The routing layer makes the choice **informed** — not magic, not hidden, not locked in.

**Key rule**: The routing layer is advisory, not mandatory. Users can always override. We suggest; we do not force.

---

## P3-01: `RuntimeRegistry`

**File**: `server/runtime-registry.ts` (new)

The registry is the single place that knows which adapters are configured, healthy, and what they can do.

```ts
export type RegisteredRuntime = {
  id: Task['provider']
  label: string
  detail: string
  boundary: string // e.g. "Anthropic cloud", "OpenAI cloud", "AWS ap-southeast-2", "Local process"
  available: boolean
  capabilities: RuntimeCapability[]
  configuredAt: string // ISO timestamp of last successful health check
  healthStatus: 'ok' | 'degraded' | 'offline' | 'unconfigured'
  healthDetail?: string // e.g. "OPENAI_API_KEY missing" or "Last request: 200ms"
  requiredEnvVars: string[] // for the setup UI
}

export class RuntimeRegistry {
  private runtimes: Map<string, RegisteredRuntime> = new Map()

  register(runtime: RegisteredRuntime) {
    this.runtimes.set(runtime.id, runtime)
  }

  getAll(): RegisteredRuntime[] {
    return [...this.runtimes.values()]
  }

  getAvailable(): RegisteredRuntime[] {
    return this.getAll().filter(r => r.available)
  }

  suggest(mode: TaskMode): RegisteredRuntime[] {
    // Returns available runtimes ranked by suitability for this mode
    return this.getAvailable()
      .map(r => ({ runtime: r, score: scoreForMode(r, mode) }))
      .sort((a, b) => b.score - a.score)
      .map(({ runtime }) => runtime)
  }

  async healthCheck(id: string): Promise<void> {
    // Ping the runtime; update healthStatus
  }
}
```

**Mode → capability scoring** (`scoreForMode`):

| Mode | Required capabilities | Preferred capabilities | Score boost |
|---|---|---|---|
| `chat` | `streaming` | — | base |
| `general` | `streaming`, `tool_use` | `file_system` | +2 for `file_system` |
| `app` | `streaming`, `tool_use`, `file_system` | `sandboxed`, `preview_url` | +3 for `sandboxed`, +2 for `preview_url` |
| `website` | `streaming`, `tool_use`, `file_system` | `sandboxed`, `preview_url` | +3 for `sandboxed`, +2 for `preview_url` |
| `research` | `streaming`, `tool_use` | — | +1 for Claude SDK (research quality) |
| `data` | `streaming`, `tool_use`, `file_system` | `sandboxed` | +2 for `sandboxed` |
| `design` | `streaming`, `tool_use` | `file_system` | base |
| `slides` | `streaming`, `tool_use`, `file_system` | — | base |
| `document` | `streaming` | — | base |
| `game` | `streaming`, `tool_use`, `file_system` | `sandboxed`, `preview_url` | +3 for both |

Runtimes missing a **required** capability for the mode are scored -100 (filtered out, shown as "not supported for this mode").

---

## P3-02: Runtime routing suggestions in UI

**File**: `src/components/PromptComposer.tsx`

When the user selects a `TaskMode`, the provider picker updates:
1. First provider in the list = `registry.suggest(mode)[0]` = "Recommended"
2. Providers missing required capabilities for the mode are shown at the bottom with a "Not supported for [mode] mode" label, not hidden
3. A small badge below the mode selector: "Suggested: Claude SDK · sandboxed ✓ · preview ✓"

```tsx
const suggestedProviders = useMemo(
  () => runtime?.providers
    ? suggestForMode(runtime.providers, mode)
    : [],
  [runtime, mode]
)

// In provider picker dropdown:
{suggestedProviders.map((provider, i) => (
  <button key={provider.id} role="menuitem" ...>
    {i === 0 && <span className="recommended-badge">Recommended</span>}
    <span className="runtime-dot" ... />
    <strong>{provider.label}</strong>
    <div className="capability-badges">
      {provider.capabilities.map(cap => (
        <span key={cap} className={`cap-badge ${cap}`}>{capabilityLabel(cap)}</span>
      ))}
    </div>
    <small>{provider.boundary} · {provider.detail}</small>
  </button>
))}
```

**Capability labels**:
```ts
const capabilityLabel = (cap: RuntimeCapability) => ({
  streaming: 'Live',
  tool_use: 'Tools',
  file_system: 'Files',
  sandboxed: 'Sandboxed',
  preview_url: 'Preview',
  computer_use: 'Computer',
  fork: 'Fork',
})[cap]
```

---

## P3-03: Overhaul provider picker UI

The current picker is a flat list with a dot and a label. Replace it with a rich panel.

**Design**:
```
┌─────────────────────────────────────────────────────────┐
│ Choose runtime                              [×]          │
├─────────────────────────────────────────────────────────┤
│ ● Claude Agent SDK          [Recommended for App mode]  │
│   Anthropic cloud           Live · Tools · Files · Sand │
│                             Preview                     │
├─────────────────────────────────────────────────────────┤
│ ● OpenAI Codex                                          │
│   OpenAI cloud              Live · Tools · Files · Sand │
├─────────────────────────────────────────────────────────┤
│ ● AWS AgentCore                                         │
│   AWS ap-southeast-2        Live · Tools · Sand         │
├─────────────────────────────────────────────────────────┤
│ ○ ONEComputer sandbox        [Not configured]           │
│   Set ONECOMPUTER_API_URL to enable                     │
├─────────────────────────────────────────────────────────┤
│ ─ Simulation                 Not supported for App mode │
│   No model calls                                        │
└─────────────────────────────────────────────────────────┘
```

Key rules:
- Available runtimes are sorted by `suggest(mode)` score
- Unconfigured runtimes show their missing env var
- Incompatible runtimes (missing required capability for mode) are shown at bottom, greyed, with explanation — not hidden
- Clicking an incompatible runtime shows a tooltip: "Codex does not support computer use. Switch to ONEComputer or Claude SDK for this mode."

---

## P3-04: Runtime health dashboard

**Location**: Settings → Runtimes

```
Runtimes

Claude Agent SDK          ● Online    Last: 120ms    [Test]
  LiteLLM relay · server-controlled routing ✓

OpenAI Codex              ● Online    Last: 95ms     [Test]
  OpenAI cloud · OPENAI_API_KEY ✓

AWS AgentCore             ○ Offline   Timeout        [Test]
  AWS ap-southeast-2 · AWS credentials ✓ · Runtime ARN ✓
  Error: Connection timed out — check VPC/network settings

ONEComputer sandbox       ○ Not configured            [Configure]
  Requires: ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN

e2b cloud sandbox         ○ Not configured            [Configure]
  Requires: E2B_API_KEY
```

**Backend endpoint**: `POST /api/runtime/test/:provider` — runs a minimal health probe on the specified adapter and returns `{ status, latencyMs, error? }`.

---

## P3-05: Runtime fallback chain

When an adapter returns an error mid-task (network timeout, rate limit, quota exceeded), surface a non-blocking prompt:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ Claude SDK returned rate limit error                  │
│                                                          │
│ Switch to OpenAI Codex and retry?   [Switch] [Dismiss]  │
└─────────────────────────────────────────────────────────┘
```

This is a **user choice**, not an automatic fallback. Never transparently substitute one harness for another without user consent. The user chose Claude for a reason.

**Implementation**: In `server/index.ts`, catch adapter errors and emit a `runtime_error` event with `payload.code` and `payload.suggestion` (the next-best provider from the registry). The UI listens for this event and surfaces the prompt.

---

## P3-06: `ONEVIBE_DEFAULT_PROVIDER` env var

Operators deploying ONEVibe for a team can set a default:
```
ONEVIBE_DEFAULT_PROVIDER=codex
```

This overrides the auto-selection logic for all new tasks on that deployment. Individual users can still override per task. Useful for: "this is our Codex-powered workspace" or "all tasks must run on AgentCore for compliance".

---

## P3-07: Runtime-neutral event schema

**File**: `server/types.ts`

Audit every field in `RuntimeEvent`. Any field that is only meaningful for one provider must be moved into `payload` (the freeform dict):

```ts
// WRONG — Claude-specific field in canonical schema:
export type RuntimeEvent = {
  // ...
  claudeInputTokens?: number  // ← must not be here
}

// CORRECT — harness-specific data in payload:
export type RuntimeEvent = {
  // ...
  payload: Record<string, unknown>
  // Claude SDK puts: { input_tokens, output_tokens, stop_reason }
  // Codex puts: { finish_reason, usage }
  // AgentCore puts: { invocation_id, trace_id }
  // UI never reads these directly — only the evidence pane shows raw payload
}
```

Also audit `Task['provider']` type — it is currently `'demo' | 'claude_sdk' | 'onecomputer' | 'remote'`. Widen to `string` or add the new providers. The adapter registry (P3-01) is the source of truth for valid provider IDs, not a TypeScript union.

---

## Test plan

1. Switch `TaskMode` to `'app'` → provider picker reorders with Claude SDK or Codex first
2. Provider with `computer_use` only available for `TaskMode === 'general'` — others show it greyed
3. Set `ONEVIBE_DEFAULT_PROVIDER=codex` → new tasks default to Codex
4. Kill Claude SDK (unset API key) → runtime dashboard shows it offline → provider picker shows unconfigured label → other runtimes still available
5. AgentCore times out mid-task → "Switch to Codex and retry?" prompt appears → accept → task resumes on Codex
6. Add a new adapter (mock) with a single new capability → capability badge appears in picker without any UI code changes
7. `npm run check` → green
