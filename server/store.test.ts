import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('TaskStore', () => {
  it('creates an ordered tamper-evident event chain', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-store-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Create a governed workspace', 'demo')
    await store.appendEvent(task.id, { type: 'run_started', lane: 'control', payload: {} })
    await store.appendEvent(task.id, { type: 'run_completed', lane: 'control', payload: {} })
    expect(store.listEvents(task.id)).toHaveLength(2)
    expect(store.listEvents(task.id)[1]?.previousHash).toBe(store.listEvents(task.id)[0]?.eventHash)
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('rejects workspace traversal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-store-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Test path isolation', 'demo')
    expect(() => store.workspacePath(task.id, '../../outside.txt')).toThrow('Path escapes')
  })
})
