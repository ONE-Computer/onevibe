import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
let queryMode: 'success' | 'early-eof' = 'success'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: (options: unknown) => ({ type: 'sdk', name: 'onevibe', instance: options }),
  tool: (name: string, description: string, schema: unknown, handler: unknown) => ({ name, description, schema, handler }),
  query: async function* ({ prompt, options }: QueryInput) {
    queryCalls.push({ prompt, options })
    permissionChecks.push((await options.canUseTool('Write', { file_path: 'index.html' })).behavior)
    permissionChecks.push((await options.canUseTool('Bash', { command: 'curl example.com' })).behavior)
    permissionChecks.push((await options.canUseTool('Read', { file_path: '../../private' })).behavior)
    await writeFile(path.join(options.cwd, 'index.html'), '<h1>Governed</h1>')
    await writeFile(path.join(options.cwd, 'README.md'), '# Governed workspace')
    await mkdir(path.join(options.cwd, '.claude', 'skills', 'document'), { recursive: true })
    await writeFile(path.join(options.cwd, '.claude', 'skills', 'document', 'SKILL.md'), 'internal runtime guide')
    yield { type: 'system', subtype: 'init', session_id: 'session-test' }
    yield {
      type: 'stream_event', session_id: 'session-test', parent_tool_use_id: null,
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Building safely.' } },
    }
    if (!prompt.startsWith('Hello')) yield {
      type: 'assistant', session_id: 'session-test', parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id: 'tool-1', name: 'Write', input: { file_path: 'index.html' } }] },
    }
    if (queryMode === 'success') {
      yield {
        type: 'result', subtype: 'success', session_id: 'session-test', is_error: false,
        result: 'Created a local preview.', access_token: 'must-not-leak',
      }
    }
  },
}))

const temporaryRoots: string[] = []

beforeEach(() => vi.stubEnv('ANTHROPIC_API_KEY', 'test-server-only-key'))

afterEach(async () => {
  vi.unstubAllEnvs()
  permissionChecks.splice(0)
  queryCalls.splice(0)
  queryMode = 'success'
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ClaudeSdkRuntimeAdapter', () => {
  it('keeps chat conversational and skips the artifact contract', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-claude-chat-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { ClaudeSdkRuntimeAdapter, isSafeBashCommand } = await import('./claude-sdk-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Hello, how are you today?', 'claude_sdk', 'chat')
    await store.beginTurn(task.id, task.prompt, task.provider)

    await new ClaudeSdkRuntimeAdapter().run({ task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'test answer' })

    const events = store.listEvents(task.id)
    expect(events.at(-1)?.type).toBe('run_completed')
    expect(events.some((event) => event.label === 'Static artifact contract passed' || event.label === 'Static artifact contract needs review')).toBe(false)
    expect(events.some((event) => event.type === 'artifact_created')).toBe(false)
    expect(store.getTask(task.id).status).toBe('completed')
    expect(permissionChecks).toEqual(['deny', 'deny', 'deny'])
    expect(isSafeBashCommand('node script.js')).toBe(true)
    expect(isSafeBashCommand('python3 -c "import os"')).toBe(false)
    expect(isSafeBashCommand('curl https://example.com')).toBe(false)
  })

  it('requires an explicit result for success while preserving native events and tool confinement', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-claude-sdk-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { ClaudeSdkRuntimeAdapter } = await import('./claude-sdk-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed website', 'claude_sdk')
    await store.beginTurn(task.id, task.prompt, task.provider)

    await new ClaudeSdkRuntimeAdapter().run({ task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'test answer' })

    const events = store.listEvents(task.id)
    expect(permissionChecks).toEqual(['allow', 'deny', 'deny'])
    expect(events.some((event) => event.type === 'assistant_text_delta')).toBe(true)
    expect(events.some((event) => event.type === 'tool_call_started')).toBe(true)
    expect(events.some((event) => event.type === 'artifact_created')).toBe(true)
    expect(events.some((event) => event.label === 'Claude SDK workspace recorded' && event.payload.fileCount === 2)).toBe(true)
    expect(events.some((event) => event.label === 'Claude SDK artifact' && event.content === 'README.md')).toBe(true)
    expect(events.some((event) => event.label === 'Claude SDK artifact' && event.content?.startsWith('.claude/'))).toBe(false)
    const manifest = JSON.parse(await store.readWorkspaceFile(task.id, 'artifact-manifest.json')) as { outputs: Array<{ path: string; size: number; sha256: string }> }
    expect(manifest.outputs.map((output) => output.path)).toEqual(['index.html', 'README.md'])
    expect(manifest.outputs.some((output) => output.path.startsWith('.claude/'))).toBe(false)
    for (const output of manifest.outputs) {
      const bytes = await store.readWorkspaceBytes(task.id, output.path)
      expect(output.size).toBe(bytes.byteLength)
      expect(output.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    }
    expect(events.filter((event) => event.label === 'Claude SDK artifact manifest')).toHaveLength(1)
    expect(events.find((event) => event.label === 'Claude SDK artifact manifest')?.payload).toMatchObject({
      executionRoute: 'claude_agent_sdk', kind: 'artifact_manifest', portable: true,
      uri: `/api/tasks/${task.id}/file?path=artifact-manifest.json&download=1`,
    })
    expect(events.some((event) => event.label === 'Static artifact contract needs review')).toBe(true)
    expect(await store.readWorkspaceFile(task.id, 'validation-report.json')).toContain('Static contract validation only')
    expect(events.at(-1)?.type).toBe('run_failed')
    expect(events.at(-1)?.payload).toMatchObject({ failureReason: 'artifact_validation_failed' })
    expect(store.getTask(task.id).status).toBe('failed')
    expect(JSON.stringify(events)).not.toContain('must-not-leak')
    expect(store.getTask(task.id).securityContext?.runtimeSessionId).toBe('session-test')
    expect(store.getTask(task.id).plan.map((step) => step.status)).toEqual(['completed', 'completed', 'completed', 'blocked', 'pending'])
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('projects one idempotent manifest event across repeated native turns', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-claude-manifest-repeat-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { ClaudeSdkRuntimeAdapter } = await import('./claude-sdk-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed website', 'claude_sdk')
    const adapter = new ClaudeSdkRuntimeAdapter()

    await store.beginTurn(task.id, task.prompt, task.provider)
    await adapter.run({ task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'test answer' })
    const firstManifest = await store.readWorkspaceFile(task.id, 'artifact-manifest.json')

    await store.beginTurn(task.id, 'Keep the same governed website', task.provider)
    await adapter.run({ task: store.getTask(task.id), store, signal: new AbortController().signal, prompt: 'Keep the same governed website', continuation: true, requestUserInput: async () => 'test answer' })

    expect(await store.readWorkspaceFile(task.id, 'artifact-manifest.json')).toBe(firstManifest)
    const events = store.listEvents(task.id)
    expect(events.filter((event) => event.label === 'Claude SDK artifact manifest')).toHaveLength(1)
    expect(events.filter((event) => event.label === 'Claude SDK artifact')).toHaveLength(2)
  })

  it('fails closed when the SDK stream reaches EOF before a terminal result', async () => {
    queryMode = 'early-eof'
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-claude-early-eof-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { ClaudeSdkRuntimeAdapter } = await import('./claude-sdk-runner.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed website', 'claude_sdk')
    await store.beginTurn(task.id, task.prompt, task.provider)

    await new ClaudeSdkRuntimeAdapter().run({ task, store, signal: new AbortController().signal, prompt: task.prompt, continuation: false, requestUserInput: async () => 'test answer' })

    const events = store.listEvents(task.id)
    const terminalEvent = events.at(-1)
    expect(terminalEvent?.type).toBe('run_failed')
    expect(terminalEvent?.label).toBe('Claude Agent SDK stream closed before terminal result')
    expect(terminalEvent?.content).toBe('The SDK stream ended without an explicit result message.')
    expect(terminalEvent?.payload).toEqual(expect.objectContaining({ executionRoute: 'claude_agent_sdk', failureReason: 'missing_terminal_result' }))
    expect(events.some((event) => event.type === 'run_completed')).toBe(false)
    expect(store.getTask(task.id).status).toBe('failed')
    expect(JSON.stringify(events)).not.toContain('must-not-leak')
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
    await store.beginTurn(task.id, 'Now add a pricing section', task.provider)

    await new ClaudeSdkRuntimeAdapter().run({ task: store.getTask(task.id), store, signal: new AbortController().signal, prompt: 'Now add a pricing section', continuation: true, requestUserInput: async () => 'test answer' })

    expect(queryCalls[0]?.options.resume).toBe('session-existing')
    expect(queryCalls[0]?.prompt).toBe('Now add a pricing section')
  })
})
