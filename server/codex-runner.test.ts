import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumeRuntime } from './runtime-adapter-test-helpers.js'

const roots: string[] = []

const streamResponse = (frames: unknown[]) => {
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n'
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('CodexRuntimeAdapter', () => {
  it('streams through LiteLLM and confines model-requested workspace writes', async () => {
    vi.stubEnv('ONEVIBE_LITELLM_URL', 'http://127.0.0.1:4100')
    vi.stubEnv('ONEVIBE_LITELLM_API_KEY', 'server-only-test-key')
    vi.stubEnv('ONEVIBE_LITELLM_MODEL', 'codex-test-alias')
    const requests: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers) })
      if (requests.length === 1) return streamResponse([
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_write', function: { name: 'workspace_write', arguments: '{"path":"README.md","content":"# Routed"}' } }] } }] },
      ])
      return streamResponse([{ choices: [{ delta: { content: 'Done through the relay.' } }] }])
    }))

    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-codex-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { CodexRuntimeAdapter } = await import('./codex-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Create a README', 'codex', 'document')
    await store.beginTurn(task.id, task.prompt, task.provider)

    await consumeRuntime(new CodexRuntimeAdapter(), task, store)

    expect(await readFile(path.join(store.workspacePath(task.id), 'README.md'), 'utf8')).toBe('# Routed')
    expect(store.listEvents(task.id).some((event) => event.type === 'assistant_text_delta' && event.content === 'Done through the relay.')).toBe(true)
    expect(store.listEvents(task.id).some((event) => event.type === 'tool_call_started' && event.payload.executionRoute === 'codex_litellm')).toBe(true)
    expect(store.listEvents(task.id).at(-1)?.type).toBe('run_completed')
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.url === 'http://127.0.0.1:4100/v1/chat/completions')).toBe(true)
    expect(requests[0]?.body.model).toBe('codex-test-alias')
    expect(requests[0]?.body.user).toBe('test-provider-request-' + task.id)
    expect(requests[0]?.headers.get('X-OneVibe-Execution-Id')).toBe('test-execution-' + task.id)
    expect(requests[0]?.headers.get('X-OneVibe-Provider-Request-Id')).toBe('test-provider-request-' + task.id)
    expect(JSON.stringify(store.listEvents(task.id))).not.toContain('server-only-test-key')
  })
})
