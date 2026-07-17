import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeStream, runtimeContextFor } from './runtime-adapter-test-helpers.js'
import { mapKimiMessage } from './kimi-runner.js'

const roots: string[] = []

const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200 })

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const makeStore = async (label: string) => {
  const root = await mkdtemp(path.join(tmpdir(), `onevibe-kimi-${label}-`))
  roots.push(root)
  const { TaskStore } = await import('./store.js')
  const store = new TaskStore(root)
  await store.initialize()
  return store
}

describe('mapKimiMessage', () => {
  it('maps assistant text parts to transcript deltas', () => {
    expect(mapKimiMessage({ role: 'assistant', content: [{ type: 'text', text: 'hello' }] })).toEqual([
      { type: 'assistant_text_delta', lane: 'transcript', content: 'hello', payload: {} },
    ])
  })

  it('maps tool_use and tool_result parts to activity-lane tool records', () => {
    const [started] = mapKimiMessage({ role: 'assistant', content: [{ type: 'tool_use', tool_call_id: 'toolu_1', tool_name: 'Bash', input: { command: 'ls' } }] })
    expect(started).toMatchObject({ type: 'tool_call_started', lane: 'activity', label: 'Bash' })
    expect(started?.payload.toolCallId).toBe('toolu_1')
    const [completed] = mapKimiMessage({ role: 'tool', content: [{ type: 'tool_result', tool_call_id: 'toolu_1', output: 'file.txt', is_error: false }] })
    expect(completed).toMatchObject({ type: 'tool_call_completed', lane: 'activity', content: 'file.txt' })
    expect(completed?.status).toBeUndefined()
    const [failed] = mapKimiMessage({ role: 'tool', content: [{ type: 'tool_result', tool_call_id: 'toolu_1', output: 'boom', is_error: true }] })
    expect(failed?.status).toBe('failed')
  })

  it('ignores user messages, empty text, and non-record parts', () => {
    expect(mapKimiMessage({ role: 'user', content: [{ type: 'text', text: 'hi' }] })).toEqual([])
    expect(mapKimiMessage({ role: 'assistant', content: [{ type: 'text', text: '' }, 'junk', 42, null] })).toEqual([])
    expect(mapKimiMessage({ role: 'assistant' })).toEqual([])
  })
})

describe('KimiRuntimeAdapter', () => {
  it('creates a session, submits a prompt, polls messages, and projects them durably', async () => {
    const bodies: Array<{ url: string; method: string; body?: Record<string, unknown> }> = []
    let paged = false
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      bodies.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined })
      if (method === 'POST' && url.endsWith('/api/v1/sessions')) return envelope({ id: 'session-test' })
      if (method === 'GET' && url.endsWith('/status')) return envelope({ busy: false, pending_interaction: 'none', last_turn_reason: 'completed' })
      if (method === 'GET' && url.includes('/messages')) {
        if (url.includes('page_size=1')) return envelope({ items: [] })
        if (paged) return envelope({ items: [] })
        paged = true
        return envelope({
          items: [{
            id: 'msg-1', role: 'assistant', content: [
              { type: 'text', text: 'Kimi answer' },
              { type: 'tool_use', tool_call_id: 'toolu_1', tool_name: 'Bash', input: { command: 'ls' } },
              { type: 'tool_result', tool_call_id: 'toolu_1', output: 'file.txt', is_error: false },
            ],
          }],
        })
      }
      if (method === 'POST' && url.endsWith('/prompts')) return envelope({ prompt_id: 'prompt-1' })
      if (method === 'POST' && url.endsWith(':archive')) return envelope({})
      throw new Error(`Unexpected fetch ${method} ${url}`)
    }))
    const store = await makeStore('run')
    const { KimiRuntimeAdapter } = await import('./kimi-runner.js')
    const task = await store.createTask('Ask Kimi', 'kimi', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const adapter = new KimiRuntimeAdapter('http://kimi.example', undefined, '/tmp/work')
    await adapter.initialize(task, store.workspacePath(task.id), [])
    await consumeStream(adapter.run(task.prompt, runtimeContextFor(task, store, task.prompt, false), new AbortController().signal))

    const create = bodies.find((call) => call.method === 'POST' && call.url.endsWith('/api/v1/sessions'))
    expect(create?.body?.agent_config).toMatchObject({ permission_mode: 'yolo' })
    const submit = bodies.find((call) => call.method === 'POST' && call.url.endsWith('/prompts'))
    expect(submit?.body?.content).toEqual([{ type: 'text', text: task.prompt }])
    expect(bodies.some((call) => call.url.endsWith(':archive'))).toBe(true)

    const events = store.listEvents(task.id)
    expect(events.some((event) => event.type === 'assistant_text_delta' && event.content === 'Kimi answer')).toBe(true)
    expect(events.some((event) => event.type === 'tool_call_started' && event.label === 'Bash')).toBe(true)
    expect(events.some((event) => event.type === 'tool_call_completed')).toBe(true)
    expect(events.some((event) => event.type === 'run_completed')).toBe(true)
    expect(events.some((event) => event.payload.nativeSource === 'kimi_cli')).toBe(true)
    expect(store.verifyChain(task.id)).toBe(true)
    expect((await store.getTask(task.id))?.status).toBe('completed')
  })

  it('reuses a configured session without creating or archiving one', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push(`${method} ${url}`)
      if (method === 'GET' && url.endsWith('/status')) return envelope({ busy: false, pending_interaction: 'none', last_turn_reason: 'completed' })
      if (method === 'GET' && url.includes('/messages')) return envelope({ items: [] })
      if (method === 'POST' && url.endsWith('/prompts')) return envelope({ prompt_id: 'prompt-1' })
      throw new Error(`Unexpected fetch ${method} ${url}`)
    }))
    const store = await makeStore('reuse')
    const { KimiRuntimeAdapter } = await import('./kimi-runner.js')
    const task = await store.createTask('Reuse session', 'kimi', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const adapter = new KimiRuntimeAdapter('http://kimi.example', 'session-fixed', '/tmp/work')
    await adapter.initialize(task, store.workspacePath(task.id), [])
    await consumeStream(adapter.run(task.prompt, runtimeContextFor(task, store, task.prompt, false), new AbortController().signal))

    expect(calls.every((call) => call.includes('/sessions/session-fixed'))).toBe(true)
    expect(calls.some((call) => call.endsWith(':archive'))).toBe(false)
    expect(store.listEvents(task.id).some((event) => event.type === 'run_completed')).toBe(true)
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('reports health from the CLI healthz endpoint only', async () => {
    const { KimiRuntimeAdapter } = await import('./kimi-runner.js')
    vi.stubGlobal('fetch', vi.fn(async () => envelope({ ok: true })))
    await expect(new KimiRuntimeAdapter('http://kimi.example', undefined, '/tmp/work').health()).resolves.toMatchObject({ status: 'online' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    await expect(new KimiRuntimeAdapter('http://kimi.example', undefined, '/tmp/work').health()).resolves.toMatchObject({ status: 'offline' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('conn refused') }))
    await expect(new KimiRuntimeAdapter('http://kimi.example', undefined, '/tmp/work').health()).resolves.toMatchObject({ status: 'offline' })
  })
})
