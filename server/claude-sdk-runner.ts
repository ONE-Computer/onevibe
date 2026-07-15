import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createSdkMcpServer, query, tool, type PermissionResult, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { RuntimeAdapter, RuntimeContext } from './runtime-adapter.js'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > 7) return '[Max depth]'
  if (typeof value === 'string') return value.length > 64_000 ? `${value.slice(0, 64_000)}…[truncated]` : value
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => sanitize(item, depth + 1))
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (/authorization|cookie|token|secret|api[_-]?key|password/i.test(key)) result[key] = '[REDACTED]'
    else result[key] = sanitize(item, depth + 1)
  }
  return result
}

const getContent = (message: SDKMessage) => {
  if (!('message' in message) || !isRecord(message.message)) return []
  return Array.isArray(message.message.content) ? message.message.content.filter(isRecord) : []
}

const textDelta = (message: SDKMessage) => {
  if (message.type !== 'stream_event' || !isRecord(message.event)) return null
  if (message.event.type !== 'content_block_delta' || !isRecord(message.event.delta)) return null
  return message.event.delta.type === 'text_delta' && typeof message.event.delta.text === 'string'
    ? message.event.delta.text
    : null
}

const titleFor = (message: SDKMessage) => {
  if (message.type === 'system' && 'subtype' in message) return `Claude SDK · ${String(message.subtype).replaceAll('_', ' ')}`
  return `Claude SDK · ${message.type.replaceAll('_', ' ')}`
}

export class ClaudeSdkRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'claude_sdk'

  async run({ task, store, signal, prompt, continuation, requestUserInput }: RuntimeContext) {
    signal.throwIfAborted()
    const workspace = store.workspacePath(task.id)
    const runtimeState = store.runtimeStatePath(task.id)
    await mkdir(workspace, { recursive: true })
    await mkdir(runtimeState, { recursive: true })
    await store.updateTask(task.id, { status: 'running' })
    await store.appendEvent(task.id, {
      type: 'run_started', lane: 'control', status: 'running', label: 'Claude Agent SDK started',
      content: 'Native SDK messages are preserved and projected into the ONEVibe task timeline.',
      payload: { executionRoute: 'claude_agent_sdk', model: process.env.ONEVIBE_CLAUDE_MODEL ?? 'claude-sonnet-5' },
    })
    await store.setPlanStep(task.id, 'scope', 'completed')
    await store.setPlanStep(task.id, 'workspace', 'running')

    const inputToolName = 'mcp__onevibe__request_user_input'
    const allowedTools = new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep', inputToolName])
    const onevibeServer = createSdkMcpServer({
      name: 'onevibe', version: '0.1.0', alwaysLoad: true,
      instructions: 'Use request_user_input only when the task cannot safely continue without a human choice or missing value.',
      tools: [tool('request_user_input', 'Pause the task and ask the user a focused question.', {
        prompt: z.string().min(1).max(2_000), options: z.array(z.string().min(1).max(200)).max(8).default([]),
      }, async ({ prompt: question, options }) => {
        const answer = await requestUserInput(question, options, signal)
        return { content: [{ type: 'text', text: answer }] }
      })],
    })
    const canUseTool = async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
      if (!allowedTools.has(toolName)) {
        return { behavior: 'deny', message: `${toolName} is not available in the host-process SDK adapter. Use the ONEComputer sandbox MCP adapter.`, interrupt: false }
      }
      const candidate = [input.file_path, input.path].find((value): value is string => typeof value === 'string')
      if (candidate) {
        const resolved = path.resolve(workspace, candidate)
        const relative = path.relative(workspace, resolved)
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          return { behavior: 'deny', message: 'File access is outside the task workspace.', interrupt: true }
        }
      }
      return { behavior: 'allow', updatedInput: input }
    }

    const abortController = new AbortController()
    const abort = () => abortController.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abortController.abort()
    let persistedSessionId = task.securityContext?.runtimeSessionId
    let terminal: { success: boolean; content?: string; nativeMessage: Record<string, unknown> } | undefined
    let buildStarted = false
    const beginBuild = async () => {
      if (buildStarted) return
      buildStarted = true
      await store.setPlanStep(task.id, 'workspace', 'completed')
      await store.setPlanStep(task.id, 'build', 'running')
    }
    for await (const message of query({
      prompt,
      options: {
        abortController,
        cwd: workspace,
        model: process.env.ONEVIBE_CLAUDE_MODEL ?? 'claude-sonnet-5',
        systemPrompt: [
          'You are ONEVibe, an enterprise agent operating inside a governed task workspace.',
          'Work only inside the current directory. Never request, expose, or persist credentials.',
          'Create portable source files and a README. For a website, create index.html with no external dependencies.',
          `The selected creation mode is ${task.mode}. Follow its artifact conventions and produce mode-appropriate source, rationale, and validation notes.`,
          'Do not publish, access external services, or claim security certification. Public release requires a separate VTI Wallet.',
        ].join(' '),
        tools: [...allowedTools],
        allowedTools: [...allowedTools],
        mcpServers: { onevibe: onevibeServer },
        canUseTool,
        permissionMode: 'default',
        includePartialMessages: true,
        includeHookEvents: true,
        forwardSubagentText: true,
        promptSuggestions: true,
        agentProgressSummaries: true,
        enableFileCheckpointing: true,
        settingSources: [],
        maxTurns: Number(process.env.ONEVIBE_CLAUDE_MAX_TURNS ?? 24),
        maxBudgetUsd: Number(process.env.ONEVIBE_CLAUDE_MAX_BUDGET_USD ?? 5),
        persistSession: true,
        ...(continuation && task.securityContext?.runtimeSessionId ? { resume: task.securityContext.runtimeSessionId } : {}),
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: runtimeState,
          CLAUDE_AGENT_SDK_CLIENT_APP: 'onevibe/0.1.0',
        },
      },
    })) {
      const sessionId = 'session_id' in message && typeof message.session_id === 'string' ? message.session_id : undefined
      if (sessionId && sessionId !== persistedSessionId) {
        const current = store.getTask(task.id)
        await store.updateTask(task.id, {
          securityContext: {
            ...(current.securityContext ?? { mode: 'local_demo', gatewayEnforced: false }),
            runtimeSessionId: sessionId,
          },
        })
        persistedSessionId = sessionId
      }
      const nativeMessage = sanitize(message) as Record<string, unknown>
      const delta = textDelta(message)
      if (delta) {
        await store.appendEvent(task.id, {
          type: 'assistant_text_delta', lane: 'transcript', content: delta,
          payload: { executionRoute: 'claude_agent_sdk', nativeType: message.type, nativeMessage },
        })
        continue
      }

      for (const block of getContent(message)) {
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          await beginBuild()
          await store.appendEvent(task.id, {
            type: 'tool_call_started', lane: 'activity', label: block.name,
            content: 'Claude requested a governed workspace tool.',
            payload: { executionRoute: 'claude_agent_sdk', toolUseId: block.id, input: sanitize(block.input), nativeMessage },
          })
        }
        if (block.type === 'tool_result') {
          await store.appendEvent(task.id, {
            type: 'tool_call_completed', lane: 'activity', label: 'Tool result',
            content: typeof block.content === 'string' ? block.content.slice(0, 2_000) : undefined,
            payload: { executionRoute: 'claude_agent_sdk', toolUseId: block.tool_use_id, isError: block.is_error, nativeMessage },
          })
        }
      }

      if (message.type === 'result') {
        const success = message.subtype === 'success' && !message.is_error
        terminal = {
          success,
          content: 'result' in message && typeof message.result === 'string' ? message.result : undefined,
          nativeMessage,
        }
      } else {
        await store.appendEvent(task.id, {
          type: 'activity_delta', lane: 'activity', label: titleFor(message),
          content: message.type === 'system' && 'content' in message && typeof message.content === 'string' ? message.content : undefined,
          payload: { executionRoute: 'claude_agent_sdk', nativeType: message.type, nativeMessage },
        })
      }
    }

    signal.removeEventListener('abort', abort)
    signal.throwIfAborted()
    const files = await store.listWorkspaceFiles(task.id)
    const hasPreview = files.some((file) => file.path === 'index.html')
    if (hasPreview) {
      await store.updateTask(task.id, { previewPath: `/api/tasks/${task.id}/preview` })
      await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: 'Claude-generated preview', content: 'index.html',
        payload: { executionRoute: 'claude_agent_sdk', kind: 'website', uri: `/api/tasks/${task.id}/preview`, version: 1 },
      })
    }
    const success = terminal?.success ?? true
    if (success) {
      await beginBuild()
      await store.setPlanStep(task.id, 'build', 'completed')
      await store.setPlanStep(task.id, 'verify', 'running')
      await store.setPlanStep(task.id, 'verify', 'completed')
      await store.setPlanStep(task.id, 'deliver', 'running')
      await store.setPlanStep(task.id, 'deliver', 'completed')
    }
    await store.appendEvent(task.id, {
      type: success ? 'run_completed' : 'run_failed', lane: 'control', status: success ? 'completed' : 'failed',
      label: terminal ? (success ? 'Claude Agent SDK completed' : 'Claude Agent SDK failed') : 'Claude Agent SDK stream closed',
      content: terminal?.content ?? (terminal ? undefined : 'The SDK stream ended without an explicit result message.'),
      payload: terminal
        ? { executionRoute: 'claude_agent_sdk', nativeType: 'result', nativeMessage: terminal.nativeMessage }
        : { executionRoute: 'claude_agent_sdk' },
    })
    await store.updateTask(task.id, { status: success ? 'completed' : 'failed' })
  }
}
