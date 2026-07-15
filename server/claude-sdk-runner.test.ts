import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type QueryInput = {
  prompt: string
  options: {
    cwd: string
    resume?: string
    canUseTool: (name: string, input: Record<string, unknown>) => Promise<{ behavior: string }>
  }
}

const permissionChecks: string[] = []
const queryCalls: QueryInput[] = []

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: (options: unknown) => ({ type: 'sdk', name: 'onevibe', instance: options }),
  tool: (name: string, description: string, schema: unknown, handler: unknown) => ({ name, description, schema, handler }),
  query: async function* ({ prompt, options }: QueryInput) {
    queryCalls.push({ prompt, options })
    permissionChecks.push((await options.canUseTool('Write', { file_path: 'index.html' })).behavior)
    permissionChecks.push((await options.canUseTool('Bash', { command: 'curl example.com' })).behavior)
    permissionChecks.push((await options.canUseTool('Read', { file_path: '../../private' })).behavior)
    await writeFile(path.join(options.cwd, 'index.html'), '<h1>Governed</h1>')
    yield { type: 'system', subtype: 'init', session_id: 'session-test' }
    yield {
      type: 'stream_event', session_id: 'session-test', parent_tool_use_id: null,
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Building safely.' } },
    }
    yield {
      type: 'assistant', session_id: 'session-test', parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'index.html' } }] },
    }
    yield {
      type: 'result', subtype: 'success', session_id: 'session-test', is_error: false,
      result: 'Created a local preview.', access_token: 'must-not-leak',
    }
  },
}))

const temporaryRoots: string[] = []

afterEach(async () => {
  permissionChecks.splice(0)
  queryCalls.splice(0)
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ClaudeSdkRuntimeAdapter', () => {
  it('preserves native events, confines tools, and emits the terminal event last', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-claude-sdk-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { ClaudeSdkRuntimeAdapter } = await import('./claude-sdk-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed website', 'claude_sdk')

    await new ClaudeSdkRuntimeAdapter().run({ task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'test answer' })

    const events = store.listEvents(task.id)
    expect(permissionChecks).toEqual(['allow', 'deny', 'deny'])
    expect(events.some((event) => event.type === 'assistant_text_delta')).toBe(true)
    expect(events.some((event) => event.type === 'tool_call_started')).toBe(true)
    expect(events.some((event) => event.type === 'artifact_created')).toBe(true)
    expect(events.at(-1)?.type).toBe('run_completed')
    expect(JSON.stringify(events)).not.toContain('must-not-leak')
    expect(store.getTask(task.id).securityContext?.runtimeSessionId).toBe('session-test')
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('resumes the retained Claude session for a follow-up turn', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-claude-resume-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { ClaudeSdkRuntimeAdapter } = await import('./claude-sdk-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build the first version', 'claude_sdk')
    await store.updateTask(task.id, { securityContext: { mode: 'local_demo', gatewayEnforced: false, runtimeSessionId: 'session-existing' } })

    await new ClaudeSdkRuntimeAdapter().run({ task: store.getTask(task.id), store, signal: new AbortController().signal, prompt: 'Now add a pricing section', continuation: true, requestUserInput: async () => 'test answer' })

    expect(queryCalls[0]?.options.resume).toBe('session-existing')
    expect(queryCalls[0]?.prompt).toBe('Now add a pricing section')
  })
})
