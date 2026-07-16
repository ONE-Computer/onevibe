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
export type AssistantConversationMessage = ChatMessage & { toolParts?: AssistantToolPart[]; inputFiles?: AssistantInputFile[] }

const stringValue = (value: unknown) => typeof value === 'string' ? value : undefined
const recordValue = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

export const projectAssistantToolCalls = (messages: ChatMessage[], events: RuntimeEvent[]): AssistantConversationMessage[] => {
  const toolsByTurn = new Map<string, AssistantToolPart[]>()
  const filesByTurn = new Map<string, AssistantInputFile[]>()
  const byInvocation = new Map<string, AssistantToolPart>()
  for (const event of events) {
    if (event.runId && event.type === 'artifact_created' && event.payload.kind === 'task_input' && Array.isArray(event.payload.files)) {
      const files = event.payload.files.flatMap((value) => {
        const file = recordValue(value)
        return file && typeof file.name === 'string' && typeof file.path === 'string' && typeof file.size === 'number' && typeof file.mimeType === 'string' ? [{ name: file.name, path: file.path, size: file.size, mimeType: file.mimeType }] : []
      })
      if (files.length) filesByTurn.set(event.runId, files)
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
  return messages.map((message) => message.role === 'assistant' ? { ...message, toolParts: toolsByTurn.get(message.turnId) ?? [] } : message.role === 'user' ? { ...message, inputFiles: filesByTurn.get(message.turnId) ?? [] } : message)
}
