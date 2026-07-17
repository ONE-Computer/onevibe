import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeStream, runtimeContextFor } from './runtime-adapter-test-helpers.js'
import { mapA2aStreamEvent, textFromA2aParts } from './a2a-adapter.js'

const roots: string[] = []

const sseResponse = (frames: unknown[]) => {
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

const rpc = (result: unknown) => ({ jsonrpc: '2.0', id: 'req-1', result })

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const makeStore = async (label: string) => {
  const root = await mkdtemp(path.join(tmpdir(), `onevibe-a2a-${label}-`))
  roots.push(root)
  const { TaskStore } = await import('./store.js')
  const store = new TaskStore(root)
  await store.initialize()
  return store
}

describe('A2A stream mapping', () => {
  it('extracts text parts from kind and legacy type shapes only', () => {
    expect(textFromA2aParts([{ kind: 'text', text: 'a' }, { type: 'text', text: 'b' }, { kind: 'file' }, 'junk'])).toBe('ab')
    expect(textFromA2aParts(undefined)).toBe('')
  })

  it('maps artifact-update text chunks to assistant deltas and names the finished artifact', () => {
    const mapped = mapA2aStreamEvent(rpc({ kind: 'artifact-update', taskId: 't1', artifact: { name: 'report.md', parts: [{ kind: 'text', text: 'chunk' }] }, lastChunk: true }))
    expect(mapped.events.map((event) => event.type)).toEqual(['assistant_text_delta', 'artifact_created'])
    expect(mapped.events[0]?.content).toBe('chunk')
    expect(mapped.events[1]?.label).toBe('report.md')
  })

  it('maps working status messages to assistant deltas', () => {
    const mapped = mapA2aStreamEvent(rpc({ kind: 'status-update', taskId: 't1', status: { state: 'working', message: { role: 'agent', parts: [{ kind: 'text', text: 'progress' }] } }, final: false }))
    expect(mapped.events).toEqual([{ type: 'assistant_text_delta', lane: 'transcript', content: 'progress', payload: {} }])
    expect(mapped.state).toBe('working')
  })

  it('surfaces input-required without emitting a duplicate request event', () => {
    const mapped = mapA2aStreamEvent(rpc({ kind: 'status-update', taskId: 't1', status: { state: 'input-required', message: { role: 'agent', parts: [{ kind: 'text', text: 'Which region?' }] } }, final: true }))
    expect(mapped.events).toEqual([])
    expect(mapped.inputPrompt).toBe('Which region?')
  })

  it('maps terminal states to durable run outcomes', () => {
    expect(mapA2aStreamEvent(rpc({ kind: 'status-update', taskId: 't1', status: { state: 'completed' }, final: true })).events.at(-1)?.type).toBe('run_completed')
    expect(mapA2aStreamEvent(rpc({ kind: 'status-update', taskId: 't1', status: { state: 'canceled' }, final: true })).events.at(-1)?.type).toBe('run_cancelled')
    expect(mapA2aStreamEvent(rpc({ kind: 'status-update', taskId: 't1', status: { state: 'failed' }, final: true })).events.at(-1)?.type).toBe('run_failed')
  })

  it('fails closed on JSON-RPC errors and unhandled task states', () => {
    expect(mapA2aStreamEvent({ jsonrpc: '2.0', id: 'req-1', error: { code: -32602, message: 'Invalid params' } }).events[0]?.type).toBe('run_failed')
    expect(mapA2aStreamEvent(rpc({ kind: 'status-update', taskId: 't1', status: { state: 'auth-required' }, final: true })).events[0]?.type).toBe('run_failed')
  })
})

describe('A2aRuntimeAdapter', () => {
  it('runs a task through tasks/sendSubscribe and projects the native stream', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return sseResponse([
        rpc({ kind: 'task', id: 'task-1', status: { state: 'submitted' } }),
        rpc({ kind: 'artifact-update', taskId: 'task-1', artifact: { parts: [{ kind: 'text', text: 'A2A answer' }] }, lastChunk: true }),
        rpc({ kind: 'status-update', taskId: 'task-1', status: { state: 'completed' }, final: true }),
      ])
    }))
    const store = await makeStore('run')
    const { A2aRuntimeAdapter } = await import('./a2a-adapter.js')
    const task = await store.createTask('Ask A2A', 'a2a', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const adapter = new A2aRuntimeAdapter('http://a2a.example/')
    await adapter.initialize(task, store.workspacePath(task.id), [])
    await consumeStream(adapter.run(task.prompt, runtimeContextFor(task, store, task.prompt, false), new AbortController().signal))

    expect(bodies).toHaveLength(1)
    expect(bodies[0]?.method).toBe('tasks/sendSubscribe')
    const params = bodies[0]?.params as Record<string, unknown>
    expect(params?.id).toBe(task.id)
    const events = store.listEvents(task.id)
    expect(events.some((event) => event.content === 'A2A answer')).toBe(true)
    expect(events.some((event) => event.type === 'run_completed')).toBe(true)
    expect(events.some((event) => event.payload.nativeSource === 'a2a_jsonrpc')).toBe(true)
    expect(store.verifyChain(task.id)).toBe(true)
    expect((await store.getTask(task.id))?.status).toBe('completed')
  })

  it('continues an input-required task with the broker answer on the same A2A task id', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      if (bodies.length === 1) {
        return sseResponse([rpc({ kind: 'status-update', taskId: 'task-1', status: { state: 'input-required', message: { role: 'agent', parts: [{ kind: 'text', text: 'Which region?' }] } }, final: true })])
      }
      return sseResponse([
        rpc({ kind: 'artifact-update', taskId: 'task-1', artifact: { parts: [{ kind: 'text', text: 'eu-west it is' }] }, lastChunk: true }),
        rpc({ kind: 'status-update', taskId: 'task-1', status: { state: 'completed' }, final: true }),
      ])
    }))
    const store = await makeStore('input')
    const { A2aRuntimeAdapter } = await import('./a2a-adapter.js')
    const task = await store.createTask('Needs input', 'a2a', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const adapter = new A2aRuntimeAdapter('http://a2a.example/')
    await adapter.initialize(task, store.workspacePath(task.id), [])
    const context = { ...runtimeContextFor(task, store, task.prompt, false), requestUserInput: async () => 'eu-west' }
    await consumeStream(adapter.run(task.prompt, context, new AbortController().signal))

    expect(bodies).toHaveLength(2)
    const continuation = bodies[1]?.params as Record<string, unknown>
    expect(continuation?.id).toBe(task.id)
    const message = continuation?.message as { parts: { text: string }[] }
    expect(message.parts[0]?.text).toBe('eu-west')
    const events = store.listEvents(task.id)
    expect(events.some((event) => event.type === 'user_input_requested')).toBe(true)
    expect(events.some((event) => event.type === 'run_completed')).toBe(true)
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('fails closed when the A2A stream ends without a terminal state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
      rpc({ kind: 'artifact-update', taskId: 'task-1', artifact: { parts: [{ kind: 'text', text: 'partial' }] }, lastChunk: false }),
    ])))
    const store = await makeStore('unknown')
    const { A2aRuntimeAdapter } = await import('./a2a-adapter.js')
    const task = await store.createTask('Dangling stream', 'a2a', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const adapter = new A2aRuntimeAdapter('http://a2a.example/')
    await adapter.initialize(task, store.workspacePath(task.id), [])
    await consumeStream(adapter.run(task.prompt, runtimeContextFor(task, store, task.prompt, false), new AbortController().signal))

    const last = store.listEvents(task.id).at(-1)
    expect(last?.type).toBe('run_failed')
    expect(last?.payload.reconciliationRequired).toBe(true)
    expect((await store.getTask(task.id))?.status).toBe('failed')
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('reports health from the Agent Card only', async () => {
    const { A2aRuntimeAdapter } = await import('./a2a-adapter.js')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ name: 'Kimi Agent', protocolVersion: '0.2' }), { status: 200 })))
    await expect(new A2aRuntimeAdapter('http://a2a.example/').health()).resolves.toMatchObject({ status: 'online', detail: expect.stringMatching(/Kimi Agent/) })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    await expect(new A2aRuntimeAdapter('http://a2a.example/').health()).resolves.toMatchObject({ status: 'offline' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('conn refused') }))
    await expect(new A2aRuntimeAdapter('http://a2a.example/').health()).resolves.toMatchObject({ status: 'offline' })
  })
})
