import type { PresentationDescriptor, PresentationPanel, RuntimeEvent, TaskSnapshot } from '../types'

export type ComputerItem = {
  id: string
  kind: PresentationPanel
  eventType?: string
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
  /** Evidence IDs folded into this visible rail card (for example, a tool result). */
  relatedEventIds?: string[]
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

export const formatDuration = (milliseconds: number | undefined) => {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return undefined
  if (milliseconds < 1_000) return `${milliseconds}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`
}

export const virtualRailRange = (count: number, scrollTop: number, viewportHeight: number, rowHeight = 68, overscan = 12) => {
  if (count <= 0) return { start: 0, end: 0 }
  const visibleStart = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visibleEnd = Math.ceil((Math.max(0, scrollTop) + Math.max(rowHeight, viewportHeight)) / rowHeight)
  return { start: Math.max(0, visibleStart - overscan), end: Math.min(count, visibleEnd + overscan) }
}

export const matchesRailQuery = (item: ComputerItem, query: string) => {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [item.title, item.detail, item.activityPreview, item.kind, item.runId, item.sequence?.toString()].some((value) => value?.toLocaleLowerCase().includes(normalized))
}

export const runIdsFor = (items: ComputerItem[]) => [...new Set(items.map((item) => item.runId).filter((runId): runId is string => Boolean(runId)))].sort((a, b) => a.localeCompare(b))

export const filterItemsByRun = (items: ComputerItem[], runId: string) => runId === 'all' ? items : items.filter((item) => item.runId === runId)

export const presentationItems = (task: TaskSnapshot): ComputerItem[] => {
  const items = task.events.flatMap((event): ComputerItem[] => {
    const presentation = event.payload.presentation as PresentationDescriptor | undefined
    if (presentation && ['terminal', 'screenshot', 'preview', 'file', 'diff', 'slide', 'approval'].includes(presentation.panel)) return [{ id: event.id, kind: presentation.panel, eventType: event.type, title: event.label ?? 'Artifact', detail: event.content, activityPreview: presentation.panel === 'terminal' ? activityPreviewFor(event.payload) : undefined, createdAt: event.createdAt, runId: event.runId, sequence: event.sequence, eventHash: event.eventHash, uri: presentation.uri, payload: event.payload }]
    // Compatibility for evidence created before the typed presentation contract.
    if (event.type.startsWith('tool_call')) return [{ id: event.id, kind: 'terminal', eventType: event.type, title: event.label ?? 'Tool call', detail: event.content, activityPreview: activityPreviewFor(event.payload), createdAt: event.createdAt, runId: event.runId, sequence: event.sequence, eventHash: event.eventHash, payload: event.payload }]
    if (event.type === 'artifact_created' || event.type === 'artifact_updated') return [{ id: event.id, kind: event.type === 'artifact_updated' ? 'diff' : 'file', eventType: event.type, title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId: event.runId, sequence: event.sequence, eventHash: event.eventHash, payload: event.payload }]
    return []
  })
  if (task.securityContext?.visualRuntimeReady && task.securityContext.sandboxState !== 'destroyed') items.push({
    id: 'live-x11', kind: 'screenshot', title: 'Live X11 display', detail: 'Authenticated PNG capture · no VNC',
    createdAt: task.updatedAt, uri: `/api/tasks/${task.id}/visual/screenshot`, live: true,
  })
  return items
}

/**
 * Converts the append-only event list into the compact, artifact-first rail.
 * A tool start owns its matching terminal result card but never changes the
 * underlying evidence ordering or hides an unpaired result.
 */
export const artifactRailItems = (items: ComputerItem[]) => {
  const starts = new Map<string, ComputerItem>()
  for (const item of items) {
    const toolUseId = typeof item.payload?.toolUseId === 'string' ? item.payload.toolUseId : undefined
    if (item.kind === 'terminal' && item.eventType === 'tool_call_started' && toolUseId) starts.set(toolUseId, item)
  }
  const folded = new Set<string>()
  const related = new Map<string, string[]>()
  for (const item of items) {
    const toolUseId = typeof item.payload?.toolUseId === 'string' ? item.payload.toolUseId : undefined
    const start = toolUseId ? starts.get(toolUseId) : undefined
    if (item.kind === 'terminal' && item.eventType === 'tool_call_completed' && start && start.id !== item.id) {
      folded.add(item.id)
      related.set(start.id, [...(related.get(start.id) ?? []), item.id])
    }
  }
  return items.filter((item) => !folded.has(item.id)).map((item) => ({ ...item, relatedEventIds: related.get(item.id) }))
}

/** A settled task opens on its delivered visual output, not its final receipt. */
export const defaultComputerItem = (items: ComputerItem[], settled: boolean) => {
  if (!items.length) return undefined
  if (!settled) return items.at(-1)
  return [...items].reverse().find((item) => item.kind === 'screenshot' || item.kind === 'preview' || item.kind === 'slide') ?? items.at(-1)
}

export const terminalActivityFor = (item: ComputerItem, events: RuntimeEvent[]) => {
  const toolUseId = typeof item.payload?.toolUseId === 'string' ? item.payload.toolUseId : undefined
  const paired = toolUseId ? events.find((event) => event.id !== item.id && event.type === 'tool_call_completed' && event.payload.toolUseId === toolUseId) : undefined
  const request = item.payload?.input ?? paired?.payload.input
  // A start event often contains a human-readable request summary. Prefer the
  // paired terminal result so the unified rail card reads request → outcome.
  const output = item.eventType === 'tool_call_started' ? paired?.content : item.detail ?? paired?.content
  const failed = item.payload?.isError === true || paired?.payload.isError === true
  const elapsed = paired && item.eventType === 'tool_call_started' ? Date.parse(paired.createdAt) - Date.parse(item.createdAt) : undefined
  return { request, output, failed, toolUseId, durationMs: elapsed !== undefined && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined }
}

export const causalVisualItemsFor = (eventId: string, items: ComputerItem[]) => items.filter((item) => item.kind === 'screenshot' && item.payload?.causedByEventId === eventId)

export const evidenceItemId = (items: ComputerItem[], eventId: string | null) => {
  const item = eventId ? items.find((candidate) => candidate.id === eventId || candidate.relatedEventIds?.includes(eventId)) : undefined
  return item?.eventHash ? item.id : undefined
}
