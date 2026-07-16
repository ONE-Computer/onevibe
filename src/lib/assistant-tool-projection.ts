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
export type AssistantConversationMessage = ChatMessage & { toolParts?: AssistantToolPart[]; inputFiles?: AssistantInputFile[]; artifacts?: AssistantArtifact[] }

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

export const projectAssistantToolCalls = (messages: ChatMessage[], events: RuntimeEvent[]): AssistantConversationMessage[] => {
  const toolsByTurn = new Map<string, AssistantToolPart[]>()
  const filesByTurn = new Map<string, AssistantInputFile[]>()
  const artifactsByTurn = new Map<string, Map<string, AssistantArtifact>>()
  const byInvocation = new Map<string, AssistantToolPart>()
  for (const event of events) {
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
    part.result = { summary: event.content?.replace(/\s+/g, ' ').trim().slice(0, 240) || (event.payload.isError === true ? 'Tool execution failed.' : 'Tool execution completed.'), completedAt: event.createdAt }
    part.isError = event.payload.isError === true
    part.timing = { ...part.timing, completedAt: Date.parse(event.createdAt) }
  }
  return messages.map((message) => message.role === 'assistant' ? { ...message, toolParts: toolsByTurn.get(message.turnId) ?? [], artifacts: [...(artifactsByTurn.get(message.turnId)?.values() ?? [])] } : message.role === 'user' ? { ...message, inputFiles: filesByTurn.get(message.turnId) ?? [] } : message)
}
