import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('UserInputBroker', () => {
  it('parks a task, returns the answer to the runtime, and records both transitions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-input-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { UserInputBroker } = await import('./user-input-broker.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Ask me for a region', 'claude_sdk')
    const broker = new UserInputBroker(store)
    const answerPromise = broker.request(task.id, 'Which region?', ['Singapore', 'Virginia'], new AbortController().signal)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const request = store.getTask(task.id).inputRequest

    expect(store.getTask(task.id).status).toBe('waiting_for_user_input')
    expect(request?.options).toEqual(['Singapore', 'Virginia'])
    await broker.resolve(task.id, request!.id, 'Singapore')

    expect(await answerPromise).toBe('Singapore')
    expect(store.getTask(task.id).status).toBe('running')
    expect(store.getTask(task.id).inputRequest).toBeUndefined()
    expect(store.listEvents(task.id).map((event) => event.type)).toEqual(['user_input_requested', 'user_input_resolved'])
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('rejects the parked runtime when execution is cancelled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-input-cancel-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { UserInputBroker } = await import('./user-input-broker.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Cancel while waiting', 'claude_sdk')
    const broker = new UserInputBroker(store)
    const controller = new AbortController()
    const answer = broker.request(task.id, 'Continue?', [], controller.signal)
    controller.abort()

    await expect(answer).rejects.toThrow('Task cancelled')
  })
})
