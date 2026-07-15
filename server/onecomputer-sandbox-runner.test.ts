import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OneComputerClient } from './onecomputer-client.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('OneComputerSandboxRuntimeAdapter', () => {
  it('executes Claude in the sandbox, extracts bounded artifacts, and destroys the boundary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-onecomputer-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { OneComputerSandboxRuntimeAdapter } = await import('./onecomputer-sandbox-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a confidential launch page', 'onecomputer', 'website')
    const commands: string[] = []
    const exec = vi.fn(async (_id: string, command: string) => {
      commands.push(command)
      if (command.includes('find .')) return { exitCode: 0, output: Buffer.from('index.html\0README.md\0').toString('base64') }
      if (command.includes("base64 -w0 .onevibe-result.txt")) return { exitCode: 0, output: Buffer.from('Created safely.').toString('base64') }
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
    const adapter = new OneComputerSandboxRuntimeAdapter(client, { gatewayEnforced: false, retainSandbox: false, visualRuntime: true, pollMilliseconds: 1 })

    await adapter.run({
      task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false,
      requestUserInput: async () => 'unused',
    })

    expect(await store.readWorkspaceFile(task.id, 'index.html')).toContain('Sandbox output')
    expect(commands.join('\n')).not.toContain(task.prompt)
    expect(commands.some((command) => command.includes('claude --print'))).toBe(true)
    expect(client.deleteSandbox).toHaveBeenCalledWith('sandbox-1')
    expect(client.startVisualRuntime).toHaveBeenCalledWith('sandbox-1', expect.any(AbortSignal))
    expect(client.getVisualScreenshot).toHaveBeenCalledTimes(3)
    expect((await store.listWorkspaceFiles(task.id)).some((file) => file.path.includes('evidence/visual/'))).toBe(true)
    const frames = store.listEvents(task.id).filter((event) => event.payload.kind === 'visual_frame')
    expect(frames.map((event) => event.payload.capturePhase)).toEqual(['runtime_ready', 'before_agent', 'after_agent'])
    expect(frames.slice(1).every((event) => typeof event.payload.causedByEventId === 'string')).toBe(true)
    expect(frames.every((event) => event.payload.capturedAt === '2026-07-16T00:00:00.000Z')).toBe(true)
    expect(store.getTask(task.id).securityContext).toMatchObject({ executionBoundary: 'onecomputer_sandbox', sandboxState: 'destroyed', gatewayEnforced: false })
    expect(store.listEvents(task.id).at(-1)?.type).toBe('run_completed')
    expect(store.verifyChain(task.id)).toBe(true)
  })
})
