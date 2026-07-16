import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import { TaskStore } from './store.js'

class ContractAdapter extends RuntimeAdapterBase {
  readonly name = 'contract-test'
  readonly providerId = 'demo' as const
  readonly capabilities = ['streaming', 'file_system'] as const

  protected async execute({ task, store, signal, prompt }: LegacyRuntimeContext) {
    signal.throwIfAborted()
    await store.updateTask(task.id, { status: 'running' })
    await store.appendEvent(task.id, {
      type: 'assistant_text_delta', lane: 'transcript', content: `echo:${prompt}`, payload: { executionRoute: 'contract_test' },
    })
    await store.appendEvent(task.id, {
      type: 'run_completed', lane: 'control', status: 'completed', label: 'Contract adapter completed', payload: { executionRoute: 'contract_test' },
    })
    await store.updateTask(task.id, { status: 'completed' })
  }
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('RuntimeAdapter lifecycle contract', () => {
  it('initializes and streams persisted normalized events without duplicating them', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-runtime-contract-'))
    roots.push(root)
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('contract prompt', 'demo', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const adapter = new ContractAdapter()
    const workingDir = store.workspacePath(task.id)
    await adapter.initialize(task, workingDir, [{ id: 'mcp-test', name: 'Test MCP', command: 'node', args: [], env: { TOKEN: 'never-rendered' } }])

    const streamed = []
    for await (const event of adapter.run('hello', {
      task, store, continuation: false, workingDir, mcpConfigs: [],
      requestUserInput: async () => 'unused',
    }, new AbortController().signal)) streamed.push(event)

    expect(streamed.map((event) => event.type)).toEqual(['assistant_text_delta', 'run_completed'])
    expect(store.listEvents(task.id).map((event) => event.type)).toEqual(['assistant_text_delta', 'run_completed'])
    expect(await adapter.getFiles()).toEqual([])
    expect(await adapter.getPreviewUrl()).toBeNull()
    await adapter.destroy()
  })
})
