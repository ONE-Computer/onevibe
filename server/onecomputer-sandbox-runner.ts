import { createHash } from 'node:crypto'
import path from 'node:path'
import type { OneComputerClient } from './onecomputer-client.js'
import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import type { RuntimeHealth } from './types.js'
import type { EventInput } from './types.js'
import { sanitizeNativePayload } from './native-events.js'
import { validateModeArtifacts } from './artifact-validation.js'
import { skillPacksFor } from './skill-packs.js'
import { RuntimeLeaseService } from './runtime-lease-service.js'
import { claudeProviderConfig } from './claude-provider-config.js'
import { SANDBOX_SLIDE_RENDERER, sandboxSlideSeed } from './sandbox-slide-renderer.js'
import { portableArtifactKind as portableArtifactPathKind } from './artifact-path.js'
import { ONEVIBE_SANDBOX_AGENT_SDK_WORKER } from './onecomputer-agent-sdk-worker.js'
import { writeArtifactManifest } from './mode-artifacts.js'

export const portableArtifactKind = (artifactPath: string) => {
  const normalized = path.posix.normalize(artifactPath)
  if (normalized === 'index.html' || normalized === 'validation-report.json') return undefined
  return portableArtifactPathKind(normalized)
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const isPng = (bytes: Buffer) => bytes.byteLength >= PNG_SIGNATURE.byteLength && bytes.subarray(0, PNG_SIGNATURE.byteLength).equals(PNG_SIGNATURE)
const DEFAULT_AGENT_QUIESCENCE_TIMEOUT_MS = 5_000
const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`

type AgentQuiescence = {
  verified: boolean
  evidence: 'exitcode' | 'process_absent' | 'unverified'
  pid?: number
  exitCode?: string
  limitation?: string
}

const parseAgentPid = (output: string) => {
  const match = output.match(/(?:^|\n)pid:(\d+)(?:\n|$)/)
  if (!match) return undefined
  const pid = Number(match[1])
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

const sandboxAgentCancellationCommand = (workspace: string, retainedPid?: number) => [
  'set +e',
  `cd ${shellQuote(workspace)}`,
  `agent_pid=${retainedPid ? shellQuote(String(retainedPid)) : "''"}`,
  'if test -z "$agent_pid" && test -s .onevibe-pid; then candidate_pid=$(cat .onevibe-pid); case "$candidate_pid" in ""|0|*[!0-9]*) ;; *) agent_pid="$candidate_pid" ;; esac; fi',
  'if test -n "$agent_pid" && kill -0 "$agent_pid" 2>/dev/null; then',
  '  kill -TERM "$agent_pid" 2>/dev/null || true',
  'fi',
  'for attempt in $(seq 1 50); do',
  '  if test -s .onevibe-exitcode; then printf "exitcode:"; cat .onevibe-exitcode; printf "\\n"; exit 0; fi',
  '  if test -n "$agent_pid" && ! kill -0 "$agent_pid" 2>/dev/null; then printf "absent:%s\\n" "$agent_pid"; exit 0; fi',
  '  if test "$attempt" -eq 10 && test -n "$agent_pid"; then kill -KILL "$agent_pid" 2>/dev/null || true; fi',
  '  sleep 0.1',
  'done',
  'if test -s .onevibe-exitcode; then printf "exitcode:"; cat .onevibe-exitcode; printf "\\n"; elif test -n "$agent_pid" && ! kill -0 "$agent_pid" 2>/dev/null; then printf "absent:%s\\n" "$agent_pid"; else printf "unverified:no_exitcode_or_process_absence\\n"; fi',
].join('\n')

const parseAgentQuiescence = (output: string, pid?: number): AgentQuiescence => {
  const status = output.trim().split('\n')[0] ?? ''
  if (status.startsWith('exitcode:')) return { verified: true, evidence: 'exitcode', pid, exitCode: status.slice('exitcode:'.length) }
  if (status.startsWith('absent:')) return { verified: true, evidence: 'process_absent', pid: Number(status.slice('absent:'.length)) || pid }
  return {
    verified: false, evidence: 'unverified', pid,
    limitation: 'The ONEComputer exec provider did not establish a durable .onevibe-exitcode or process-absence observation within the bounded cancellation window.',
  }
}

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new DOMException('Task cancelled', 'AbortError'))
  const abort = () => { clearTimeout(timer); reject(new DOMException('Task cancelled', 'AbortError')) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
  signal.addEventListener('abort', abort, { once: true })
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const redactUrl = (value: string) => {
  try {
    const url = new URL(value)
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return value
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

export const browserEvidenceFor = (tool: string, input: unknown) => {
  const rawUrl = isRecord(input) && typeof input.url === 'string' ? input.url : undefined
  if (!rawUrl) return { tool: tool.replace('mcp__playwright__', '') }
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'file:') return { tool: tool.replace('mcp__playwright__', ''), url: `file://sandbox-local/${path.posix.basename(url.pathname) || 'document'}` }
    if (!['http:', 'https:'].includes(url.protocol)) return { tool: tool.replace('mcp__playwright__', '') }
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return { tool: tool.replace('mcp__playwright__', ''), url: url.toString() }
  } catch {
    return { tool: tool.replace('mcp__playwright__', '') }
  }
}

const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return '[Max depth]'
  if (typeof value === 'string') {
    const bounded = value.length > 8_000 ? `${value.slice(0, 8_000)}…[truncated]` : value
    return redactUrl(bounded)
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1))
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /authorization|cookie|token|secret|api[_-]?key|password/i.test(key) ? '[REDACTED]' : sanitize(item, depth + 1)]))
}

type ClaudeJournalEntry =
  | { kind: 'tool_started'; toolUseId?: string; name: string; input?: unknown }
  | { kind: 'tool_completed'; toolUseId?: string; content?: string; isError?: boolean }
  | { kind: 'text'; content: string }

/** Browser control stays inside the sandbox through the preconfigured MCP. */
export const GOVERNED_BROWSER_TOOLS = [
  'mcp__playwright__browser_navigate',
  'mcp__playwright__browser_navigate_back',
  'mcp__playwright__browser_navigate_forward',
  'mcp__playwright__browser_reload',
  'mcp__playwright__browser_snapshot',
  'mcp__playwright__browser_click',
  'mcp__playwright__browser_hover',
  'mcp__playwright__browser_type',
  'mcp__playwright__browser_select_option',
  'mcp__playwright__browser_check',
  'mcp__playwright__browser_uncheck',
  'mcp__playwright__browser_wait_for',
  'mcp__playwright__browser_take_screenshot',
] as const

export const governedClaudeTools = (browserAutomation: boolean, shell = false) => [
  'Read', 'Write', 'Edit', 'Glob', 'Grep',
  ...(shell ? ['Bash'] : []),
  ...(browserAutomation ? GOVERNED_BROWSER_TOOLS : []),
]

export const isGovernedBrowserTool = (name: string) => (GOVERNED_BROWSER_TOOLS as readonly string[]).includes(name)
export const isSandboxRuntimeReady = (sandbox: { state?: string; bootstrapped?: boolean }) => sandbox.state === 'started' && sandbox.bootstrapped !== false

export const sandboxBuildValidationCommand = (workspace: string) => [
  'set +e',
  `cd ${shellQuote(`${workspace}/app`)}`,
  'if test -f package-lock.json; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi',
  'install_code=$?',
  'if test "$install_code" -eq 0; then npm run build; build_code=$?; else build_code=125; fi',
  'printf "install:%s build:%s\\n" "$install_code" "$build_code"',
  'exit "$build_code"',
].join('\n')

export const sandboxPackageLockExtractionCommand = (workspace: string) => `cd ${shellQuote(`${workspace}/app`)} && if test -f package-lock.json; then bytes=$(wc -c < package-lock.json); if test "$bytes" -le 1048576; then base64 -w0 package-lock.json; else printf 'oversize:%s' "$bytes"; fi; fi`

export const parseClaudeStreamJournal = (raw: string) => {
  const entries: ClaudeJournalEntry[] = []
  let result: string | undefined
  let sessionId: string | undefined
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try { parsed = JSON.parse(line) } catch { continue }
    if (!isRecord(parsed)) continue
    if (typeof parsed.session_id === 'string') sessionId = parsed.session_id
    if (parsed.type === 'result' && typeof parsed.result === 'string') result = parsed.result.slice(0, 64_000)
    const message = isRecord(parsed.message) ? parsed.message : undefined
    const blocks = Array.isArray(message?.content) ? message.content.filter(isRecord) : []
    for (const block of blocks) {
      if (block.type === 'tool_use' && typeof block.name === 'string') entries.push({ kind: 'tool_started', toolUseId: typeof block.id === 'string' ? block.id : undefined, name: block.name, input: sanitize(block.input) })
      if (block.type === 'tool_result') entries.push({ kind: 'tool_completed', toolUseId: typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined, content: typeof block.content === 'string' ? block.content.slice(0, 8_000) : undefined, isError: block.is_error === true })
      if (block.type === 'text' && typeof block.text === 'string') entries.push({ kind: 'text', content: block.text.slice(0, 16_000) })
    }
  }
  return { entries, result, sessionId }
}

export class OneComputerSandboxRuntimeAdapter extends RuntimeAdapterBase {
  readonly name = 'onecomputer'
  readonly providerId = 'onecomputer' as const
  readonly capabilities = ['streaming', 'tool_use', 'file_system', 'sandboxed', 'preview_url', 'computer_use'] as const

  async health(): Promise<RuntimeHealth> {
    const started = Date.now()
    try {
      await this.client.health()
      return { status: 'online', latencyMs: Date.now() - started, detail: 'ONEComputer authenticated health probe succeeded.' }
    } catch {
      return { status: 'offline', latencyMs: Date.now() - started, detail: 'ONEComputer authenticated health probe failed.' }
    }
  }

  constructor(
    private readonly client: OneComputerClient,
    private readonly options: { gatewayEnforced: boolean; retainSandbox: boolean; visualRuntime?: boolean; browserAutomation?: boolean; pollMilliseconds?: number; visualCheckpointMilliseconds?: number; agentQuiescenceTimeoutMilliseconds?: number } = { gatewayEnforced: false, retainSandbox: false },
  ) {
    super()
  }

  private async quiesceAgentAfterCancellation(taskId: string, sandboxId: string, workspace: string, retainedPid: number | undefined, store: LegacyRuntimeContext['store']) {
    const timeoutMilliseconds = Math.max(this.options.agentQuiescenceTimeoutMilliseconds ?? DEFAULT_AGENT_QUIESCENCE_TIMEOUT_MS, 1)
    const cancellationEvidence = {
      sandboxId, agentPid: retainedPid, workspace,
      journalPath: `${workspace}/.onevibe-events.jsonl`, exitPath: `${workspace}/.onevibe-exitcode`,
      boundedTimeoutMilliseconds: timeoutMilliseconds,
    }
    try {
      await store.appendEvent(taskId, {
        type: 'activity_delta', lane: 'control', label: 'ONEComputer agent cancellation requested',
        content: 'The sandbox agent received a best-effort termination request; its journal and exit marker remain retained for cancellation evidence.',
        payload: { ...cancellationEvidence, cancellation: 'requested', journalRetained: true },
      })
    } catch {
      // Cancellation cleanup must still be attempted if evidence persistence is unavailable.
    }

    const cleanupController = new AbortController()
    const cleanupRequest = this.client.exec(sandboxId, sandboxAgentCancellationCommand(workspace, retainedPid), cleanupController.signal)
    cleanupRequest.catch(() => undefined)
    let response: Awaited<ReturnType<OneComputerClient['exec']>> | undefined
    let timedOut = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      response = await Promise.race([
        cleanupRequest,
        new Promise<undefined>((resolve) => { timeout = setTimeout(() => { timedOut = true; cleanupController.abort(); resolve(undefined) }, timeoutMilliseconds) }),
      ])
    } catch {
      response = undefined
    } finally {
      if (timeout) clearTimeout(timeout)
    }

    const quiescence = response && response.exitCode === 0
      ? parseAgentQuiescence(response.output, retainedPid)
      : {
          verified: false,
          evidence: 'unverified' as const,
          pid: retainedPid,
          limitation: timedOut
            ? 'The ONEComputer exec provider did not return the bounded termination/verification command before its cancellation deadline; process quiescence is not proven.'
            : 'The ONEComputer exec provider could not complete the bounded termination/verification command; process quiescence is not proven.',
        }
    try {
      await store.appendEvent(taskId, {
        type: 'activity_delta', lane: 'control', label: quiescence.verified ? 'ONEComputer agent quiescence verified' : 'ONEComputer agent quiescence not verified',
        content: quiescence.verified
          ? 'The cancelled sandbox agent is quiescent; the retained exit marker or process-absence check is preserved as cancellation evidence.'
          : 'Cancellation stopped the ONEVibe turn without claiming sandbox process quiescence. Release or retry must treat the provider boundary as unverified until independently reconciled.',
        payload: {
          ...cancellationEvidence, ...quiescence,
          cancellation: 'fail_closed', journalRetained: true,
        },
      })
    } catch {
      // Preserve the original cancellation result even if the local evidence store is unavailable.
    }
  }

  protected async execute({ task, store, signal, prompt, continuation }: LegacyRuntimeContext) {
    signal.throwIfAborted()
    const configuredClaude = claudeProviderConfig()
    const sandboxBaseUrl = process.env.ONEVIBE_SANDBOX_LITELLM_URL?.trim().replace(/\/+$/, '')
      ?? configuredClaude.childEnv.ANTHROPIC_BASE_URL
    const sandboxNoProxyHost = sandboxBaseUrl ? new URL(sandboxBaseUrl).hostname : undefined
    const sandboxAuthToken = process.env.ONEVIBE_SANDBOX_LITELLM_AUTH_TOKEN?.trim()
    const sandboxApiKey = sandboxAuthToken ? 'placeholder' : configuredClaude.childEnv.ANTHROPIC_API_KEY
    const claudeTransport = sandboxBaseUrl ? 'litellm' : configuredClaude.configured ? configuredClaude.transport : 'sandbox_preconfigured'
    await store.updateTask(task.id, { status: 'running' })
    await store.appendEvent(task.id, {
      type: 'run_started', lane: 'control', status: 'running', label: 'ONEComputer sandbox execution started',
      content: 'The agent process will execute through the authenticated ONEComputer sandbox API, not on the ONEVibe host.',
      payload: { executionRoute: 'onecomputer_sandbox', agentRuntime: 'claude_agent_sdk', gatewayEnforced: this.options.gatewayEnforced, claudeTransport, model: configuredClaude.model },
    })
    await store.setPlanStep(task.id, 'scope', 'completed')
    await store.setPlanStep(task.id, 'workspace', 'running')

    let acquired: Awaited<ReturnType<RuntimeLeaseService['acquire']>>
    try {
      acquired = await new RuntimeLeaseService(store, this.client).acquire(task.id, signal)
    } catch (error) {
      // Surface the durable lease state when the provider response is
      // ambiguous. The browser must be able to explain that this turn is
      // recoverable, while the server still refuses any blind duplicate
      // allocation. Do not copy provider error bodies into the task record.
      const unknownLease = store.findActiveRuntimeLease(task.id)
      if (unknownLease?.status === 'unknown') {
        const current = store.getTask(task.id)
        await store.updateTask(task.id, {
          securityContext: {
            ...(current.securityContext ?? { mode: 'onecomputer', gatewayEnforced: this.options.gatewayEnforced }),
            mode: 'onecomputer', provider: 'onecomputer', gatewayEnforced: this.options.gatewayEnforced,
            executionBoundary: 'onecomputer_sandbox', sandboxState: 'unknown',
          },
        })
        await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: 'ONEComputer allocation outcome unknown',
          content: 'The provider response was ambiguous. ONEVibe fenced the lease and will only recover it using the immutable allocation identity; it will not create a duplicate sandbox.',
          payload: {
            leaseId: unknownLease.id, leaseGeneration: unknownLease.generation,
            allocationOperationId: unknownLease.allocationOperationId,
            recovery: 'immutable_allocation_identity_required', lifecycle: 'unknown',
            errorClass: error instanceof Error ? error.name : 'unknown_error',
          },
        })
      }
      throw error
    }
    const sandbox = acquired.sandbox
    let agentWorkspace: string | undefined
    let agentPid: number | undefined
    let agentLaunchAttempted = false
    const resumableSessionId = continuation
      && task.securityContext?.runtimeSessionId
      && task.securityContext.runtimeSessionLeaseId === acquired.lease.id
      && task.securityContext.runtimeSessionLeaseGeneration === acquired.lease.generation
      ? task.securityContext.runtimeSessionId
      : undefined
    let observedSandboxState: string | undefined
    const recordSandboxState = async (candidate: typeof sandbox) => {
      const state = candidate.state ?? 'provisioning'
      if (state === observedSandboxState) return
      observedSandboxState = state
      const current = store.getTask(task.id)
      await store.updateTask(task.id, {
        securityContext: {
          ...(current.securityContext ?? { mode: 'onecomputer', gatewayEnforced: this.options.gatewayEnforced }),
          mode: 'onecomputer', sandboxId: sandbox.id, provider: candidate.provider ?? sandbox.provider,
          gatewayEnforced: this.options.gatewayEnforced, executionBoundary: 'onecomputer_sandbox', sandboxState: state,
        },
      })
      await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: 'ONEComputer sandbox state observed',
        content: `Sandbox boundary is ${state}. The provider ID is now retained for polling and cleanup.`,
        payload: { sandboxId: sandbox.id, provider: candidate.provider ?? sandbox.provider, state, lifecycle: 'provider_observed' },
      })
    }
    await recordSandboxState(sandbox)
    let visualLoop: Promise<void> | undefined
    let stopVisualLoop: (() => void) | undefined
    let lastVisualFrame: { hash: string; path: string } | undefined
    let visualCaptureTail: Promise<void> = Promise.resolve()
    try {
      let visualRuntimeReady = false
      let browserAutomationEnabled = false
      const captureVisualFrame = (phase: string, causedByEventId?: string) => {
        if (!visualRuntimeReady) return
        const capture = visualCaptureTail.then(async () => {
          try {
            const frame = await this.client.getVisualScreenshot(sandbox.id, signal)
            const imageHash = createHash('sha256').update(frame.png).digest('hex')
            const deduplicated = lastVisualFrame?.hash === imageHash
            const framePath = deduplicated ? lastVisualFrame?.path ?? `evidence/visual/${Date.now()}-${phase.replace(/[^a-z0-9_-]/gi, '_')}.png` : `evidence/visual/${Date.now()}-${phase.replace(/[^a-z0-9_-]/gi, '_')}.png`
            if (!deduplicated) {
              await store.writeWorkspaceBytes(task.id, framePath, frame.png)
              lastVisualFrame = { hash: imageHash, path: framePath }
            }
            await store.appendEvent(task.id, {
              type: 'artifact_created', lane: 'artifact', label: `X11 frame · ${phase.replaceAll('_', ' ')}${deduplicated ? ' · unchanged' : ''}`, content: framePath,
              payload: {
                kind: 'visual_frame', sandboxId: sandbox.id, capturePhase: phase, causedByEventId, capturedAt: frame.capturedAt,
                imageHash, deduplicated: deduplicated || undefined, uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(framePath)}&raw=1`,
              },
            })
          } catch (error) {
            await store.appendEvent(task.id, {
              type: 'activity_delta', lane: 'activity', label: 'X11 evidence capture unavailable',
              content: error instanceof Error ? error.message.slice(0, 300) : 'Visual capture failed',
              payload: { sandboxId: sandbox.id, capturePhase: phase, causedByEventId, visualCapture: 'failed' },
            })
          }
        })
        visualCaptureTail = capture.catch(() => undefined)
        return capture
      }
      let live = sandbox
      const deadline = Date.now() + 4 * 60_000
      while (!isSandboxRuntimeReady(live)) {
        if (live.state === 'error' || Date.now() >= deadline) throw new Error(`ONEComputer sandbox failed to start (state=${live.state ?? 'unknown'})`)
        await wait(this.options.pollMilliseconds ?? 2_000, signal)
        try {
          live = await this.client.getSandbox(sandbox.id, signal)
        } catch (error) {
          if (signal.aborted) throw error
          await store.appendEvent(task.id, {
            type: 'activity_delta', lane: 'control', label: 'ONEComputer sandbox poll retry',
            content: 'The provider status poll did not complete; ONEVibe will retry within the bounded startup window.',
            payload: {
              sandboxId: sandbox.id, operation: 'get_sandbox', retry: true,
              errorClass: error instanceof Error ? error.name : 'unknown_error',
            },
          })
          continue
        }
        await recordSandboxState(live)
      }
      await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: 'ONEComputer agent runtime bootstrapped',
        content: 'The provider reported the retained sandbox ready for Claude execution.',
        payload: { sandboxId: sandbox.id, state: live.state, bootstrapped: live.bootstrapped ?? 'legacy_unspecified', desktopReady: live.desktopReady },
      })
      await store.updateTask(task.id, {
        securityContext: {
          mode: 'onecomputer', sandboxId: sandbox.id, provider: sandbox.provider,
          gatewayEnforced: this.options.gatewayEnforced, executionBoundary: 'onecomputer_sandbox', sandboxState: 'started',
        },
      })
      await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: acquired.reused ? 'ONEComputer retained sandbox resumed' : 'ONEComputer sandbox ready',
        content: acquired.reused ? `${sandbox.provider ?? 'configured'} retained the conversation boundary for this turn.` : `${sandbox.provider ?? 'configured'} provider started an isolated conversation boundary.`,
        payload: { sandboxId: sandbox.id, leaseId: acquired.lease.id, leaseGeneration: acquired.lease.generation, provider: sandbox.provider, state: live.state, gatewayEnforced: this.options.gatewayEnforced, continuation, reused: acquired.reused },
      })
      if (this.options.visualRuntime) {
        const visual = await this.client.startVisualRuntime(sandbox.id, signal)
        visualRuntimeReady = true
        const current = store.getTask(task.id)
        await store.updateTask(task.id, { securityContext: { ...current.securityContext!, visualRuntimeReady: true } })
        await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: 'Headless visual runtime ready',
          content: `X11 ${visual.display} · ${visual.width}×${visual.height} · screenshot stream available without VNC.`,
          payload: { sandboxId: sandbox.id, transport: 'authenticated_png', ...visual },
        })
        browserAutomationEnabled = this.options.browserAutomation === true && this.options.gatewayEnforced && visual.browserReady
        if (this.options.browserAutomation && !browserAutomationEnabled) await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: 'Governed browser automation withheld',
          content: !this.options.gatewayEnforced ? 'Browser automation requires an explicitly attested ONEComputer gateway.' : 'The visual runtime did not report a local browser ready for the task.',
          payload: { sandboxId: sandbox.id, requested: true, gatewayEnforced: this.options.gatewayEnforced, browserReady: visual.browserReady },
        })
        if (browserAutomationEnabled) await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: 'Governed browser automation ready',
          content: 'Playwright MCP actions run only inside the ONEComputer sandbox. The browser receives projected evidence, never CDP or browser credentials.',
          payload: { sandboxId: sandbox.id, transport: 'sandbox_playwright_mcp', gatewayEnforced: true, browserReady: true, tools: GOVERNED_BROWSER_TOOLS },
        })
        await captureVisualFrame('runtime_ready')
        const interval = Math.max(this.options.visualCheckpointMilliseconds ?? 5_000, 1_000)
        visualLoop = (async () => {
          try {
            while (!signal.aborted) {
              const stopped = await Promise.race([
                wait(interval, signal).then(() => false),
                new Promise<boolean>((resolve) => { stopVisualLoop = () => resolve(true) }),
              ])
              if (stopped || signal.aborted) return
              await captureVisualFrame('live')
            }
          } catch (error) {
            if (!signal.aborted) await store.appendEvent(task.id, {
              type: 'activity_delta', lane: 'activity', label: 'Live visual checkpoints stopped',
              content: error instanceof Error ? error.message.slice(0, 300) : 'Live visual checkpoint loop stopped unexpectedly.',
              payload: { sandboxId: sandbox.id, visualCapture: 'live_loop_failed' },
            })
          }
        })()
      }
      await store.setPlanStep(task.id, 'workspace', 'completed')
      await store.setPlanStep(task.id, 'build', 'running')

      const selectedSkills = skillPacksFor(task.skills)

      const agentPrompt = [
        'You are ONEVibe operating inside a disposable ONEComputer sandbox.',
        `Creation mode: ${task.mode}.`,
        'Work only in the current directory. Create portable source, README.md, and mode-appropriate artifacts.',
        'Before substantive workspace work, write .onevibe-plan.json containing {"steps":[{"id":"scope","title":"…"},{"id":"workspace","title":"…"},{"id":"build","title":"…"},{"id":"verify","title":"…"},{"id":"deliver","title":"…"}]}. Use concise task-specific titles, keep this control file free of secrets, and do not reorder or omit stages.',
        'For visual output create a self-contained index.html. Do not publish or expose credentials.',
        ...(selectedSkills.length ? [`Use only the selected versioned task skills materialized under .claude/skills: ${selectedSkills.map((skill) => skill.id).join(', ')}.`] : []),
        ...(browserAutomationEnabled ? ['A governed Playwright MCP browser is available inside the sandbox. For Website, App, or Game output, inspect the local or approved task-relevant page with browser_snapshot before delivery. Do not log in, save credentials, upload files, or perform external write actions.'] : []),
        prompt,
      ].join('\n\n')
      const encodedPrompt = Buffer.from(agentPrompt).toString('base64')
      const workspace = `/tmp/onevibe/${task.id}`
      agentWorkspace = workspace
      const allowedTools = governedClaudeTools(browserAutomationEnabled, task.mode === 'slides')
      const slideSeed = task.mode === 'slides' ? Buffer.from(`${JSON.stringify(sandboxSlideSeed(task.title, prompt), null, 2)}\n`).toString('base64') : undefined
      const slideRenderer = task.mode === 'slides' ? Buffer.from(SANDBOX_SLIDE_RENDERER).toString('base64') : undefined
      const sandboxAgentWorker = Buffer.from(ONEVIBE_SANDBOX_AGENT_SDK_WORKER).toString('base64')
      const command = [
        'set -eu',
        'export PATH=/opt/node22/bin:/home/kasm-user/.npm-global/bin:$PATH',
        'export NODE_PATH=/home/kasm-user/.npm-global/lib/node_modules',
        ...(sandboxBaseUrl ? [`export ANTHROPIC_BASE_URL=${shellQuote(sandboxBaseUrl)}`] : []),
        ...(!this.options.gatewayEnforced && sandboxNoProxyHost ? [
          `export NO_PROXY="\${NO_PROXY:+$NO_PROXY,}${sandboxNoProxyHost}"`,
          `export no_proxy="\${no_proxy:+$no_proxy,}${sandboxNoProxyHost}"`,
        ] : []),
        ...(sandboxApiKey ? [`export ANTHROPIC_API_KEY=${shellQuote(sandboxApiKey)}`] : []),
        ...(sandboxAuthToken ? [`export ANTHROPIC_AUTH_TOKEN=${shellQuote(sandboxAuthToken)}`] : []),
        'export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1',
        `mkdir -p ${shellQuote(workspace)}`,
        `cd ${shellQuote(workspace)}`,
        ...selectedSkills.flatMap((skill) => [
          `mkdir -p ${shellQuote(`.claude/skills/${skill.id}`)}`,
          `printf %s ${shellQuote(Buffer.from(skill.content).toString('base64'))} | base64 -d > ${shellQuote(`.claude/skills/${skill.id}/SKILL.md`)}`,
        ]),
        ...(slideSeed && slideRenderer ? [
          `printf %s ${shellQuote(slideSeed)} | base64 -d > outline.json`,
          `printf %s ${shellQuote(slideRenderer)} | base64 -d > .onevibe-render-deck.cjs`,
        ] : []),
        `printf %s ${shellQuote(sandboxAgentWorker)} | base64 -d > .onevibe-agent-sdk.mjs`,
        `printf %s ${shellQuote(encodedPrompt)} | base64 -d > .onevibe-prompt`,
        'rm -f .onevibe-events.jsonl .onevibe-exitcode .onevibe-pid',
        `export ONEVIBE_AGENT_WORKSPACE=${shellQuote(workspace)}`,
        `export ONEVIBE_AGENT_PROMPT_PATH=${shellQuote(`${workspace}/.onevibe-prompt`)}`,
        `export ONEVIBE_AGENT_JOURNAL_PATH=${shellQuote(`${workspace}/.onevibe-events.jsonl`)}`,
        `export ONEVIBE_AGENT_EXIT_PATH=${shellQuote(`${workspace}/.onevibe-exitcode`)}`,
        `export ONEVIBE_AGENT_STATE_PATH=${shellQuote(`${workspace}/.claude-state`)}`,
        `export ONEVIBE_AGENT_MODEL=${shellQuote(configuredClaude.model)}`,
        `export ONEVIBE_AGENT_TOOLS=${shellQuote(JSON.stringify(allowedTools))}`,
        ...(resumableSessionId ? [`export ONEVIBE_AGENT_RESUME=${shellQuote(resumableSessionId)}`] : ['unset ONEVIBE_AGENT_RESUME']),
        `/opt/node22/bin/node -e "const { createRequire } = require('node:module'); createRequire(process.cwd() + '/.onevibe-agent-sdk.mjs').resolve('@anthropic-ai/claude-agent-sdk')"`,
        '(',
        '  set +e',
        '  /opt/node22/bin/node .onevibe-agent-sdk.mjs < /dev/null > /dev/null 2>&1 &',
        '  onevibe_agent_pid="$!"',
        '  printf %s "$onevibe_agent_pid" > .onevibe-pid',
        '  wait "$onevibe_agent_pid"',
        '  onevibe_exit_code="$?"',
        '  rm -f .onevibe-prompt',
        '  printf %s "$onevibe_exit_code" > .onevibe-exitcode',
        ') &',
        'for onevibe_pid_wait in $(seq 1 100); do test -s .onevibe-pid && break; sleep 0.01; done',
        'if test -s .onevibe-pid; then printf "pid:"; cat .onevibe-pid; printf "\\n"; fi',
      ].join('\n')
      const agentExecution = await store.appendEvent(task.id, {
        type: 'tool_call_started', lane: 'activity', label: 'Execute Claude inside ONEComputer',
        content: task.mode === 'slides'
          ? 'Prompt is base64-transferred to avoid shell interpretation; the sandbox SDK receives the narrowly scoped slide-rendering shell capability.'
          : 'Prompt is base64-transferred to avoid shell interpretation and the sandbox SDK receives no Bash tool.',
        payload: { sandboxId: sandbox.id, leaseId: acquired.lease.id, leaseGeneration: acquired.lease.generation, toolName: 'onecomputer.sandbox.exec', agentRuntime: 'claude_agent_sdk', claudeTransport, model: configuredClaude.model, sessionContinuation: Boolean(resumableSessionId), allowedTools, browserAutomation: browserAutomationEnabled, skills: selectedSkills.map(({ id, version, title, sha256 }) => ({ id, version, title, sha256 })) },
      })
      await captureVisualFrame('before_agent', agentExecution.id)
      agentLaunchAttempted = true
      const spawned = await this.client.exec(sandbox.id, command, signal)
      if (spawned.exitCode !== 0) throw new Error(`Unable to start sandbox Claude process: ${spawned.output.slice(-2_000)}`)
      agentPid = parseAgentPid(spawned.output)
      if (selectedSkills.length) await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: 'ONEComputer skill packs materialized',
        content: `${selectedSkills.length} selected versioned skill pack${selectedSkills.length === 1 ? '' : 's'} materialized in the sandbox task workspace.`,
        payload: {
          executionRoute: 'onecomputer_sandbox', sandboxId: sandbox.id, path: '.claude/skills',
          skills: selectedSkills.map(({ id, version, title, sha256 }) => ({ id, version, title, sha256 })),
          permissionChange: false,
        },
      })
      let projectedEntries = 0
      let latestJournal = parseClaudeStreamJournal('')
      const browserReviewTools = new Set<string>()
      const browserToolUseIds = new Set<string>()
      const browserToolEvidence = new Map<string, ReturnType<typeof browserEvidenceFor>>()
      let planApplied = false
      let planExamined = false
      const projectSandboxPlan = async () => {
        if (planApplied || planExamined) return
        const candidate = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && if test -f .onevibe-plan.json; then plan_bytes=$(wc -c < .onevibe-plan.json); if test "$plan_bytes" -le 32768; then base64 -w0 .onevibe-plan.json; else printf 'oversize:%s' "$plan_bytes"; fi; fi`, signal)
        if (candidate.exitCode !== 0 || !candidate.output.trim()) return
        planExamined = true
        if (candidate.output.startsWith('oversize:')) {
          await store.appendEvent(task.id, { type: 'activity_delta', lane: 'control', label: 'Sandbox task plan rejected', content: 'The sandbox plan control file exceeded the 32 KiB bound.', payload: { sandboxId: sandbox.id, reason: 'oversize' } })
          return
        }
        try {
          const decoded = Buffer.from(candidate.output.trim(), 'base64').toString('utf8')
          const parsed = JSON.parse(decoded) as unknown
          await store.updateRuntimePlanTitles(task.id, isRecord(parsed) ? parsed.steps : parsed, 'onecomputer')
          planApplied = true
        } catch (error) {
          await store.appendEvent(task.id, {
            type: 'activity_delta', lane: 'control', label: 'Sandbox task plan rejected',
            content: error instanceof Error ? error.message.slice(0, 300) : 'The sandbox plan file was invalid.',
            payload: { sandboxId: sandbox.id, reason: 'invalid_plan' },
          })
        }
      }
      const projectJournal = async (raw: string) => {
        const parsedJournal = parseClaudeStreamJournal(raw)
        for (const [entryOffset, entry] of parsedJournal.entries.slice(projectedEntries).entries()) {
          let timelineEventId: string | undefined
          const isBrowserToolStart = entry.kind === 'tool_started' && isGovernedBrowserTool(entry.name)
          const isBrowserToolResult = entry.kind === 'tool_completed' && !!entry.toolUseId && browserToolUseIds.has(entry.toolUseId)
          const browserEvidence = isBrowserToolStart ? browserEvidenceFor(entry.name, entry.input) : isBrowserToolResult && entry.toolUseId ? browserToolEvidence.get(entry.toolUseId) : undefined
          const projections: EventInput[] = []
          if (entry.kind === 'tool_started') projections.push({
            type: 'tool_call_started', lane: 'activity', label: isBrowserToolStart ? `Browser · ${entry.name.replace('mcp__playwright__', '')}` : entry.name,
            content: 'Claude requested a governed workspace tool inside the ONEComputer sandbox.',
            payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, toolUseId: entry.toolUseId, input: entry.input, browserTool: isBrowserToolStart || undefined, browserEvidence },
          })
          if (isBrowserToolStart) {
            browserReviewTools.add(entry.name)
            if (entry.toolUseId) { browserToolUseIds.add(entry.toolUseId); browserToolEvidence.set(entry.toolUseId, browserEvidenceFor(entry.name, entry.input)) }
          }
          if (entry.kind === 'tool_completed') projections.push({
            type: 'tool_call_completed', lane: 'activity', label: isBrowserToolResult ? 'Browser result' : 'Tool result', content: entry.content,
            payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, toolUseId: entry.toolUseId, isError: entry.isError, browserTool: isBrowserToolResult || undefined, browserEvidence },
          })
          if (entry.kind === 'text') projections.push({
            type: 'assistant_text_delta', lane: 'transcript', content: entry.content,
            payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, source: 'claude_stream_json' },
          })
          const sourceSequence = projectedEntries + entryOffset
          const ingested = await store.ingestNativeEvent(task.id, {
            source: 'onecomputer_sandbox', sourceEventId: `${entry.kind}:${sourceSequence}`,
            sourceSequence, nativeType: entry.kind, payload: sanitizeNativePayload(entry), projections,
          })
          timelineEventId = ingested.events.find((event) => event.type === 'tool_call_started' || event.type === 'tool_call_completed')?.id
          if (timelineEventId) await captureVisualFrame(isBrowserToolStart ? 'browser_tool_started' : isBrowserToolResult ? 'browser_tool_completed' : entry.kind, timelineEventId)
        }
        projectedEntries = parsedJournal.entries.length
        latestJournal = parsedJournal
        if (projectedEntries > 0) await projectSandboxPlan()
      }
      const journalDeadline = Date.now() + 20 * 60_000
      let agentExitCode: number | undefined
      while (agentExitCode === undefined) {
        if (Date.now() >= journalDeadline) throw new Error('Sandbox Claude process exceeded the 20-minute task limit')
        await wait(this.options.pollMilliseconds ?? 1_000, signal)
        let snapshot: Awaited<ReturnType<OneComputerClient['exec']>>
        try {
          snapshot = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && journal_bytes=$(wc -c < .onevibe-events.jsonl 2>/dev/null || printf 0) && if test "$journal_bytes" -gt 4194304; then printf 'oversize:%s\n' "$journal_bytes"; elif test -f .onevibe-exitcode; then printf 'done:'; cat .onevibe-exitcode; printf '\n'; else printf 'running:\n'; fi; if test "$journal_bytes" -le 4194304; then base64 -w0 .onevibe-events.jsonl 2>/dev/null || true; fi`, signal)
        } catch (error) {
          if (signal.aborted) throw error
          await store.appendEvent(task.id, {
            type: 'activity_delta', lane: 'control', label: 'ONEComputer agent poll retry',
            content: 'The sandbox event-journal poll did not complete; ONEVibe will retry within the bounded task window.',
            payload: { sandboxId: sandbox.id, operation: 'exec_event_journal', retry: true, errorClass: error instanceof Error ? error.name : 'unknown_error' },
          })
          continue
        }
        if (snapshot.exitCode !== 0) throw new Error('Unable to poll sandbox Claude event journal')
        const [status, encodedJournal = ''] = snapshot.output.split('\n', 2)
        if (status?.startsWith('oversize:')) throw new Error(`Sandbox Claude event journal exceeded the 4 MiB limit (${status.slice('oversize:'.length)} bytes)`)
        await projectJournal(Buffer.from(encodedJournal.trim(), 'base64').toString('utf8'))
        if (status?.startsWith('done:')) agentExitCode = Number(status.slice('done:'.length))
      }
      stopVisualLoop?.()
      await visualLoop
      await visualCaptureTail
      await captureVisualFrame('after_agent', agentExecution.id)
      if (agentExitCode !== 0) throw new Error(`Sandbox Claude process exited ${agentExitCode}`)
      if (task.mode === 'slides') {
        const rendered = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && NODE_PATH=/home/kasm-user/.npm-global/lib/node_modules /opt/node22/bin/node .onevibe-render-deck.cjs`, signal)
        if (rendered.exitCode !== 0) throw new Error(`Sandbox slide renderer failed: ${rendered.output.slice(-1_000)}`)
        await store.appendEvent(task.id, {
          type: 'tool_call_completed', lane: 'activity', label: 'Sandbox deck rendered',
          content: 'The server-controlled renderer produced and signature-checked the PPTX/PDF inside the retained ONEComputer sandbox.',
          payload: { executionRoute: 'onecomputer_sandbox', sandboxId: sandbox.id, renderer: 'onevibe_managed_v1' },
        })
      }
      const parsedJournal = latestJournal
      if (parsedJournal.result && !parsedJournal.entries.some((entry) => entry.kind === 'text' && entry.content === parsedJournal.result)) await store.appendEvent(task.id, {
        type: 'assistant_text_delta', lane: 'transcript', content: parsedJournal.result,
        payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, source: 'claude_stream_json_result' },
      })
      if (parsedJournal.sessionId) {
        const current = store.getTask(task.id)
        await store.updateTask(task.id, { securityContext: {
          ...current.securityContext!, runtimeSessionId: parsedJournal.sessionId,
          runtimeSessionLeaseId: acquired.lease.id, runtimeSessionLeaseGeneration: acquired.lease.generation,
        } })
      }
      const listing = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && find . -type f ! -name '.onevibe-events.jsonl' ! -name '.onevibe-plan.json' ! -name '.onevibe-render-deck.cjs' -print0 | base64 -w0`, signal)
      if (listing.exitCode !== 0) throw new Error('Unable to enumerate sandbox artifacts')
      const paths = Buffer.from(listing.output.trim(), 'base64').toString('utf8').split('\0').filter(Boolean).map((item) => item.replace(/^\.\//, ''))
      if (paths.length > 100) throw new Error('Sandbox produced more than the 100-file extraction limit')
      // The worker and Claude SDK create ephemeral runtime state under
      // `.claude/`, `.claude-state/`, and `.onevibe-*`. Those files can be
      // created or removed while the sandbox is being enumerated, so do not
      // attempt to fetch them as user artifacts. This also keeps runtime
      // journals/backups out of the portable deliverable boundary.
      const extractablePaths = paths.filter((item) => {
        const normalized = path.posix.normalize(item)
        return normalized === 'index.html' || normalized === 'validation-report.json' || portableArtifactKind(normalized) !== undefined
      })
      let totalBytes = 0
      const portableArtifacts: Array<{ path: string; size: number; kind: string }> = []
      for (const relativePath of extractablePaths) {
        const normalized = path.posix.normalize(relativePath)
        if (normalized.startsWith('../') || path.posix.isAbsolute(normalized) || normalized === '..') throw new Error('Sandbox returned an unsafe artifact path')
        const file = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && base64 -w0 -- ${shellQuote(normalized)}`, signal)
        if (file.exitCode !== 0) throw new Error(`Unable to retrieve sandbox artifact ${normalized}`)
        const bytes = Buffer.from(file.output.trim(), 'base64')
        totalBytes += bytes.byteLength
        if (totalBytes > 10 * 1024 * 1024) throw new Error('Sandbox artifacts exceed the 10 MiB extraction limit')
        await store.writeWorkspaceBytes(task.id, normalized, bytes)
        const kind = portableArtifactKind(normalized)
        if (kind) portableArtifacts.push({ path: normalized, size: bytes.byteLength, kind })
      }
      await store.appendEvent(task.id, {
        type: 'tool_call_completed', lane: 'activity', label: 'Sandbox artifacts extracted',
        content: `${extractablePaths.length} portable files copied from the disposable boundary.`,
        payload: { sandboxId: sandbox.id, fileCount: extractablePaths.length, enumeratedFileCount: paths.length, totalBytes },
      })
      for (const artifact of portableArtifacts) await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: artifact.kind === 'slide_deck' ? 'Sandbox presentation export' : 'Sandbox deliverable', content: artifact.path,
        payload: {
          executionRoute: 'onecomputer_sandbox', sandboxId: sandbox.id, kind: artifact.kind, size: artifact.size,
          uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(artifact.path)}&download=1`, portable: true,
        },
      })
      const manifestInputs = extractablePaths.filter((artifactPath) => artifactPath !== 'validation-report.json')
      await writeArtifactManifest(task, store, manifestInputs)
      const manifestFile = (await store.listWorkspaceFiles(task.id)).find((file) => file.path === 'artifact-manifest.json')
      if (manifestFile) await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: 'ONEComputer artifact manifest', content: 'artifact-manifest.json',
        payload: {
          executionRoute: 'onecomputer_sandbox', sandboxId: sandbox.id, kind: 'artifact_manifest', size: manifestFile.size, portable: true,
          uri: `/api/tasks/${task.id}/file?path=artifact-manifest.json&download=1`,
        },
      })
      let generatedArtifactPreview = false
      if (paths.includes('index.html')) {
        await store.updateTask(task.id, { previewPath: `/api/tasks/${task.id}/preview` })
        await store.appendEvent(task.id, {
          type: 'artifact_created', lane: 'artifact', label: 'ONEComputer-generated preview', content: 'index.html',
          payload: { kind: task.mode, uri: `/api/tasks/${task.id}/preview`, sandboxId: sandbox.id },
        })
        if (browserAutomationEnabled && ['website', 'app', 'game'].includes(task.mode)) {
          const screenshotPath = `evidence/visual/browser-review-${Date.now()}.png`
          const browserReview = await this.client.exec(sandbox.id, [
            'set -eu',
            'browser=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)',
            'test -n "$browser"',
            'output=/tmp/onevibe-browser-review.png',
            'rm -f "$output"',
            `"$browser" --headless=new --no-sandbox --disable-gpu --window-size=1440,900 --host-resolver-rules=${shellQuote('MAP * 0.0.0.0, EXCLUDE localhost')} --screenshot="$output" ${shellQuote(`file://${workspace}/index.html`)} || "$browser" --headless --no-sandbox --disable-gpu --window-size=1440,900 --host-resolver-rules=${shellQuote('MAP * 0.0.0.0, EXCLUDE localhost')} --screenshot="$output" ${shellQuote(`file://${workspace}/index.html`)}`,
            'test -s "$output"',
            'base64 -w0 "$output"',
          ].join('\n'), signal)
          const screenshot = Buffer.from(browserReview.output.trim(), 'base64')
          if (browserReview.exitCode === 0 && screenshot.byteLength <= 5 * 1024 * 1024 && isPng(screenshot)) {
            await store.writeWorkspaceBytes(task.id, screenshotPath, screenshot)
            await store.appendEvent(task.id, {
              type: 'artifact_created', lane: 'artifact', label: 'Sandbox browser preview captured', content: screenshotPath,
              payload: { kind: 'visual_frame', uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(screenshotPath)}&raw=1`, sandboxId: sandbox.id, capturePhase: 'generated_artifact_review', causedByEventId: agentExecution.id, reviewSurface: 'sandbox_local_file', browserEgress: 'blocked' },
            })
            generatedArtifactPreview = true
          } else {
            await store.appendEvent(task.id, {
              type: 'activity_delta', lane: 'control', label: 'Sandbox browser preview unavailable',
              content: 'The generated artifact could not be rendered into a bounded sandbox-local browser screenshot. Agent browser evidence remains separately recorded.',
              payload: { sandboxId: sandbox.id, reason: browserReview.exitCode === 0 ? 'invalid_screenshot' : 'browser_command_failed' },
            })
          }
        }
      }
      if (browserAutomationEnabled) {
        const agentTools = [...browserReviewTools]
        const observed = agentTools.length > 0 || generatedArtifactPreview
        await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: observed ? 'Sandbox browser review observed' : 'Sandbox browser review not observed',
          content: generatedArtifactPreview
            ? 'The generated local artifact was rendered by a sandbox-local headless browser with hostname resolution blocked; the screenshot is preserved in task evidence.'
            : agentTools.length
              ? `The sandbox used ${agentTools.map((tool) => tool.replace('mcp__playwright__', '')).join(', ')}; related X11 checkpoints remain in task evidence.`
              : 'Browser capability was enabled, but no allowlisted browser tool or generated-artifact review appeared in the bounded execution. Treat browser validation as incomplete.',
          payload: { sandboxId: sandbox.id, browserAutomation: true, observed, agentTools, generatedArtifactPreview },
        })
      }
      const sandboxBuildValidationEnabled = this.options.gatewayEnforced && process.env.ONEVIBE_SANDBOX_BUILD_VALIDATION === 'true'
      const hasBuildableProject = ['website', 'app', 'game'].includes(task.mode) && paths.includes('app/package.json')
      if (sandboxBuildValidationEnabled && hasBuildableProject) {
        await store.appendEvent(task.id, {
          type: 'tool_call_started', lane: 'activity', label: 'Sandbox dependency and build validation',
          content: 'Installing project dependencies with lifecycle scripts disabled, then running the generated build inside the gateway-attested sandbox.',
          payload: { executionRoute: 'onecomputer_sandbox', sandboxId: sandbox.id, toolName: 'onecomputer.sandbox.build_validate', input: { packageManager: 'npm', lifecycleScripts: 'disabled' } },
        })
        const startedAt = Date.now()
        const buildResult = await this.client.exec(sandbox.id, sandboxBuildValidationCommand(workspace), signal)
        const durationMs = Date.now() - startedAt
        const passed = buildResult.exitCode === 0
        const reportPath = 'sandbox-build-report.json'
        let packageLockRecorded = false
        if (passed) {
          const lock = await this.client.exec(sandbox.id, sandboxPackageLockExtractionCommand(workspace), signal)
          if (lock.exitCode === 0 && lock.output.trim() && !lock.output.startsWith('oversize:')) {
            const lockBytes = Buffer.from(lock.output.trim(), 'base64')
            if (lockBytes.byteLength > 0 && lockBytes.byteLength <= 1024 * 1024) {
              await store.writeWorkspaceBytes(task.id, 'app/package-lock.json', lockBytes)
              packageLockRecorded = true
              await store.appendEvent(task.id, {
                type: 'artifact_created', lane: 'artifact', label: 'Sandbox-generated package lock', content: 'app/package-lock.json',
                payload: { executionRoute: 'onecomputer_sandbox', kind: 'package_lock', sandboxId: sandbox.id, size: lockBytes.byteLength },
              })
            }
          }
        }
        await store.writeWorkspaceFile(task.id, reportPath, `${JSON.stringify({
          version: 1,
          mode: task.mode,
          checkedAt: new Date().toISOString(),
          execution: 'onecomputer_sandbox',
          gatewayEnforced: true,
          lifecycleScripts: 'disabled_during_install',
          passed,
          exitCode: buildResult.exitCode,
          durationMs,
          outputBytes: Buffer.byteLength(buildResult.output),
          packageLockRecorded,
          limitation: 'This records a build attempted inside the disposable sandbox. It does not prove dependency provenance, browser behavior, deployment safety, or production policy compliance.',
        }, null, 2)}\n`)
        await store.appendEvent(task.id, {
          type: 'tool_call_completed', lane: 'activity', label: passed ? 'Sandbox build validation passed' : 'Sandbox build validation needs review',
          content: passed ? 'Dependency installation and the generated build completed inside the gateway-attested sandbox.' : 'The generated build did not complete inside the sandbox; inspect sandbox-build-report.json and the bounded sandbox evidence before handoff.',
          payload: { executionRoute: 'onecomputer_sandbox', sandboxId: sandbox.id, toolName: 'onecomputer.sandbox.build_validate', passed, exitCode: buildResult.exitCode, durationMs, outputBytes: Buffer.byteLength(buildResult.output) },
        })
        await store.appendEvent(task.id, {
          type: 'artifact_created', lane: 'artifact', label: passed ? 'Sandbox build report passed' : 'Sandbox build report needs review', content: reportPath,
          payload: { executionRoute: 'onecomputer_sandbox', kind: 'sandbox_build_report', passed, sandboxId: sandbox.id },
        })
      }
      await store.setPlanStep(task.id, 'build', 'completed')
      await store.setPlanStep(task.id, 'verify', 'running')
      const validation = await validateModeArtifacts(store.getTask(task.id), store)
      await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: validation.passed ? 'Static artifact contract passed' : 'Static artifact contract needs review',
        content: 'validation-report.json',
        payload: { executionRoute: 'onecomputer_sandbox', kind: 'validation_report', passed: validation.passed, checkCount: validation.checks.length, limitation: validation.limitation },
      })
      await store.setPlanStep(task.id, 'verify', 'completed')
      await store.setPlanStep(task.id, 'deliver', 'running')
      await store.setPlanStep(task.id, 'deliver', 'completed')
      await store.appendEvent(task.id, {
        type: 'run_completed', lane: 'control', status: 'completed', label: 'ONEComputer sandbox task completed',
        content: `${paths.length} portable artifacts delivered with the sandbox lifecycle recorded in evidence.`,
        payload: { sandboxId: sandbox.id, leaseId: acquired.lease.id, leaseGeneration: acquired.lease.generation, sandboxRetained: true, gatewayEnforced: this.options.gatewayEnforced },
      })
      await store.updateTask(task.id, { status: 'completed' })
    } catch (error) {
      stopVisualLoop?.()
      await visualLoop?.catch(() => undefined)
      await visualCaptureTail.catch(() => undefined)
      if (signal.aborted && agentLaunchAttempted && agentWorkspace) {
        await this.quiesceAgentAfterCancellation(task.id, sandbox.id, agentWorkspace, agentPid, store)
      }
      throw error
    }
  }
}
