import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('DemoRuntimeAdapter', () => {
  it('pairs local-demo tool starts and results with inspectable tool-call IDs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-demo-runner-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { DemoRuntimeAdapter } = await import('./demo-runner.js')
    const { consumeRuntime } = await import('./runtime-adapter-test-helpers.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed local artifact', 'demo')

    await consumeRuntime(new DemoRuntimeAdapter(), task, store)

    const events = store.listEvents(task.id)
    for (const name of ['workspace.write', 'artifact.validate']) {
      const matching = events.filter((event) => event.payload.toolName === name)
      expect(matching).toHaveLength(2)
      expect(matching[0]?.payload.toolUseId).toMatch(/^demo_/)
      expect(matching[1]?.payload.toolUseId).toBe(matching[0]?.payload.toolUseId)
      expect(matching[0]?.payload.executionRoute).toBe('local_demo')
    }
  })

  it('does not materialize or claim selected skills in simulation mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-demo-skills-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { DemoRuntimeAdapter } = await import('./demo-runner.js')
    const { consumeRuntime } = await import('./runtime-adapter-test-helpers.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Say hello', 'demo', 'chat', 'project_onevibe', undefined, [], [], ['document'])

    await consumeRuntime(new DemoRuntimeAdapter(), task, store)

    const files = await store.listWorkspaceFiles(task.id)
    expect(files.some((file) => file.path.includes('.claude/skills/'))).toBe(false)
  })
})
