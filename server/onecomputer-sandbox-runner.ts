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
        const current = store.getTask(task.id)
        await store.updateTask(task.id, { securityContext: { ...current.securityContext!, visualRuntimeReady: visual.browserReady } })
        await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'control', label: 'Headless visual runtime ready',
          content: `X11 ${visual.display} · ${visual.width}×${visual.height} · screenshot stream available without VNC.`,
          payload: { sandboxId: sandbox.id, transport: 'authenticated_png', ...visual },
        })
        const frame = await this.client.getVisualScreenshot(sandbox.id, signal)
        const framePath = `evidence/visual/${Date.now()}-runtime-ready.png`
        await store.writeWorkspaceBytes(task.id, framePath, frame)
        await store.appendEvent(task.id, {
          type: 'artifact_created', lane: 'artifact', label: 'X11 runtime frame', content: framePath,
          payload: { kind: 'visual_frame', presentation: 'screenshot', sandboxId: sandbox.id, uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(framePath)}&raw=1` },
        })
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
        "claude --print --output-format text --permission-mode bypassPermissions --allowedTools 'Read,Write,Edit,Glob,Grep' \"$(cat .onevibe-prompt)\" > .onevibe-result.txt",
        'rm -f .onevibe-prompt',
      ].join(' && ')
      await store.appendEvent(task.id, {
        type: 'tool_call_started', lane: 'activity', label: 'Execute Claude inside ONEComputer',
        content: 'Prompt is base64-transferred to avoid shell interpretation and the agent receives no Bash tool.',
        payload: { sandboxId: sandbox.id, toolName: 'onecomputer.sandbox.exec', allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'] },
      })
      const execution = await this.client.exec(sandbox.id, command, signal)
      if (execution.exitCode !== 0) throw new Error(`Sandbox Claude process exited ${execution.exitCode}: ${execution.output.slice(-2_000)}`)
      const result = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && base64 -w0 .onevibe-result.txt`, signal)
      if (result.exitCode !== 0) throw new Error('Unable to retrieve sandbox agent result')
      await store.appendEvent(task.id, {
        type: 'assistant_text_delta', lane: 'transcript', content: Buffer.from(result.output.trim(), 'base64').toString('utf8').slice(0, 64_000),
        payload: { executionRoute: 'onecomputer_sandbox' },
      })

      const listing = await this.client.exec(sandbox.id, `cd ${shellQuote(workspace)} && find . -type f ! -name '.onevibe-result.txt' -print0 | base64 -w0`, signal)
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
      await store.appendEvent(task.id, {
        type: 'run_completed', lane: 'control', status: 'completed', label: 'ONEComputer sandbox task completed',
        content: `${paths.length} portable artifacts delivered with the sandbox lifecycle recorded in evidence.`,
        payload: { sandboxId: sandbox.id, sandboxRetained: this.options.retainSandbox, gatewayEnforced: this.options.gatewayEnforced },
      })
      await store.setPlanStep(task.id, 'deliver', 'completed')
      await store.updateTask(task.id, { status: 'completed' })
    } catch (error) {
      await destroy().catch(() => undefined)
      throw error
    }
  }
}
