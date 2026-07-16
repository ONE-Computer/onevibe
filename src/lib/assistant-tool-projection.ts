import type { ChatMessage, RuntimeEvent } from '../types'

export type AssistantToolPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: { executionRoute: string; inputKeys: string[]; browserTool: boolean }
  argsText: string
  result?: { summary: string; completedAt: string }
  isError?: boolean
  timing: { startedAt: number; completedAt?: number }
}

export type AssistantInputFile = { name: string; path: string; size: number; mimeType: string }
export type AssistantArtifact = { eventId: string; path: string; label: string; kind: string; size?: number; uri: string; action: 'preview' | 'download'; createdAt: string }
export type AssistantTraceItem = { id: string; label: string; detail?: string; status: 'running' | 'completed' | 'failed'; createdAt: string; kind: 'activity' | 'tool' | 'artifact' | 'control' }
export type AssistantConversationMessage = ChatMessage & { toolParts?: AssistantToolPart[]; inputFiles?: AssistantInputFile[]; artifacts?: AssistantArtifact[]; trace?: AssistantTraceItem[] }

const stringValue = (value: unknown) => typeof value === 'string' ? value : undefined
const recordValue = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const safeArtifactPath = (value: unknown) => {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.split('/').some((part) => part === '..')) return undefined
  if (value.startsWith('.') || value.startsWith('inputs/') || value.startsWith('evidence/')) return undefined
  return value
}
const safeArtifactUri = (taskId: string, path: string, supplied: unknown) => {
  const expectedPrefix = `/api/tasks/${encodeURIComponent(taskId)}/`
  if (typeof supplied === 'string' && supplied.startsWith(expectedPrefix) && !supplied.includes('://')) return supplied
  return `/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(path)}&download=1`
}

const lowSignalProviderLabel = (label?: string) => Boolean(label && /^Claude SDK · (init|status|stream event|assistant|prompt suggestion)$/i.test(label))
const safeTraceDetail = (value?: string) => value?.replace(/\/(?:Users|home|private\/tmp|tmp)\/[^\s'"`]+/g, '<workspace-path>')

export const projectAssistantToolCalls = (messages: ChatMessage[], events: RuntimeEvent[]): AssistantConversationMessage[] => {
  const toolsByTurn = new Map<string, AssistantToolPart[]>()
  const filesByTurn = new Map<string, AssistantInputFile[]>()
  const artifactsByTurn = new Map<string, Map<string, AssistantArtifact>>()
  const tracesByTurn = new Map<string, AssistantTraceItem[]>()
  const byInvocation = new Map<string, AssistantToolPart>()
  const traceByInvocation = new Map<string, AssistantTraceItem>()
  const traceByKey = new Map<string, AssistantTraceItem>()
  for (const event of events) {
    if (event.runId) {
      const traces = tracesByTurn.get(event.runId) ?? []
      const toolUseId = stringValue(event.payload.toolUseId)
      if (event.type === 'tool_call_started' && toolUseId) {
        const trace: AssistantTraceItem = { id: `${event.id}:trace`, label: event.label ?? 'Tool call', detail: safeTraceDetail(event.content), status: 'running', createdAt: event.createdAt, kind: 'tool' }
        traces.push(trace)
        traceByInvocation.set(`${event.runId}:${toolUseId}`, trace)
      } else if (event.type === 'tool_call_completed' && toolUseId) {
        const trace = traceByInvocation.get(`${event.runId}:${toolUseId}`)
        if (trace) {
          trace.status = event.payload.isError === true ? 'failed' : 'completed'
          trace.detail = safeTraceDetail(event.content) ?? trace.detail
        } else {
          traces.push({ id: `${event.id}:trace`, label: event.label ?? 'Tool result', detail: safeTraceDetail(event.content), status: event.payload.isError === true ? 'failed' : 'completed', createdAt: event.createdAt, kind: 'tool' })
        }
      } else if (event.type === 'run_started' || event.type === 'run_completed' || event.type === 'run_failed' || event.type === 'run_cancelled') {
        const key = `${event.runId}:run`
        const existing = traceByKey.get(key)
        if (existing) {
          existing.label = event.label ?? existing.label
          existing.detail = safeTraceDetail(event.content) ?? existing.detail
          existing.status = event.type === 'run_failed' ? 'failed' : 'completed'
          existing.createdAt = event.createdAt
        } else {
          const trace: AssistantTraceItem = { id: `${event.id}:trace`, label: event.label ?? event.type.replaceAll('_', ' '), detail: safeTraceDetail(event.content), status: event.type === 'run_started' ? 'running' : event.type === 'run_failed' ? 'failed' : 'completed', createdAt: event.createdAt, kind: 'control' }
          traces.push(trace)
          traceByKey.set(key, trace)
        }
      } else if (event.type === 'activity_delta' && !lowSignalProviderLabel(event.label)) {
        const stepId = stringValue(event.payload.stepId)
        const key = stepId ? `${event.runId}:plan:${stepId}` : `${event.id}:activity`
        const existing = traceByKey.get(key)
        if (existing) {
          existing.label = event.label ?? existing.label
          existing.detail = safeTraceDetail(event.content) ?? existing.detail
          existing.status = event.payload.status === 'running' ? 'running' : event.payload.isError === true ? 'failed' : 'completed'
          existing.createdAt = event.createdAt
        } else {
          const trace: AssistantTraceItem = { id: `${event.id}:trace`, label: event.label ?? event.type.replaceAll('_', ' '), detail: safeTraceDetail(event.content), status: event.payload.status === 'running' ? 'running' : event.payload.isError === true ? 'failed' : 'completed', createdAt: event.createdAt, kind: 'activity' }
          traces.push(trace)
          traceByKey.set(key, trace)
        }
      } else if (event.type === 'artifact_created' || event.type === 'artifact_updated') {
        const artifactPath = safeArtifactPath(recordValue(event.payload.presentation)?.artifactPath ?? event.content)
        if (artifactPath && event.payload.kind !== 'visual_frame' && event.payload.kind !== 'task_input') traces.push({ id: `${event.id}:trace`, label: event.label ?? 'Artifact recorded', detail: artifactPath, status: 'completed', createdAt: event.createdAt, kind: 'artifact' })
      }
      if (traces.length) tracesByTurn.set(event.runId, traces)
    }
    if (event.runId && event.type === 'artifact_created' && event.payload.kind === 'task_input' && Array.isArray(event.payload.files)) {
      const files = event.payload.files.flatMap((value) => {
        const file = recordValue(value)
        return file && typeof file.name === 'string' && typeof file.path === 'string' && typeof file.size === 'number' && typeof file.mimeType === 'string' ? [{ name: file.name, path: file.path, size: file.size, mimeType: file.mimeType }] : []
      })
      if (files.length) filesByTurn.set(event.runId, files)
    }
    if (event.runId && (event.type === 'artifact_created' || event.type === 'artifact_updated') && event.payload.kind !== 'task_input' && event.payload.kind !== 'visual_frame' && event.payload.kind !== 'project_knowledge') {
      const presentation = recordValue(event.payload.presentation)
      const artifactPath = safeArtifactPath(presentation?.artifactPath ?? event.content)
      if (artifactPath) {
        const uri = safeArtifactUri(event.taskId, artifactPath, event.payload.uri ?? presentation?.uri)
        const action = uri.includes('/preview') ? 'preview' as const : 'download' as const
        const list = artifactsByTurn.get(event.runId) ?? new Map<string, AssistantArtifact>()
        list.set(artifactPath, {
          eventId: event.id, path: artifactPath, label: event.label ?? artifactPath.split('/').at(-1) ?? 'Artifact',
          kind: stringValue(event.payload.kind) ?? 'source_file', size: typeof event.payload.size === 'number' ? event.payload.size : undefined,
          uri, action, createdAt: event.createdAt,
        })
        artifactsByTurn.set(event.runId, list)
      }
    }
    if (!event.runId || (event.type !== 'tool_call_started' && event.type !== 'tool_call_completed')) continue
    const toolCallId = stringValue(event.payload.toolUseId)
    if (!toolCallId) continue
    const key = `${event.runId}:${toolCallId}`
    if (event.type === 'tool_call_started') {
      const input = recordValue(event.payload.input)
      const args = { executionRoute: stringValue(event.payload.executionRoute) ?? 'governed_runtime', inputKeys: Object.keys(input ?? {}).sort().slice(0, 12), browserTool: event.payload.browserTool === true }
      const part: AssistantToolPart = { type: 'tool-call', toolCallId, toolName: event.label ?? 'Workspace tool', args, argsText: JSON.stringify(args), timing: { startedAt: Date.parse(event.createdAt) } }
      byInvocation.set(key, part)
      const list = toolsByTurn.get(event.runId) ?? []
      list.push(part)
      toolsByTurn.set(event.runId, list)
      continue
    }
    const part = byInvocation.get(key)
    if (!part) continue
    part.result = { summary: safeTraceDetail(event.content)?.replace(/\s+/g, ' ').trim().slice(0, 240) || (event.payload.isError === true ? 'Tool execution failed.' : 'Tool execution completed.'), completedAt: event.createdAt }
    part.isError = event.payload.isError === true
    part.timing = { ...part.timing, completedAt: Date.parse(event.createdAt) }
  }
  return messages.map((message) => message.role === 'assistant' ? { ...message, toolParts: toolsByTurn.get(message.turnId) ?? [], artifacts: [...(artifactsByTurn.get(message.turnId)?.values() ?? [])], trace: tracesByTurn.get(message.turnId) ?? [] } : message.role === 'user' ? { ...message, inputFiles: filesByTurn.get(message.turnId) ?? [] } : message)
}
