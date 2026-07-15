import path from 'node:path'
import type { OneComputerClient } from './onecomputer-client.js'
import type { RuntimeAdapter, RuntimeContext } from './runtime-adapter.js'

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`
const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new DOMException('Task cancelled', 'AbortError'))
  const abort = () => { clearTimeout(timer); reject(new DOMException('Task cancelled', 'AbortError')) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, milliseconds)
  signal.addEventListener('abort', abort, { once: true })
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return '[Max depth]'
  if (typeof value === 'string') return value.length > 8_000 ? `${value.slice(0, 8_000)}…[truncated]` : value
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1))
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /authorization|cookie|token|secret|api[_-]?key|password/i.test(key) ? '[REDACTED]' : sanitize(item, depth + 1)]))
}

type ClaudeJournalEntry =
  | { kind: 'tool_started'; toolUseId?: string; name: string; input?: unknown }
  | { kind: 'tool_completed'; toolUseId?: string; content?: string; isError?: boolean }
  | { kind: 'text'; content: string }

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

export class OneComputerSandboxRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'onecomputer'

  constructor(
    private readonly client: OneComputerClient,
    private readonly options: { gatewayEnforced: boolean; retainSandbox: boolean; visualRuntime?: boolean; pollMilliseconds?: number } = { gatewayEnforced: false, retainSandbox: false },
  ) {}

  async run({ task, store, signal, prompt, continuation }: RuntimeContext) {
    signal.throwIfAborted()
    if (continuation) throw new Error('ONEComputer sandbox continuation requires a retained sandbox and is not enabled yet')
    await store.updateTask(task.id, { status: 'running' })
    await store.appendEvent(task.id, {
      type: 'run_started', lane: 'control', status: 'running', label: 'ONEComputer sandbox execution started',
      content: 'The agent process will execute through the authenticated ONEComputer sandbox API, not on the ONEVibe host.',
      payload: { executionRoute: 'onecomputer_sandbox', gatewayEnforced: this.options.gatewayEnforced },
    })
    await store.setPlanStep(task.id, 'scope', 'completed')
    await store.setPlanStep(task.id, 'workspace', 'running')

    const sandbox = await this.client.createSandbox(`onevibe-${task.id.slice(-8)}`, signal)
    let destroyed = false
    const destroy = async () => {
      if (destroyed || this.options.retainSandbox) return
      await this.client.deleteSandbox(sandbox.id)
      destroyed = true
      const current = store.getTask(task.id)
      await store.updateTask(task.id, {
        securityContext: { ...current.securityContext!, sandboxState: 'destroyed', destroyedAt: new Date().toISOString() },
      })
      await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: 'Ephemeral sandbox destroyed',
        content: 'Generated artifacts were copied out before the ONEComputer sandbox was deleted.',
        payload: { sandboxId: sandbox.id, lifecycle: 'destroyed' },
      })
    }

    try {
      let visualRuntimeReady = false
      const captureVisualFrame = async (phase: 'runtime_ready' | 'before_agent' | 'after_agent', causedByEventId?: string) => {
        if (!visualRuntimeReady) return
        try {
          const frame = await this.client.getVisualScreenshot(sandbox.id, signal)
          const framePath = `evidence/visual/${Date.now()}-${phase}.png`
          await store.writeWorkspaceBytes(task.id, framePath, frame.png)
          await store.appendEvent(task.id, {
            type: 'artifact_created', lane: 'artifact', label: `X11 frame · ${phase.replace('_', ' ')}`, content: framePath,
            payload: {
              kind: 'visual_frame', sandboxId: sandbox.id, capturePhase: phase, causedByEventId, capturedAt: frame.capturedAt,
              uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(framePath)}&raw=1`,
            },
          })
        } catch (error) {
          await store.appendEvent(task.id, {
            type: 'activity_delta', lane: 'activity', label: 'X11 evidence capture unavailable',
            content: error instanceof Error ? error.message.slice(0, 300) : 'Visual capture failed',
            payload: { sandboxId: sandbox.id, capturePhase: phase, causedByEventId, visualCapture: 'failed' },
          })
        }
      }
      let live = sandbox
      const deadline = Date.now() + 4 * 60_000
      while (live.state !== 'started') {
        if (live.state === 'error' || Date.now() >= deadline) throw new Error(`ONEComputer sandbox failed to start (state=${live.state ?? 'unknown'})`)
        await wait(this.options.pollMilliseconds ?? 2_000, signal)
        live = await this.client.getSandbox(sandbox.id, signal)
      }
      await store.updateTask(task.id, {
        securityContext: {
          mode: 'onecomputer', sandboxId: sandbox.id, provider: sandbox.provider,
          gatewayEnforced: this.options.gatewayEnforced, executionBoundary: 'onecomputer_sandbox', sandboxState: 'started',
        },
      })
      await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: 'ONEComputer sandbox ready',
        content: `${sandbox.provider ?? 'configured'} provider started an isolated task boundary.`,
        payload: { sandboxId: sandbox.id, provider: sandbox.provider, state: live.state, gatewayEnforced: this.options.gatewayEnforced },
      })
      if (this.options.visualRuntime) {
        const visual = await this.client.startVisualRuntime(sandbox.id, signal)
        visualRuntimeReady = visual.browserReady
        const current = store.getTask(task.id)
        await store.updateTask(task.id, { securityContext: { ...current.securityContext!, visualRuntimeReady: visual.browserReady } })
        await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: 'Headless visual runtime ready',
          content: `X11 ${visual.display} · ${visual.width}×${visual.height} · screenshot stream available without VNC.`,
          payload: { sandboxId: sandbox.id, transport: 'authenticated_png', ...visual },
        })
        await captureVisualFrame('runtime_ready')
      }
      await store.setPlanStep(task.id, 'workspace', 'completed')
      await store.setPlanStep(task.id, 'build', 'running')

      const agentPrompt = [
        'You are ONEVibe operating inside a disposable ONEComputer sandbox.',
        `Creation mode: ${task.mode}.`,
        'Work only in the current directory. Create portable source, README.md, and mode-appropriate artifacts.',
        'For visual output create a self-contained index.html. Do not publish or expose credentials.',
        prompt,
      ].join('\n\n')
      const encodedPrompt = Buffer.from(agentPrompt).toString('base64')
      const workspace = `/tmp/onevibe/${task.id}`
      const command = [
        'set -eu',
        `mkdir -p ${shellQuote(workspace)}`,
        `cd ${shellQuote(workspace)}`,
        `printf %s ${shellQuote(encodedPrompt)} | base64 -d > .onevibe-prompt`,
        "claude --print --output-format stream-json --verbose --permission-mode bypassPermissions --allowedTools 'Read,Write,Edit,Glob,Grep' \"$(cat .onevibe-prompt)\" > .onevibe-events.jsonl",
        'rm -f .onevibe-prompt',
      ].join(' && ')
      const agentExecution = await store.appendEvent(task.id, {
        type: 'tool_call_started', lane: 'activity', label: 'Execute Claude inside ONEComputer',
        content: 'Prompt is base64-transferred to avoid shell interpretation and the agent receives no Bash tool.',
        payload: { sandboxId: sandbox.id, toolName: 'onecomputer.sandbox.exec', allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'] },
      })
      await captureVisualFrame('before_agent', agentExecution.id)
      const execution = await this.client.exec(sandbox.id, command, signal)
      await captureVisualFrame('after_agent', agentExecution.id)
      if (execution.exitCode !== 0) throw new Error(`Sandbox Claude process exited ${execution.exitCode}: ${execution.output.slice(-2_000)}`)
      const journal = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && base64 -w0 .onevibe-events.jsonl`, signal)
      if (journal.exitCode !== 0) throw new Error('Unable to retrieve sandbox agent event journal')
      const parsedJournal = parseClaudeStreamJournal(Buffer.from(journal.output.trim(), 'base64').toString('utf8'))
      for (const entry of parsedJournal.entries) {
        if (entry.kind === 'tool_started') await store.appendEvent(task.id, {
          type: 'tool_call_started', lane: 'activity', label: entry.name,
          content: 'Claude requested a governed workspace tool inside the ONEComputer sandbox.',
          payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, toolUseId: entry.toolUseId, input: entry.input },
        })
        if (entry.kind === 'tool_completed') await store.appendEvent(task.id, {
          type: 'tool_call_completed', lane: 'activity', label: 'Tool result', content: entry.content,
          payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, toolUseId: entry.toolUseId, isError: entry.isError },
        })
        if (entry.kind === 'text') await store.appendEvent(task.id, {
          type: 'assistant_text_delta', lane: 'transcript', content: entry.content,
          payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, source: 'claude_stream_json' },
        })
      }
      if (parsedJournal.result && !parsedJournal.entries.some((entry) => entry.kind === 'text' && entry.content === parsedJournal.result)) await store.appendEvent(task.id, {
        type: 'assistant_text_delta', lane: 'transcript', content: parsedJournal.result,
        payload: { executionRoute: 'onecomputer_sandbox', parentToolCallId: agentExecution.id, source: 'claude_stream_json_result' },
      })
      if (parsedJournal.sessionId) {
        const current = store.getTask(task.id)
        await store.updateTask(task.id, { securityContext: { ...current.securityContext!, runtimeSessionId: parsedJournal.sessionId } })
      }

      const listing = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && find . -type f ! -name '.onevibe-events.jsonl' -print0 | base64 -w0`, signal)
      if (listing.exitCode !== 0) throw new Error('Unable to enumerate sandbox artifacts')
      const paths = Buffer.from(listing.output.trim(), 'base64').toString('utf8').split('\0').filter(Boolean).map((item) => item.replace(/^\.\//, ''))
      if (paths.length > 100) throw new Error('Sandbox produced more than the 100-file extraction limit')
      let totalBytes = 0
      for (const relativePath of paths) {
        const normalized = path.posix.normalize(relativePath)
        if (normalized.startsWith('../') || path.posix.isAbsolute(normalized) || normalized === '..') throw new Error('Sandbox returned an unsafe artifact path')
        const file = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && base64 -w0 -- ${shellQuote(normalized)}`, signal)
        if (file.exitCode !== 0) throw new Error(`Unable to retrieve sandbox artifact ${normalized}`)
        const bytes = Buffer.from(file.output.trim(), 'base64')
        totalBytes += bytes.byteLength
        if (totalBytes > 10 * 1024 * 1024) throw new Error('Sandbox artifacts exceed the 10 MiB extraction limit')
        await store.writeWorkspaceBytes(task.id, normalized, bytes)
      }
      await store.appendEvent(task.id, {
        type: 'tool_call_completed', lane: 'activity', label: 'Sandbox artifacts extracted',
        content: `${paths.length} files copied from the disposable boundary.`,
        payload: { sandboxId: sandbox.id, fileCount: paths.length, totalBytes },
      })
      if (paths.includes('index.html')) {
        await store.updateTask(task.id, { previewPath: `/api/tasks/${task.id}/preview` })
        await store.appendEvent(task.id, {
          type: 'artifact_created', lane: 'artifact', label: 'ONEComputer-generated preview', content: 'index.html',
          payload: { kind: task.mode, uri: `/api/tasks/${task.id}/preview`, sandboxId: sandbox.id },
        })
      }
      await store.setPlanStep(task.id, 'build', 'completed')
      await store.setPlanStep(task.id, 'verify', 'completed')
      await store.setPlanStep(task.id, 'deliver', 'running')
      await destroy()
      await store.setPlanStep(task.id, 'deliver', 'completed')
      await store.appendEvent(task.id, {
        type: 'run_completed', lane: 'control', status: 'completed', label: 'ONEComputer sandbox task completed',
        content: `${paths.length} portable artifacts delivered with the sandbox lifecycle recorded in evidence.`,
        payload: { sandboxId: sandbox.id, sandboxRetained: this.options.retainSandbox, gatewayEnforced: this.options.gatewayEnforced },
      })
      await store.updateTask(task.id, { status: 'completed' })
    } catch (error) {
      await destroy().catch(() => undefined)
      throw error
    }
  }
}
