import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeRuntime } from './runtime-adapter-test-helpers.js'

const roots: string[] = []

const remoteSse = () => {
  const body = 'event: runtime_event\ndata: {"id":"agent-event-1","type":"assistant_text_delta","lane":"transcript","content":"AgentCore routed answer","payload":{"modelRoute":"litellm"}}\n\nevent: runtime_event\ndata: {"id":"agent-event-2","type":"run_completed","lane":"control","status":"completed","label":"Remote complete","payload":{"modelRoute":"litellm"}}\n\n'
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('AgentCoreRuntimeAdapter', () => {
  it('normalizes the governed AgentCore SSE boundary without claiming direct model access', async () => {
    let requestBody: Record<string, unknown> | undefined
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return remoteSse()
    }))
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-agentcore-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { AgentCoreRuntimeAdapter } = await import('./agentcore-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Ask AgentCore', 'agentcore', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)

    await consumeRuntime(new AgentCoreRuntimeAdapter('https://agentcore.example/runtime', 'remote-token'), task, store)

    expect(requestBody?.provider).toBe('agentcore')
    expect(store.listEvents(task.id).some((event) => event.payload.nativeSource === 'agentcore_runtime')).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.content === 'AgentCore routed answer')).toBe(true)
    expect(store.verifyChain(task.id)).toBe(true)
  })
})
