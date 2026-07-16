import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import type { RuntimeHealth } from './types.js'
import { claudeProviderConfig } from './claude-provider-config.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

type ToolCall = { id: string; name: string; arguments: string }

const tools = [
  {
    type: 'function',
    function: {
      name: 'workspace_write',
      description: 'Write a UTF-8 text file inside the current governed workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'workspace_read',
      description: 'Read a UTF-8 text file inside the current governed workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    },
  },
] as const

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const safeWorkspacePath = (root: string, candidate: unknown) => {
  if (typeof candidate !== 'string' || !candidate.trim() || candidate.length > 240 || path.isAbsolute(candidate) || candidate.split(/[\\/]/).includes('..')) throw new Error('Workspace path must be relative and confined to the task workspace.')
  const resolved = path.resolve(root, candidate)
  const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Workspace path is outside the task workspace.')
  return resolved
}

const parseToolArguments = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) throw new Error('Tool arguments must be an object.')
    return parsed
  } catch {
    throw new Error('The model returned invalid workspace tool arguments.')
  }
}

const sseFrames = async function* (body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        try { yield JSON.parse(data) as unknown } catch { /* Ignore non-JSON provider keepalives. */ }
      }
      if (done) break
    }
  } finally {
    reader.releaseLock()
  }
}

const modelMessagesFor = (context: LegacyRuntimeContext): ChatMessage[] => {
  const history = context.store.listMessages(context.task.id, { limit: 200 }).messages
    .filter((message) => message.content.trim().length > 0 && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({ role: message.role, content: message.content } as ChatMessage))
  return [{ role: 'system', content: 'You are a governed ONEVibe coding assistant. Answer directly. Use workspace_write only for files the user asked you to create or change. Never access credentials, parent paths, or external services.' }, ...history]
}

export class CodexRuntimeAdapter extends RuntimeAdapterBase {
  readonly name = 'codex'
  readonly providerId = 'codex' as const
  readonly capabilities = ['streaming', 'tool_use', 'file_system'] as const

  async health(): Promise<RuntimeHealth> {
    const provider = claudeProviderConfig()
    const endpoint = process.env.ONEVIBE_LITELLM_URL?.trim().replace(/\/+$/, '')
    const key = process.env.ONEVIBE_LITELLM_API_KEY?.trim()
    if (!provider.configured || provider.transport !== 'litellm' || !endpoint || !key) return { status: 'not_configured', detail: 'Configure the server-controlled LiteLLM relay before testing the Codex-compatible runtime.' }
    const started = Date.now()
    try {
      const response = await fetch(`${endpoint}/health`, { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000) })
      return response.ok
        ? { status: 'online', latencyMs: Date.now() - started, detail: 'Codex-compatible requests are routed through the configured LiteLLM relay.' }
        : { status: 'offline', latencyMs: Date.now() - started, detail: 'LiteLLM health probe did not return a successful response.' }
    } catch {
      return { status: 'offline', latencyMs: Date.now() - started, detail: 'The configured LiteLLM relay could not be reached.' }
    }
  }

  protected async execute(context: LegacyRuntimeContext) {
    const provider = claudeProviderConfig()
    const endpoint = process.env.ONEVIBE_LITELLM_URL?.trim().replace(/\/+$/, '')
    const key = process.env.ONEVIBE_LITELLM_API_KEY?.trim()
    const model = process.env.ONEVIBE_CODEX_MODEL?.trim() || provider.model
    if (!provider.configured || provider.transport !== 'litellm' || !endpoint || !key) throw new Error('Codex-compatible runtime requires the server-controlled LiteLLM relay.')
    const workspace = context.workingDir ?? context.store.workspacePath(context.task.id)
    await mkdir(workspace, { recursive: true })
    await context.store.updateTask(context.task.id, { status: 'running' })
    await context.store.appendEvent(context.task.id, {
      type: 'run_started', lane: 'control', status: 'running', label: 'Codex-compatible runtime started',
      content: 'The coding runtime is connected through the server-controlled LiteLLM relay.', payload: { executionRoute: 'codex_litellm', model },
    })
    let messages = modelMessagesFor(context)
    for (let round = 0; round < 6; round += 1) {
      context.signal.throwIfAborted()
      const response = await fetch(`${endpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', stream: true }),
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(15 * 60_000)]),
      })
      if (!response.ok || !response.body) throw new Error(`LiteLLM Codex-compatible route returned HTTP ${response.status}`)
      let assistantText = ''
      const toolCalls = new Map<number, ToolCall>()
      for await (const frame of sseFrames(response.body)) {
        if (!isRecord(frame)) continue
        const choices = Array.isArray(frame.choices) ? frame.choices : []
        const choice = choices[0]
        if (!isRecord(choice) || !isRecord(choice.delta)) continue
        if (typeof choice.delta.content === 'string' && choice.delta.content) {
          assistantText += choice.delta.content
          await context.store.appendEvent(context.task.id, { type: 'assistant_text_delta', lane: 'transcript', content: choice.delta.content, payload: { executionRoute: 'codex_litellm', model } })
        }
        if (Array.isArray(choice.delta.tool_calls)) for (const rawCall of choice.delta.tool_calls) {
          if (!isRecord(rawCall) || typeof rawCall.index !== 'number') continue
          const current = toolCalls.get(rawCall.index) ?? { id: typeof rawCall.id === 'string' ? rawCall.id : `codex_tool_${round}_${rawCall.index}`, name: '', arguments: '' }
          if (isRecord(rawCall.function)) {
            if (typeof rawCall.function.name === 'string') current.name += rawCall.function.name
            if (typeof rawCall.function.arguments === 'string') current.arguments += rawCall.function.arguments
          }
          toolCalls.set(rawCall.index, current)
        }
      }
      if (toolCalls.size === 0) {
        await context.store.appendEvent(context.task.id, { type: 'run_completed', lane: 'control', status: 'completed', label: 'Codex-compatible runtime completed', content: assistantText || 'The routed runtime completed without additional text.', payload: { executionRoute: 'codex_litellm', model } })
        await context.store.updateTask(context.task.id, { status: 'completed' })
        return
      }
      const calls = [...toolCalls.values()]
      messages = [...messages, { role: 'assistant', content: assistantText || null, tool_calls: calls.map((call) => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: call.arguments } })) }]
      for (const call of calls) {
        await context.store.appendEvent(context.task.id, { type: 'tool_call_started', lane: 'activity', label: call.name, content: 'Codex-compatible runtime requested a governed workspace tool.', payload: { executionRoute: 'codex_litellm', toolUseId: call.id, input: parseToolArguments(call.arguments) } })
        let result: string
        try {
          const args = parseToolArguments(call.arguments)
          if (call.name === 'workspace_write') {
            const target = safeWorkspacePath(workspace, args.path)
            if (typeof args.content !== 'string' || args.content.length > 60_000) throw new Error('Workspace content exceeds the 60 KiB bound.')
            await writeFile(target, args.content, 'utf8')
            result = `Wrote ${path.relative(workspace, target)}`
          } else if (call.name === 'workspace_read') {
            const target = safeWorkspacePath(workspace, args.path)
            result = (await readFile(target, 'utf8')).slice(0, 60_000)
          } else result = 'The requested workspace tool is not available.'
        } catch (error) {
          result = error instanceof Error ? error.message : 'Workspace tool failed.'
        }
        await context.store.appendEvent(context.task.id, { type: 'tool_call_completed', lane: 'activity', label: call.name, content: result.slice(0, 2_000), payload: { executionRoute: 'codex_litellm', toolUseId: call.id, isError: result.startsWith('Workspace ') || result.includes('not available') } })
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
    }
    throw new Error('Codex-compatible runtime exceeded the bounded tool-round limit.')
  }
}
