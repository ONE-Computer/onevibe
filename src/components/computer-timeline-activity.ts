import type { PresentationDescriptor, PresentationPanel, RuntimeEvent, TaskSnapshot } from '../types'

export type ComputerItem = {
  id: string
  kind: PresentationPanel
  title: string
  detail?: string
  runId?: string
  createdAt: string
  uri?: string
  payload?: Record<string, unknown>
  live?: boolean
}

export const formatInspectable = (value: unknown, limit = 12_000) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > limit ? `${text.slice(0, limit)}\n…[truncated for the activity rail]` : text
}

export const presentationItems = (task: TaskSnapshot): ComputerItem[] => {
  const items = task.events.flatMap((event): ComputerItem[] => {
    const presentation = event.payload.presentation as PresentationDescriptor | undefined
    if (presentation && ['terminal', 'screenshot', 'preview', 'file', 'diff', 'slide', 'approval'].includes(presentation.panel)) return [{ id: event.id, kind: presentation.panel, title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId: event.runId, uri: presentation.uri, payload: event.payload }]
    // Compatibility for evidence created before the typed presentation contract.
    if (event.type.startsWith('tool_call')) return [{ id: event.id, kind: 'terminal', title: event.label ?? 'Tool call', detail: event.content, createdAt: event.createdAt, runId: event.runId, payload: event.payload }]
    if (event.type === 'artifact_created' || event.type === 'artifact_updated') return [{ id: event.id, kind: event.type === 'artifact_updated' ? 'diff' : 'file', title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId: event.runId, payload: event.payload }]
    return []
  })
  if (task.securityContext?.visualRuntimeReady && task.securityContext.sandboxState !== 'destroyed') items.push({
    id: 'live-x11', kind: 'screenshot', title: 'Live X11 display', detail: 'Authenticated PNG capture · no VNC',
    createdAt: task.updatedAt, uri: `/api/tasks/${task.id}/visual/screenshot`, live: true,
  })
  return items
}

export const terminalActivityFor = (item: ComputerItem, events: RuntimeEvent[]) => {
  const toolUseId = typeof item.payload?.toolUseId === 'string' ? item.payload.toolUseId : undefined
  const paired = toolUseId ? events.find((event) => event.id !== item.id && event.payload.toolUseId === toolUseId) : undefined
  const request = item.payload?.input ?? paired?.payload.input
  const output = item.payload?.isError === true || item.detail ? item.detail : paired?.content
  const failed = item.payload?.isError === true || paired?.payload.isError === true
  return { request, output, failed, toolUseId }
}

export const causalVisualItemsFor = (eventId: string, items: ComputerItem[]) => items.filter((item) => item.kind === 'screenshot' && item.payload?.causedByEventId === eventId)
