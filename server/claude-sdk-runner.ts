import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { createSdkMcpServer, query, tool, type HookCallback, type PermissionResult, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { EventInput } from './types.js'
import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import type { RuntimeHealth } from './types.js'
import { sanitizeNativePayload } from './native-events.js'
import { validateModeArtifacts } from './artifact-validation.js'
import { materializeTaskSkills } from './skill-packs.js'
import { claudeProviderConfig } from './claude-provider-config.js'
import { writeArtifactManifest, writeDocumentReviewArtifacts, writeStructuredSlides } from './mode-artifacts.js'
import { portableArtifactKind } from './artifact-path.js'
import { resolveClaudeRunLimits } from './claude-run-limits.js'

const ARTIFACT_MANIFEST_PATH = 'artifact-manifest.json'
const RUNTIME_REPORT_PATHS = new Set(['validation-report.json', 'sandbox-build-report.json'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

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

const redactRuntimeText = (value: string) => value.replace(/\/(?:Users|home|private\/tmp|tmp)\/[^\s'"`]+/g, '<workspace-path>')

const safeBashCommand = (command: string) => {
  const trimmed = command.trim()
  if (!trimmed || trimmed.length > 2_000) return false
  // Bash is deliberately bounded to one local, workspace-relative command.
  // The SDK process owns cwd; shell composition and path escapes are denied.
  if (/[\r\n;&|`$<>]/.test(trimmed) || /\.\.(?:[\\/]|$)/.test(trimmed) || /(?:^|\s)(?:~|\/)/.test(trimmed)) return false
  const [program, ...args] = trimmed.split(/\s+/)
  const allowedPrograms = new Set(['cat', 'cut', 'find', 'git', 'grep', 'head', 'ls', 'node', 'npm', 'pwd', 'python', 'python3', 'rg', 'sed', 'sort', 'stat', 'tail', 'tr', 'uniq', 'wc'])
  if (!allowedPrograms.has(program)) return false
  if ((program === 'node' || program === 'python' || program === 'python3') && args.some((arg) => ['-c', '-e'].includes(arg))) return false
  if (args.some((arg) => ['install', 'publish', 'exec', 'config', 'push', 'commit', 'checkout', 'reset', 'clean'].includes(arg))) return false
  return true
}

export const isSafeBashCommand = safeBashCommand

export class ClaudeSdkRuntimeAdapter extends RuntimeAdapterBase {
  readonly name = 'claude_sdk'
  readonly providerId = 'claude_sdk' as const
  readonly capabilities = ['streaming', 'tool_use', 'file_system', 'preview_url'] as const

  async health(): Promise<RuntimeHealth> {
    const provider = claudeProviderConfig()
    if (!provider.configured || provider.transport !== 'litellm') return { status: 'not_configured', detail: 'Configure the server-controlled LiteLLM relay before testing Claude.' }
    const endpoint = process.env.ONEVIBE_LITELLM_URL?.trim().replace(/\/+$/, '')
    const key = process.env.ONEVIBE_LITELLM_API_KEY?.trim()
    if (!endpoint || !key) return { status: 'not_configured', detail: 'Configure the server-controlled LiteLLM relay before testing Claude.' }
    const started = Date.now()
    try {
      const response = await fetch(`${endpoint}/health`, { headers: { Accept: 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000) })
      if (!response.ok) return { status: 'offline', latencyMs: Date.now() - started, detail: 'LiteLLM health probe did not return a successful response.' }
      return { status: 'online', latencyMs: Date.now() - started, detail: 'Claude Agent SDK is routed through the configured LiteLLM relay.' }
    } catch {
      return { status: 'offline', latencyMs: Date.now() - started, detail: 'The configured LiteLLM relay could not be reached.' }
    }
  }

  protected async execute({ task, store, signal, prompt, continuation, requestUserInput }: LegacyRuntimeContext) {
    signal.throwIfAborted()
    const provider = claudeProviderConfig()
    const runLimits = resolveClaudeRunLimits(provider.transport)
    if (!provider.configured) throw new Error('Claude SDK provider is not configured.')
    const workspace = store.workspacePath(task.id)
    const runtimeState = store.runtimeStatePath(task.id)
    await mkdir(workspace, { recursive: true })
    await mkdir(runtimeState, { recursive: true })
    const materializedSkills = await materializeTaskSkills(task, store)
    await store.updateTask(task.id, { status: 'running' })
    await store.appendEvent(task.id, {
      type: 'run_started', lane: 'control', status: 'running', label: 'Claude Agent SDK started',
      content: 'Native SDK messages are preserved and projected into the ONEVibe task timeline.',
      payload: { executionRoute: 'claude_agent_sdk', transport: provider.transport, model: provider.model },
    })
    if (materializedSkills.length) await store.appendEvent(task.id, {
      type: 'activity_delta', lane: 'control', label: 'Claude skill packs materialized',
      content: `${materializedSkills.length} selected versioned skill pack${materializedSkills.length === 1 ? '' : 's'} materialized in this task workspace.`,
      payload: { executionRoute: 'claude_agent_sdk', skills: materializedSkills, path: '.claude/skills', permissionChange: false },
    })
    if (task.mode !== 'chat') {
      await store.setPlanStep(task.id, 'scope', 'completed')
      await store.setPlanStep(task.id, 'workspace', 'running')
    }

    const inputToolName = 'mcp__onevibe__request_user_input'
    const planToolName = 'mcp__onevibe__set_task_plan'
    const slideToolName = 'mcp__onevibe__render_slide_deck'
    const allowedTools = new Set(task.mode === 'chat' ? [inputToolName] : ['Read', 'Write', 'Edit', 'Glob', 'Grep', ...(task.mode === 'slides' ? [] : ['Bash']), inputToolName, planToolName, ...(task.mode === 'slides' ? [slideToolName] : [])])
    const inputTool = tool('request_user_input', 'Pause the task and ask the user a focused question.', {
      prompt: z.string().min(1).max(2_000), options: z.array(z.string().min(1).max(200)).max(8).default([]),
    }, async ({ prompt: question, options }) => {
      const answer = await requestUserInput(question, options, signal)
      return { content: [{ type: 'text', text: answer }] }
    })
    const planTool = tool('set_task_plan', 'Refine the five visible task-plan titles before substantive workspace work. This does not grant execution authority.', {
      steps: z.array(z.object({ id: z.enum(['scope', 'workspace', 'build', 'verify', 'deliver']), title: z.string().min(4).max(140) })).length(5),
    }, async ({ steps }) => {
      await store.updateRuntimePlanTitles(task.id, steps, 'claude_sdk')
      return { content: [{ type: 'text', text: 'Task plan titles recorded in the governed evidence stream.' }] }
    })
    const slideTool = tool('render_slide_deck', 'Render exactly eight structured slides into a portable ONEComputer-styled PPTX, PDF, HTML preview, outline, and speaker notes.', {
      slides: z.array(z.object({
        title: z.string().trim().min(3).max(100),
        summary: z.string().trim().min(20).max(300),
      })).length(8),
    }, async ({ slides }) => {
      const files = await writeStructuredSlides(task, store, slides)
      return { content: [{ type: 'text', text: `Rendered and validated ${slides.length} slides into: ${files.join(', ')}` }] }
    })
    const onevibeServer = createSdkMcpServer({
      name: 'onevibe', version: '0.1.0', alwaysLoad: true,
      instructions: 'Use request_user_input only when the task cannot safely continue without a human choice or missing value.',
      tools: task.mode === 'chat' ? [inputTool] : task.mode === 'slides' ? [inputTool, planTool, slideTool] : [inputTool, planTool],
    })
    const configuredMcpServers = Object.fromEntries(this.mcpConfigs
      .filter((config) => config.name !== 'onevibe')
      .map((config) => [config.name, { command: config.command, args: config.args, env: config.env }]))
    const canUseTool = async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
      if (!allowedTools.has(toolName)) {
        return { behavior: 'deny', message: `${toolName} is not available in the host-process SDK adapter. Use the ONEComputer sandbox MCP adapter.`, interrupt: false }
      }
      if (toolName === 'Bash') {
        const command = typeof input.command === 'string' ? input.command : ''
        if (!safeBashCommand(command)) {
          return { behavior: 'deny', message: 'Only one bounded, workspace-relative local command is allowed; shell composition, network tools, credentials, and path escapes are denied.', interrupt: false }
        }
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
    const preToolUse: HookCallback = async (input) => {
      if (input.hook_event_name !== 'PreToolUse') return { continue: true }
      const message = 'ONEVibe policy denied this tool call.'
      if (!allowedTools.has(input.tool_name) && !input.tool_name.startsWith('mcp__onevibe__')) {
        return { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${message} ${input.tool_name} is not enabled for this task mode.` } }
      }
      const toolInput = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input as Record<string, unknown> : {}
      if (input.tool_name === 'Bash' && !safeBashCommand(typeof toolInput.command === 'string' ? toolInput.command : '')) {
        return { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${message} Bash is limited to one workspace-relative local command without shell composition, network access, credentials, or path escapes.` } }
      }
      const candidate = [toolInput.file_path, toolInput.path].find((value): value is string => typeof value === 'string')
      if (candidate) {
        const resolved = path.resolve(workspace, candidate)
        const relative = path.relative(workspace, resolved)
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          return { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `${message} File access is outside the task workspace.` } }
        }
      }
      return { continue: true, hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'ONEVibe task-workspace policy passed.' } }
    }

    const abortController = new AbortController()
    const abort = () => abortController.abort()
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abortController.abort()
    let persistedSessionId = task.securityContext?.runtimeSessionId
    let terminal: { success: boolean; content?: string } | undefined
    let terminalNativeEventId: string | undefined
    let nativeSequence = 0
    let buildStarted = false
    let validationPassed = true
    const beginBuild = async () => {
      if (task.mode === 'chat') return
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
        model: provider.model,
        systemPrompt: task.mode === 'chat' ? [
          'You are ONEVibe, a helpful enterprise assistant operating in a governed conversation.',
          'Answer the user naturally and directly. This is a conversational turn, not an artifact task.',
          'Do not create, read, edit, or inspect files. Do not call workspace tools, set a task plan, render artifacts, or request publication approval.',
          'Do not reveal hidden chain-of-thought. If useful, provide a concise explanation or high-level reasoning summary in the answer.',
          'Never request, expose, or persist credentials.',
        ].join(' ') : [
          'You are ONEVibe, an enterprise agent operating inside a governed task workspace.',
          `The SDK working directory is the only writable and readable task workspace: ${workspace}. Use workspace-relative paths for Read, Write, Edit, Glob, Grep, and Bash; never use absolute paths or parent-directory paths.`,
          'Work only inside the task workspace. Never request, expose, or persist credentials.',
          'Before substantive workspace tools, call set_task_plan with exactly the canonical ordered stages scope, workspace, build, verify, deliver and concise task-specific titles. Do not reorder or omit stages.',
          'Create portable source files and a README. For a website, create index.html with no external dependencies.',
          ...(task.mode === 'slides' ? [] : ['Use Bash only for bounded local commands inside the task workspace when code execution or inspection is required. Never use network commands, credentials, shell composition, or paths outside the workspace.']),
          ...(task.mode === 'document' ? ['For document mode, the required deliverables are document.md with Executive Summary and Provenance sections, document.json containing valid metadata JSON, and index.html as a dependency-free review page. Write these files yourself before the verify stage; do not rely on the host to synthesize them.'] : []),
          ...(task.mode === 'research' ? ['For research mode, create report.md, sources.json, and a dependency-free index.html. Treat references as declared user context unless the runtime explicitly records verified retrieval.'] : []),
          ...(task.mode === 'data' ? ['For data mode, create data.csv, analysis.json, and a dependency-free index.html. Keep assumptions and sample-data limitations explicit.'] : []),
          `The selected creation mode is ${task.mode}. Follow its artifact conventions and produce mode-appropriate source, rationale, and validation notes.`,
          ...(task.mode === 'slides' ? ['For this slide task, after set_task_plan call render_slide_deck immediately as the next substantive action with exactly eight substantive slides. Put all slide title/summary content in that single structured call; do not use Read, Grep, Write, Edit, or self-audit tools to draft or inspect slide content before rendering, and do not construct PPTX or PDF bytes with file tools.'] : []),
          'Do not publish, access external services, or claim security certification. Public release requires a separate VTI Wallet.',
        ].join(' '),
        tools: [...allowedTools],
        mcpServers: { onevibe: onevibeServer, ...configuredMcpServers },
        canUseTool,
        hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
        permissionMode: 'default',
        includePartialMessages: true,
        includeHookEvents: true,
        forwardSubagentText: true,
        promptSuggestions: true,
        agentProgressSummaries: true,
        enableFileCheckpointing: true,
        settingSources: ['project'],
        skills: task.skills,
        maxTurns: runLimits.maxTurns,
        maxBudgetUsd: runLimits.maxBudgetUsd,
        persistSession: true,
        ...(continuation && task.securityContext?.runtimeSessionId ? { resume: task.securityContext.runtimeSessionId } : {}),
        env: {
          ...provider.childEnv,
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
      const nativeMessage = sanitizeNativePayload(message) as Record<string, unknown>
      const delta = textDelta(message)
      const projections: EventInput[] = []
      if (delta) projections.push({
        type: 'assistant_text_delta', lane: 'transcript', content: delta,
        payload: { executionRoute: 'claude_agent_sdk' },
      })
      for (const block of getContent(message)) {
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          await beginBuild()
          projections.push({
            type: 'tool_call_started', lane: 'activity', label: block.name,
            content: 'Claude requested a governed workspace tool.',
            payload: { executionRoute: 'claude_agent_sdk', toolUseId: block.id, input: sanitizeNativePayload(block.input) },
          })
        }
        if (block.type === 'tool_result') {
          projections.push({
            type: 'tool_call_completed', lane: 'activity', label: 'Tool result',
            content: typeof block.content === 'string' ? redactRuntimeText(block.content.slice(0, 2_000)) : undefined,
            payload: { executionRoute: 'claude_agent_sdk', toolUseId: block.tool_use_id, isError: block.is_error },
          })
        }
      }

      if (message.type === 'result') {
        const content = 'result' in message && typeof message.result === 'string' ? message.result : undefined
        const success = message.subtype === 'success' && !message.is_error && content !== undefined
        terminal = {
          success,
          content,
        }
      } else if (!projections.length) {
        projections.push({
          type: 'activity_delta', lane: 'activity', label: titleFor(message),
          content: message.type === 'system' && 'content' in message && typeof message.content === 'string' ? message.content : undefined,
          payload: { executionRoute: 'claude_agent_sdk' },
        })
      }
      const messageRecord = message as unknown as Record<string, unknown>
      const sourceSequence = nativeSequence++
      const sourceEventId = typeof messageRecord.uuid === 'string' ? messageRecord.uuid : `${message.type}:${sourceSequence}`
      const ingested = await store.ingestNativeEvent(task.id, {
        source: 'claude_agent_sdk', sourceEventId, sourceSequence, nativeType: message.type,
        payload: nativeMessage, projections,
      })
      if (message.type === 'result') terminalNativeEventId = ingested.nativeEventId
    }

    signal.removeEventListener('abort', abort)
    signal.throwIfAborted()
    const providerSuccess = terminal?.success === true
    if (task.mode === 'chat') {
      const success = providerSuccess
      await store.appendEvent(task.id, {
        type: success ? 'run_completed' : 'run_failed', lane: 'control', status: success ? 'completed' : 'failed',
        label: success ? 'Claude Agent SDK completed' : 'Claude Agent SDK failed',
        content: terminal?.content ?? 'The SDK stream ended without an explicit result message.',
        payload: {
          executionRoute: 'claude_agent_sdk', nativeType: 'result', nativeEventId: terminalNativeEventId,
          ...(success ? {} : { failureReason: terminal ? 'provider_result_failure' : 'missing_terminal_result' }),
        },
      })
      await store.updateTask(task.id, { status: success ? 'completed' : 'failed' })
      return
    }
    if (providerSuccess && task.mode === 'document') await writeDocumentReviewArtifacts(task, store)
    const files = await store.listWorkspaceFiles(task.id)
    const portableFiles = files.filter((file) => file.path !== ARTIFACT_MANIFEST_PATH && !RUNTIME_REPORT_PATHS.has(file.path) && portableArtifactKind(file.path))
    const deliverableFiles = portableFiles.slice(0, 50)
    await store.appendEvent(task.id, {
      type: 'tool_call_completed', lane: 'activity', label: 'Claude SDK workspace recorded',
      content: `${deliverableFiles.length} portable file${deliverableFiles.length === 1 ? '' : 's'} recorded from the governed SDK workspace.`,
      payload: { executionRoute: 'claude_agent_sdk', fileCount: deliverableFiles.length, truncated: portableFiles.length - deliverableFiles.length > 0 },
    })
    for (const file of deliverableFiles) {
      if (file.path === 'index.html') continue
      const kind = portableArtifactKind(file.path)!
      await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: 'Claude SDK artifact', content: file.path,
        payload: { executionRoute: 'claude_agent_sdk', kind, size: file.size, portable: true, uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(file.path)}&download=1` },
      })
    }
    if (providerSuccess) {
      await writeArtifactManifest(task, store, portableFiles.map((file) => file.path))
      const manifestEvents = store.listEvents(task.id).filter((event) => (
        event.type === 'artifact_created' && event.content === ARTIFACT_MANIFEST_PATH &&
        event.payload.executionRoute === 'claude_agent_sdk' && event.payload.kind === 'artifact_manifest'
      ))
      if (manifestEvents.length === 0) {
        const manifest = await store.listWorkspaceFiles(task.id).then((workspaceFiles) => workspaceFiles.find((file) => file.path === ARTIFACT_MANIFEST_PATH))
        if (manifest) await store.appendEvent(task.id, {
          type: 'artifact_created', lane: 'artifact', label: 'Claude SDK artifact manifest', content: ARTIFACT_MANIFEST_PATH,
          payload: {
            executionRoute: 'claude_agent_sdk', kind: 'artifact_manifest', size: manifest.size, portable: true,
            uri: `/api/tasks/${task.id}/file?path=${encodeURIComponent(ARTIFACT_MANIFEST_PATH)}&download=1`,
          },
        })
      }
    }
    const hasPreview = files.some((file) => file.path === 'index.html')
    if (hasPreview) {
      await store.updateTask(task.id, { previewPath: `/api/tasks/${task.id}/preview` })
      await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: 'Claude-generated preview', content: 'index.html',
        payload: { executionRoute: 'claude_agent_sdk', kind: 'website', uri: `/api/tasks/${task.id}/preview`, version: 1 },
      })
    }
    if (providerSuccess) {
      await beginBuild()
      await store.setPlanStep(task.id, 'build', 'completed')
      await store.setPlanStep(task.id, 'verify', 'running')
      const validation = await validateModeArtifacts(store.getTask(task.id), store)
      validationPassed = validation.passed
      await store.appendEvent(task.id, {
        type: 'artifact_created', lane: 'artifact', label: validation.passed ? 'Static artifact contract passed' : 'Static artifact contract needs review',
        content: 'validation-report.json',
        payload: { executionRoute: 'claude_agent_sdk', kind: 'validation_report', passed: validation.passed, checkCount: validation.checks.length },
      })
      if (validation.passed) {
        await store.setPlanStep(task.id, 'verify', 'completed')
        await store.setPlanStep(task.id, 'deliver', 'running')
        await store.setPlanStep(task.id, 'deliver', 'completed')
      } else {
        await store.setPlanStep(task.id, 'verify', 'blocked')
      }
    }
    const success = providerSuccess && validationPassed
    const failureReason = !terminal ? 'missing_terminal_result' : !providerSuccess ? 'provider_result_failure' : !validationPassed ? 'artifact_validation_failed' : undefined
    await store.appendEvent(task.id, {
      type: success ? 'run_completed' : 'run_failed', lane: 'control', status: success ? 'completed' : 'failed',
      label: terminal ? (success ? 'Claude Agent SDK completed' : failureReason === 'artifact_validation_failed' ? 'Claude Agent SDK artifact validation failed' : 'Claude Agent SDK failed') : 'Claude Agent SDK stream closed before terminal result',
      content: terminal?.content ?? (terminal ? failureReason === 'artifact_validation_failed' ? 'Required static artifact checks did not pass; inspect validation-report.json before retrying.' : undefined : 'The SDK stream ended without an explicit result message.'),
      payload: terminal
        ? { executionRoute: 'claude_agent_sdk', nativeType: 'result', nativeEventId: terminalNativeEventId, ...(failureReason ? { failureReason } : {}) }
        : { executionRoute: 'claude_agent_sdk', failureReason },
    })
    await store.updateTask(task.id, { status: success ? 'completed' : 'failed' })
  }
}
