import type { PresentationDescriptor, PresentationPanel, RuntimeEvent, TaskSnapshot } from '../types'

export type ComputerItem = {
  id: string
  kind: PresentationPanel
  title: string
  detail?: string
  activityPreview?: string
  runId?: string
  createdAt: string
  sequence?: number
  eventHash?: string
  uri?: string
  payload?: Record<string, unknown>
  live?: boolean
}

const redactedKeys = new Set(['api_key', 'apikey', 'authorization', 'password', 'secret', 'token'])

const compactValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.length > 104 ? `${value.slice(0, 101)}…` : value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  if (typeof input.command === 'string') return `$ ${input.command.length > 100 ? `${input.command.slice(0, 97)}…` : input.command}`
  const operation = typeof input.operation === 'string' ? input.operation : undefined
  const paths = Array.isArray(input.paths) ? input.paths.filter((path): path is string => typeof path === 'string').slice(0, 2) : []
  if (operation) return `${operation}${paths.length ? ` · ${paths.join(', ')}` : ''}`
  const visible = Object.entries(input).filter(([key]) => !redactedKeys.has(key.toLowerCase())).slice(0, 2)
  return visible.length ? visible.map(([key, candidate]) => `${key}=${typeof candidate === 'string' ? candidate : '…'}`).join(' · ') : undefined
}

export const activityPreviewFor = (payload?: Record<string, unknown>) => compactValue(payload?.input)

export const formatInspectable = (value: unknown, limit = 12_000) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > limit ? `${text.slice(0, limit)}\n…[truncated for the activity rail]` : text
}

export const presentationItems = (task: TaskSnapshot): ComputerItem[] => {
  const items = task.events.flatMap((event): ComputerItem[] => {
    const presentation = event.payload.presentation as PresentationDescriptor | undefined
    if (presentation && ['terminal', 'screenshot', 'preview', 'file', 'diff', 'slide', 'approval'].includes(presentation.panel)) return [{ id: event.id, kind: presentation.panel, title: event.label ?? 'Artifact', detail: event.content, activityPreview: presentation.panel === 'terminal' ? activityPreviewFor(event.payload) : undefined, createdAt: event.createdAt, runId: event.runId, sequence: event.sequence, eventHash: event.eventHash, uri: presentation.uri, payload: event.payload }]
    // Compatibility for evidence created before the typed presentation contract.
    if (event.type.startsWith('tool_call')) return [{ id: event.id, kind: 'terminal', title: event.label ?? 'Tool call', detail: event.content, activityPreview: activityPreviewFor(event.payload), createdAt: event.createdAt, runId: event.runId, sequence: event.sequence, eventHash: event.eventHash, payload: event.payload }]
    if (event.type === 'artifact_created' || event.type === 'artifact_updated') return [{ id: event.id, kind: event.type === 'artifact_updated' ? 'diff' : 'file', title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId: event.runId, sequence: event.sequence, eventHash: event.eventHash, payload: event.payload }]
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

export const evidenceItemId = (items: ComputerItem[], eventId: string | null) => {
  const item = eventId ? items.find((candidate) => candidate.id === eventId) : undefined
  return item?.eventHash ? item.id : undefined
}
