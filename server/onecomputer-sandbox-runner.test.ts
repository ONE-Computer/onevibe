import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OneComputerClient } from './onecomputer-client.js'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('OneComputerSandboxRuntimeAdapter', () => {
  it('only exposes browser MCP controls when the governed runtime explicitly enables them', async () => {
    const { GOVERNED_BROWSER_TOOLS, browserEvidenceFor, governedClaudeTools, isGovernedBrowserTool, isSandboxRuntimeReady } = await import('./onecomputer-sandbox-runner.js')
    expect(governedClaudeTools(false)).toEqual(['Read', 'Write', 'Edit', 'Glob', 'Grep'])
    expect(governedClaudeTools(true)).toEqual(expect.arrayContaining([...GOVERNED_BROWSER_TOOLS]))
    expect(GOVERNED_BROWSER_TOOLS).toEqual(expect.arrayContaining(['mcp__playwright__browser_select_option', 'mcp__playwright__browser_wait_for']))
    expect(GOVERNED_BROWSER_TOOLS).not.toEqual(expect.arrayContaining(['mcp__playwright__browser_evaluate', 'mcp__playwright__browser_file_upload', 'mcp__playwright__browser_cookie_list', 'mcp__playwright__browser_route']))
    expect(isGovernedBrowserTool('mcp__playwright__browser_snapshot')).toBe(true)
    expect(isGovernedBrowserTool('mcp__playwright__browser_evaluate')).toBe(false)
    expect(browserEvidenceFor('mcp__playwright__browser_navigate', { url: 'https://user:password@example.com/path?token=hidden#fragment' })).toEqual({ tool: 'browser_navigate', url: 'https://example.com/path' })
    expect(browserEvidenceFor('mcp__playwright__browser_navigate', { url: 'file:///tmp/onevibe/task/index.html' })).toEqual({ tool: 'browser_navigate', url: 'file://sandbox-local/index.html' })
    expect(isSandboxRuntimeReady({ state: 'started', bootstrapped: false })).toBe(false)
    expect(isSandboxRuntimeReady({ state: 'started', bootstrapped: true })).toBe(true)
    expect(isSandboxRuntimeReady({ state: 'started' })).toBe(true)
  })

  it('builds generated projects only in the sandbox and disables install lifecycle scripts', async () => {
    const { sandboxBuildValidationCommand, sandboxPackageLockExtractionCommand } = await import('./onecomputer-sandbox-runner.js')
    const command = sandboxBuildValidationCommand('/tmp/onevibe/task-safe')
    expect(command).toContain("cd '/tmp/onevibe/task-safe/app'")
    expect(command).toContain('npm ci --ignore-scripts --no-audit --no-fund')
    expect(command).toContain('npm install --ignore-scripts --no-audit --no-fund')
    expect(command).toContain('npm run build')
    expect(command).not.toContain('npm install --no-audit --no-fund')
    expect(sandboxPackageLockExtractionCommand('/tmp/onevibe/task-safe')).toContain('test "$bytes" -le 1048576')
  })

  it('projects a bounded, redacted Claude stream journal into timeline events', async () => {
    const { parseClaudeStreamJournal } = await import('./onecomputer-sandbox-runner.js')
    const journal = [
      JSON.stringify({ type: 'assistant', session_id: 'session-sandbox-1', message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'index.html', api_key: 'never-show', url: 'https://user:password@example.com/path?token=never-show#secret' } }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Wrote index.html' }] } }),
      JSON.stringify({ type: 'result', session_id: 'session-sandbox-1', result: 'Completed the page.' }),
    ].join('\n')

    expect(parseClaudeStreamJournal(journal)).toEqual({
      sessionId: 'session-sandbox-1', result: 'Completed the page.',
      entries: [
        { kind: 'tool_started', toolUseId: 'tool-1', name: 'Write', input: { file_path: 'index.html', api_key: '[REDACTED]', url: 'https://example.com/path' } },
        { kind: 'tool_completed', toolUseId: 'tool-1', content: 'Wrote index.html', isError: false },
      ],
    })
  })

  it('executes Claude in a conversation-owned sandbox and retains the boundary', async () => {
    vi.stubEnv('ONEVIBE_LITELLM_URL', 'http://host-only-litellm:4100')
    vi.stubEnv('ONEVIBE_SANDBOX_LITELLM_URL', 'http://sandbox-reachable-litellm:4100')
    vi.stubEnv('ONEVIBE_LITELLM_API_KEY', 'test-sandbox-routing-key')
    vi.stubEnv('ONEVIBE_SANDBOX_LITELLM_AUTH_TOKEN', 'test-sandbox-bearer-token')
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-onecomputer-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { OneComputerSandboxRuntimeAdapter } = await import('./onecomputer-sandbox-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a confidential launch page', 'onecomputer', 'website')
    const commands: string[] = []
    const streamJournal = [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'index.html' } }, { type: 'tool_use', id: 'tool-2', name: 'mcp__playwright__browser_snapshot', input: {} }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Wrote index.html' }, { type: 'tool_result', tool_use_id: 'tool-2', content: 'Rendered local page' }] } }),
      JSON.stringify({ type: 'result', session_id: 'session-1', result: 'Created safely.' }),
    ].join('\n')
    const sandboxPlan = JSON.stringify({ steps: [
      { id: 'scope', title: 'Frame the launch outcome' },
      { id: 'workspace', title: 'Prepare the isolated site workspace' },
      { id: 'build', title: 'Build the launch page' },
      { id: 'verify', title: 'Check the portable site artifact' },
      { id: 'deliver', title: 'Deliver source and evidence' },
    ] })
    const exec = vi.fn(async (_id: string, command: string) => {
      commands.push(command)
      if (command.includes('find .')) return { exitCode: 0, output: Buffer.from('index.html\0README.md\0').toString('base64') }
      if (command.includes('onevibe-browser-review.png')) return { exitCode: 0, output: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64') }
      if (command.includes('test -f .onevibe-plan.json')) return { exitCode: 0, output: Buffer.from(sandboxPlan).toString('base64') }
      if (command.includes('.onevibe-exitcode')) return { exitCode: 0, output: `done:0\n${Buffer.from(streamJournal).toString('base64')}` }
      if (command.endsWith("'index.html'")) return { exitCode: 0, output: Buffer.from('<h1>Sandbox output</h1>').toString('base64') }
      if (command.endsWith("'README.md'")) return { exitCode: 0, output: Buffer.from('# Sandbox output').toString('base64') }
      return { exitCode: 0, output: '' }
    })
    const client = {
      createSandbox: vi.fn(async () => ({ id: 'sandbox-1', state: 'creating', provider: 'kasm-local' })),
      getSandbox: vi.fn(async () => ({ id: 'sandbox-1', state: 'started', provider: 'kasm-local' })),
      exec,
      deleteSandbox: vi.fn(async () => undefined),
      startVisualRuntime: vi.fn(async () => ({ display: ':99', width: 1440, height: 900, browserReady: true })),
      getVisualScreenshot: vi.fn(async () => ({ png: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), capturedAt: '2026-07-16T00:00:00.000Z' })),
    } as unknown as OneComputerClient
    const adapter = new OneComputerSandboxRuntimeAdapter(client, { gatewayEnforced: true, retainSandbox: false, visualRuntime: true, browserAutomation: true, pollMilliseconds: 1, visualCheckpointMilliseconds: 100_000 })

    await adapter.run({
      task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false,
      requestUserInput: async () => 'unused',
    })

    expect(await store.readWorkspaceFile(task.id, 'index.html')).toContain('Sandbox output')
    expect(commands.join('\n')).not.toContain(task.prompt)
    expect(commands.some((command) => command.includes('claude --print'))).toBe(true)
    expect(commands.some((command) => command.includes('--output-format stream-json --verbose'))).toBe(true)
    expect(commands.some((command) => command.includes('export PATH=/opt/node22/bin:/home/kasm-user/.npm-global/bin:$PATH'))).toBe(true)
    expect(commands.some((command) => command.includes("export ANTHROPIC_BASE_URL='http://sandbox-reachable-litellm:4100'"))).toBe(true)
    expect(commands.some((command) => command.includes("export ANTHROPIC_API_KEY='placeholder'"))).toBe(true)
    expect(commands.some((command) => command.includes("export ANTHROPIC_AUTH_TOKEN='test-sandbox-bearer-token'"))).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.type === 'run_started' && event.payload.claudeTransport === 'litellm')).toBe(true)
    expect(JSON.stringify(store.listEvents(task.id))).not.toContain('test-sandbox-routing-key')
    expect(JSON.stringify(store.listEvents(task.id))).not.toContain('test-sandbox-bearer-token')
    expect(JSON.stringify(store.listEvents(task.id))).not.toContain('sandbox-reachable-litellm')
    expect(commands.some((command) => command.includes('mcp__playwright__browser_navigate'))).toBe(true)
    expect(client.deleteSandbox).not.toHaveBeenCalled()
    expect(store.listEvents(task.id).filter((event) => event.label === 'ONEComputer sandbox state observed').map((event) => event.payload.state)).toEqual(['creating', 'started'])
    expect(client.startVisualRuntime).toHaveBeenCalledWith('sandbox-1', expect.any(AbortSignal))
    expect(client.getVisualScreenshot).toHaveBeenCalledTimes(7)
    const evidenceFiles = (await store.listWorkspaceFiles(task.id)).filter((file) => file.path.includes('evidence/visual/'))
    expect(evidenceFiles).toHaveLength(2)
    const frames = store.listEvents(task.id).filter((event) => event.payload.kind === 'visual_frame')
    expect(frames.map((event) => event.payload.capturePhase)).toEqual(['runtime_ready', 'before_agent', 'tool_started', 'browser_tool_started', 'tool_completed', 'browser_tool_completed', 'after_agent', 'generated_artifact_review'])
    expect(frames.slice(1).every((event) => typeof event.payload.causedByEventId === 'string')).toBe(true)
    expect(frames.filter((event) => event.payload.capturePhase !== 'generated_artifact_review').every((event) => event.payload.capturedAt === '2026-07-16T00:00:00.000Z')).toBe(true)
    expect(frames.filter((event) => event.payload.capturePhase !== 'generated_artifact_review').slice(1).every((event) => event.payload.deduplicated === true)).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.label === 'Write' && event.payload.toolUseId === 'tool-1')).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.label === 'Browser · browser_snapshot' && event.payload.toolUseId === 'tool-2' && event.payload.browserTool === true)).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.label === 'Browser result' && event.payload.toolUseId === 'tool-2' && event.payload.browserTool === true)).toBe(true)
    expect(store.getTask(task.id).securityContext?.runtimeSessionId).toBe('session-1')
    expect(store.getTask(task.id).securityContext).toMatchObject({ runtimeSessionLeaseGeneration: 1 })
    expect(store.getTask(task.id).plan[0]?.title).toBe('Frame the launch outcome')
    expect(store.listEvents(task.id).some((event) => event.label === 'Task plan refined by runtime' && event.payload.source === 'onecomputer')).toBe(true)
    expect(store.getTask(task.id).securityContext).toMatchObject({ executionBoundary: 'onecomputer_sandbox', sandboxState: 'started', gatewayEnforced: true })
    expect(store.findActiveRuntimeLease(task.id)).toMatchObject({ status: 'ready', providerSandboxId: 'sandbox-1', generation: 1 })
    expect(store.listEvents(task.id).some((event) => event.label === 'Governed browser automation ready')).toBe(true)
    expect(commands.some((command) => command.includes('onevibe-browser-review.png'))).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.label === 'Sandbox browser review observed' && event.payload.generatedArtifactPreview === true)).toBe(true)
    expect(frames.at(-1)?.payload.uri).toContain(`/api/tasks/${task.id}/file?path=evidence%2Fvisual%2Fbrowser-review-`)
    expect(store.listEvents(task.id).some((event) => event.label === 'Static artifact contract needs review' && event.content === 'validation-report.json')).toBe(true)
    expect(await store.readWorkspaceFile(task.id, 'validation-report.json')).toContain('Static contract validation only')
    expect(store.listEvents(task.id).at(-1)?.type).toBe('run_completed')
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('retains the known conversation sandbox when cancellation occurs during provisioning', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-onecomputer-cancel-provisioning-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { OneComputerSandboxRuntimeAdapter } = await import('./onecomputer-sandbox-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Cancel while a sandbox provisions', 'onecomputer')
    const client = {
      createSandbox: vi.fn(async () => ({ id: 'sandbox-provisioning', state: 'provisioning', provider: 'kasm-local' })),
      getSandbox: vi.fn(async () => ({ id: 'sandbox-provisioning', state: 'provisioning', provider: 'kasm-local' })),
      deleteSandbox: vi.fn(async () => undefined),
      exec: vi.fn(),
      startVisualRuntime: vi.fn(),
      getVisualScreenshot: vi.fn(),
    } as unknown as OneComputerClient
    const adapter = new OneComputerSandboxRuntimeAdapter(client, { gatewayEnforced: true, retainSandbox: false, visualRuntime: false, pollMilliseconds: 10_000 })
    const controller = new AbortController()
    const run = adapter.run({ task, store, signal: controller.signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'unused' })

    await vi.waitFor(() => expect(store.getTask(task.id).securityContext).toMatchObject({ sandboxId: 'sandbox-provisioning', sandboxState: 'provisioning', executionBoundary: 'onecomputer_sandbox' }))
    controller.abort()

    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.deleteSandbox).not.toHaveBeenCalled()
    expect(store.getTask(task.id).securityContext).toMatchObject({ sandboxId: 'sandbox-provisioning', sandboxState: 'provisioning' })
    expect(store.findActiveRuntimeLease(task.id)).toMatchObject({ status: 'ready', providerSandboxId: 'sandbox-provisioning' })
  })

  it('reuses the conversation-owned sandbox and Claude session for a continuation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-onecomputer-retained-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { OneComputerSandboxRuntimeAdapter } = await import('./onecomputer-sandbox-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Continue sandbox work', 'onecomputer')
    const journal = Buffer.from(JSON.stringify({ type: 'result', session_id: 'session-retained', result: 'Done.' })).toString('base64')
    const commands: string[] = []
    const client = {
      createSandbox: vi.fn(async () => ({ id: 'sandbox-retained', state: 'started', provider: 'kasm-local' })),
      getSandbox: vi.fn(async () => ({ id: 'sandbox-retained', state: 'started', provider: 'kasm-local' })),
      exec: vi.fn(async (_id: string, command: string) => {
        commands.push(command)
        return command.includes('find .') ? { exitCode: 0, output: Buffer.from('README.md\0').toString('base64') } : command.endsWith("'README.md'") ? { exitCode: 0, output: Buffer.from('# retained').toString('base64') } : command.includes('.onevibe-exitcode') ? { exitCode: 0, output: `done:0\n${journal}` } : { exitCode: 0, output: '' }
      }),
      deleteSandbox: vi.fn(async () => undefined),
      startVisualRuntime: vi.fn(async () => ({ display: ':99', width: 1440, height: 900, browserReady: false })),
      getVisualScreenshot: vi.fn(),
    } as unknown as OneComputerClient
    const adapter = new OneComputerSandboxRuntimeAdapter(client, { gatewayEnforced: false, retainSandbox: true, visualRuntime: false, pollMilliseconds: 1 })
    await adapter.run({ task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'unused' })
    await adapter.run({ task: store.getTask(task.id), store, signal: new AbortController().signal, prompt: 'Continue with a revision', continuation: true, requestUserInput: async () => 'unused' })
    expect(client.createSandbox).toHaveBeenCalledTimes(1)
    expect(client.getSandbox).toHaveBeenCalled()
    expect(client.deleteSandbox).not.toHaveBeenCalled()
    expect(store.listEvents(task.id).some((event) => event.label === 'ONEComputer retained sandbox resumed')).toBe(true)
    expect(commands.filter((command) => command.includes('claude --print'))).toHaveLength(2)
    expect(commands.filter((command) => command.includes('claude --print'))[0]).not.toContain('--resume')
    expect(commands.filter((command) => command.includes('claude --print'))[1]).toContain("--resume 'session-retained'")
    expect(store.getTask(task.id).securityContext).toMatchObject({ runtimeSessionId: 'session-retained', runtimeSessionLeaseGeneration: 1 })
  })
})
