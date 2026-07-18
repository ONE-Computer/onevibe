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

const redactCommand = (command: string) => command
  .replace(/\b(authorization|api[_-]?key|token|password|secret)\s*=\s*([^\s'"`]+)/gi, '$1=<redacted>')
  .replace(/(--(?:api[-_]?key|token|password|secret))(?:=|\s+)([^\s'"`]+)/gi, '$1=<redacted>')
  .replace(/\bBearer\s+[^\s'"`]+/gi, 'Bearer <redacted>')
  .replace(/\/(?:Users|home|private\/tmp|tmp)\/[^\s'"`]+/g, '<workspace-path>')

const redactText = (value: string) => redactCommand(value)
  .replace(/\b(authorization|api[_-]?key|token|password|secret)\s*[:=]\s*(["'])?([^\s,"'}\]]+)\2?/gi, '$1=<redacted>')

const redactInspectableValue = (value: unknown): unknown => {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(redactInspectableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, redactedKeys.has(key.toLowerCase()) ? '<redacted>' : redactInspectableValue(nested)]))
}

const recordValue = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

export const commandFor = (value: unknown) => {
  const input = recordValue(value)
  return typeof input?.command === 'string' ? redactCommand(input.command) : undefined
}

const compactValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.length > 104 ? `${value.slice(0, 101)}…` : value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const command = commandFor(input)
  if (command) return `$ ${command.length > 100 ? `${command.slice(0, 97)}…` : command}`
  const operation = typeof input.operation === 'string' ? input.operation : undefined
  const paths = Array.isArray(input.paths) ? input.paths.filter((path): path is string => typeof path === 'string').slice(0, 2) : []
  if (operation) return `${operation}${paths.length ? ` · ${paths.join(', ')}` : ''}`
  const visible = Object.entries(input).filter(([key]) => !redactedKeys.has(key.toLowerCase())).slice(0, 2)
  return visible.length ? visible.map(([key, candidate]) => `${key}=${typeof candidate === 'string' ? redactText(candidate) : '…'}`).join(' · ') : undefined
}

export const activityPreviewFor = (payload?: Record<string, unknown>) => compactValue(payload?.input)

export const formatInspectable = (value: unknown, limit = 12_000) => {
  const redacted = redactInspectableValue(value)
  const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted, null, 2)
  return text.length > limit ? `${text.slice(0, limit)}\n…[truncated for the activity rail]` : text
}

export const formatDuration = (milliseconds: number | undefined) => {
  if (milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return undefined
  if (milliseconds < 1_000) return `${milliseconds}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`
  return `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`
}

/** Do not steal caret, select-menu, or editable-content navigation from the reviewer. */
export const timelineNavigationAllowedFor = (tagName: string | undefined, isContentEditable = false) => !isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName?.toUpperCase() ?? '')

export const RAIL_ROW_HEIGHTS = { run: 24, group: 32, item: 44 } as const

export type RailRow =
  | { type: 'run'; id: string; runId: string }
  | { type: 'group'; id: string; group: RailToolGroup }
  | { type: 'item'; id: string; item: ComputerItem; depth: 0 | 1 }

export const railRowHeight = (row: RailRow) => RAIL_ROW_HEIGHTS[row.type]

/** Window a mixed-height checkpoint rail, retaining an overscan buffer for smooth scrolling. */
export const virtualRailRows = (rows: RailRow[], scrollTop: number, viewportHeight: number, overscan = 10) => {
  const offsets: number[] = []
  let total = 0
  for (const row of rows) { offsets.push(total); total += railRowHeight(row) }
  if (!rows.length) return { start: 0, end: 0, offsets, total }
  const top = Math.max(0, scrollTop)
  const bottom = top + Math.max(viewportHeight, RAIL_ROW_HEIGHTS.item)
  let start = 0
  while (start < rows.length - 1 && offsets[start + 1] <= top) start += 1
  let end = start
  while (end < rows.length && offsets[end] < bottom) end += 1
  return { start: Math.max(0, start - overscan), end: Math.min(rows.length, end + overscan), offsets, total }
}

export const matchesRailQuery = (item: ComputerItem, query: string) => {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return true
  return [item.title, item.detail, item.activityPreview, item.kind, item.runId, item.sequence?.toString()].some((value) => value?.toLocaleLowerCase().includes(normalized))
}

/** Preserve first appearance: it is the chronological run order in the evidence stream. */
export const runIdsFor = (items: ComputerItem[]) => [...new Set(items.map((item) => item.runId).filter((runId): runId is string => Boolean(runId)))]

export const runLabel = (runId: string, orderedRunIds: string[] = []) => {
  if (runId.startsWith('legacy-')) {
    const index = orderedRunIds.indexOf(runId)
    return `Turn ${index >= 0 ? index + 1 : 'earlier'}`
  }
  return `Run ${runId.slice(-6)}`
}

export const filterItemsByRun = (items: ComputerItem[], runId: string) => runId === 'all' ? items : items.filter((item) => item.runId === runId)

export type RunEvidenceSummary = {
  runId: string
  cards: number
  toolCards: number
  visualFrames: number
  deliverables: number
  durationMs?: number
}

export type RunArtifactDelta = { added: string[]; removed: string[]; unchanged: number; truncated: boolean }

/**
 * Compare run-level evidence only. It deliberately does not inspect file
 * contents or replay controls, so the review surface stays within the same
 * server-projected evidence boundary as the rail.
 */
export const summarizeRunEvidence = (items: ComputerItem[], runId: string): RunEvidenceSummary => {
  const runItems = filterItemsByRun(items, runId)
  const times = runItems.map((item) => Date.parse(item.createdAt)).filter(Number.isFinite)
  return {
    runId,
    cards: runItems.length,
    toolCards: runItems.filter((item) => item.kind === 'terminal').length,
    visualFrames: runItems.filter((item) => item.kind === 'screenshot' && !item.live).length,
    deliverables: runItems.filter((item) => ['file', 'diff', 'preview', 'slide'].includes(item.kind)).length,
    durationMs: times.length > 1 ? Math.max(...times) - Math.min(...times) : undefined,
  }
}

/** Compare only visible artifact identifiers; never project artifact contents into the rail. */
export const compareRunArtifacts = (items: ComputerItem[], baselineRunId: string, candidateRunId: string, limit = 30): RunArtifactDelta => {
  const keys = (runId: string) => new Set(filterItemsByRun(items, runId)
    .filter((item) => ['file', 'diff', 'preview', 'slide'].includes(item.kind))
    .map((item) => item.detail ?? item.title)
    .filter(Boolean))
  const baseline = keys(baselineRunId)
  const candidate = keys(candidateRunId)
  const added = [...candidate].filter((key) => !baseline.has(key)).sort()
  const removed = [...baseline].filter((key) => !candidate.has(key)).sort()
  return { added: added.slice(0, limit), removed: removed.slice(0, limit), unchanged: [...candidate].filter((key) => baseline.has(key)).length, truncated: added.length > limit || removed.length > limit }
}

export const presentationItems = (task: TaskSnapshot): ComputerItem[] => {
  // Tasks created before run IDs were persisted still contain immutable
  // `run_started` boundaries. Derive a display-only ID from that evidence so
  // old multi-turn histories remain reviewable without rewriting their ledger.
  let legacyRunId: string | undefined
  const items = task.events.flatMap((event): ComputerItem[] => {
    if (event.type === 'run_started') legacyRunId = event.runId ?? `legacy-${event.id}`
    const runId = event.runId ?? legacyRunId
    const presentation = event.payload.presentation as PresentationDescriptor | undefined
    if (presentation && ['terminal', 'screenshot', 'preview', 'file', 'diff', 'slide', 'approval'].includes(presentation.panel)) return [{ id: event.id, kind: presentation.panel, eventType: event.type, title: event.label ?? 'Artifact', detail: event.content, activityPreview: presentation.panel === 'terminal' ? activityPreviewFor(event.payload) : undefined, createdAt: event.createdAt, runId, sequence: event.sequence, eventHash: event.eventHash, uri: presentation.uri, payload: event.payload }]
    // Compatibility for evidence created before the typed presentation contract.
    if (event.type.startsWith('tool_call')) return [{ id: event.id, kind: 'terminal', eventType: event.type, title: event.label ?? 'Tool call', detail: event.content, activityPreview: activityPreviewFor(event.payload), createdAt: event.createdAt, runId, sequence: event.sequence, eventHash: event.eventHash, payload: event.payload }]
    if (event.type === 'artifact_created' || event.type === 'artifact_updated') return [{ id: event.id, kind: event.type === 'artifact_updated' ? 'diff' : 'file', eventType: event.type, title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId, sequence: event.sequence, eventHash: event.eventHash, payload: event.payload }]
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

const isControlArtifact = (item: ComputerItem) => /(?:^|\/)(?:artifact-manifest|validation-report|sandbox-build-report)\.json$/i.test(item.detail ?? '')

/** A settled task opens on the most useful evidence for its mode, not a control receipt. */
export const defaultComputerItem = (items: ComputerItem[], settled: boolean, mode?: TaskSnapshot['mode']) => {
  if (!items.length) return undefined
  if (!settled) return items.at(-1)
  const reverse = [...items].reverse()
  // For a general task the terminal command/result is the primary proof of
  // execution. Website/document/slide modes still open on their deliverable.
  if (mode === 'general') return reverse.find((item) => item.kind === 'terminal' && Boolean(commandFor(item.payload?.input)))
    ?? reverse.find((item) => ['screenshot', 'preview', 'slide'].includes(item.kind) && !isControlArtifact(item))
    ?? reverse.find((item) => item.kind === 'terminal')
  return reverse.find((item) => (item.kind === 'screenshot' || item.kind === 'preview' || item.kind === 'slide') && !isControlArtifact(item))
    ?? reverse.find((item) => item.kind === 'terminal')
    ?? reverse.find((item) => !isControlArtifact(item))
    ?? items.at(-1)
}

export const terminalActivityFor = (item: ComputerItem, events: RuntimeEvent[]) => {
  const toolUseId = typeof item.payload?.toolUseId === 'string' ? item.payload.toolUseId : undefined
  const paired = toolUseId ? events.find((event) => event.id !== item.id && event.type === 'tool_call_completed' && event.payload.toolUseId === toolUseId) : undefined
  const request = item.payload?.input ?? paired?.payload.input
  const command = commandFor(request)
  // A start event often contains a human-readable request summary. Prefer the
  // paired terminal result so the unified rail card reads request → outcome.
  const output = item.eventType === 'tool_call_started' ? paired?.content : item.detail ?? paired?.content
  const failed = item.payload?.isError === true || paired?.payload.isError === true
  const elapsed = paired && item.eventType === 'tool_call_started' ? Date.parse(paired.createdAt) - Date.parse(item.createdAt) : undefined
  return {
    request, output, failed, toolUseId, command,
    workspaceLabel: command ? 'Sandbox workspace' : undefined,
    durationMs: elapsed !== undefined && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined,
  }
}

export type RailStatus = 'completed' | 'failed' | 'pending' | 'skipped'

const approvalResolutionStatus = (payload: Record<string, unknown>): RailStatus => {
  if (payload.state === 'expired') return 'skipped'
  return payload.decision === 'approved' || payload.walletDecision === true ? 'completed' : 'failed'
}

/**
 * One truthful status per checkpoint row, derived from the immutable event
 * ledger: an approval is pending until its `approval_resolved` event exists,
 * a tool call is pending until its paired terminal result is recorded.
 */
export const railStatusFor = (item: ComputerItem, events: RuntimeEvent[]): RailStatus => {
  if (item.kind === 'approval') {
    if (item.eventType === 'approval_resolved') return approvalResolutionStatus(item.payload ?? {})
    const approvalId = typeof item.payload?.approvalId === 'string' ? item.payload.approvalId : undefined
    const resolution = approvalId ? events.find((event) => event.type === 'approval_resolved' && event.payload.approvalId === approvalId) : undefined
    return resolution ? approvalResolutionStatus(resolution.payload) : 'pending'
  }
  if (item.kind === 'terminal') {
    const activity = terminalActivityFor(item, events)
    if (activity.failed) return 'failed'
    if (item.eventType === 'tool_call_completed' || item.relatedEventIds?.length) return 'completed'
    return activity.durationMs !== undefined ? 'completed' : 'pending'
  }
  return item.live ? 'pending' : 'completed'
}

export type RailToolGroup = {
  id: string
  items: ComputerItem[]
  failedCount: number
  pendingCount: number
  durationMs?: number
}

export const isRailToolGroup = (entry: ComputerItem | RailToolGroup): entry is RailToolGroup => Array.isArray((entry as RailToolGroup).items)

/**
 * Groups consecutive tool calls that belong to one LLM turn. The event
 * stream has no explicit turn marker, so a turn boundary is derived from the
 * ledger: an `assistant_text_delta` event recorded between two consecutive
 * terminal rail items (or a run change) starts a new turn. Groups never
 * reorder, fold, or hide evidence — collapsing is a display-only state.
 */
export const toolCallGroupsFor = (items: ComputerItem[], events: RuntimeEvent[]): Array<ComputerItem | RailToolGroup> => {
  let turn = 0
  const turnIndexByEventId = new Map<string, number>()
  for (const event of events) {
    if (event.type === 'assistant_text_delta') turn += 1
    turnIndexByEventId.set(event.id, turn)
  }
  const entries: Array<ComputerItem | RailToolGroup> = []
  let buffer: ComputerItem[] = []
  const flush = () => {
    if (buffer.length >= 2) {
      const statuses = buffer.map((item) => railStatusFor(item, events))
      const first = Date.parse(buffer[0].createdAt)
      const last = Date.parse(buffer.at(-1)?.createdAt ?? '')
      entries.push({
        id: `turn-${buffer[0].id}`,
        items: [...buffer],
        failedCount: statuses.filter((status) => status === 'failed').length,
        pendingCount: statuses.filter((status) => status === 'pending').length,
        durationMs: Number.isFinite(first) && Number.isFinite(last) && last >= first ? last - first : undefined,
      })
    } else entries.push(...buffer)
    buffer = []
  }
  let previous: ComputerItem | undefined
  for (const item of items) {
    if (item.kind !== 'terminal' || item.live) {
      flush()
      entries.push(item)
    } else {
      if (previous && buffer.length) {
        const previousTurn = turnIndexByEventId.get(previous.id)
        const itemTurn = turnIndexByEventId.get(item.id)
        if (item.runId !== previous.runId || (previousTurn !== undefined && itemTurn !== undefined && itemTurn !== previousTurn)) flush()
      }
      buffer.push(item)
    }
    previous = item
  }
  flush()
  return entries
}

/**
 * Flattens grouped entries into fixed-height rail rows: a run divider when
 * the run changes, a group header per LLM turn, and item rows whose children
 * hide while their group is collapsed.
 */
export const railRowsFor = (entries: Array<ComputerItem | RailToolGroup>, collapsed: ReadonlySet<string>): RailRow[] => {
  const rows: RailRow[] = []
  let previousRunId: string | undefined
  for (const entry of entries) {
    const runId = isRailToolGroup(entry) ? entry.items[0]?.runId : entry.runId
    if (runId && runId !== previousRunId) rows.push({ type: 'run', id: `run-${runId}-${rows.length}`, runId })
    previousRunId = runId ?? previousRunId
    if (isRailToolGroup(entry)) {
      rows.push({ type: 'group', id: entry.id, group: entry })
      if (!collapsed.has(entry.id)) for (const item of entry.items) rows.push({ type: 'item', id: item.id, item, depth: 1 })
    } else rows.push({ type: 'item', id: entry.id, item: entry, depth: 0 })
  }
  return rows
}

/**
 * A compact rail card can fold a tool result into its originating start card.
 * Visual evidence may be causally attached to either immutable event, so use
 * both IDs when resolving the card's associated frames.
 */
export const causalVisualItemsFor = (eventIds: string | string[], items: ComputerItem[]) => {
  const ids = new Set(Array.isArray(eventIds) ? eventIds : [eventIds])
  return items.filter((item) => item.kind === 'screenshot' && typeof item.payload?.causedByEventId === 'string' && ids.has(item.payload.causedByEventId))
}

export type RailCardType = 'cli' | 'visual' | 'deliverable' | 'policy'
export type VisualEvidenceState = 'captured' | 'unavailable' | 'not_applicable'

/**
 * A frame is evidence only when a stored screenshot is causally related to
 * this tool event. Browser-capable tools without that evidence must say so,
 * rather than inheriting another tool's frame or showing decorative imagery.
 */
export const visualEvidenceStateFor = (item: ComputerItem, items: ComputerItem[]): VisualEvidenceState => {
  if (item.kind !== 'terminal') return 'not_applicable'
  const relatedEventIds = [item.id, ...(item.relatedEventIds ?? [])]
  if (relatedEventIds.some((eventId) => causalVisualItemsFor(eventId, items).length > 0)) return 'captured'
  return item.payload?.browserTool === true ? 'unavailable' : 'not_applicable'
}

/** One small, visible category makes a mixed chronological stream scannable. */
export const railCardTypeFor = (item: ComputerItem): RailCardType => {
  if (item.kind === 'terminal') return 'cli'
  if (item.kind === 'screenshot') return 'visual'
  if (item.kind === 'approval') return 'policy'
  return 'deliverable'
}

export const evidenceItemId = (items: ComputerItem[], eventId: string | null) => {
  const item = eventId ? items.find((candidate) => candidate.id === eventId || candidate.relatedEventIds?.includes(eventId)) : undefined
  return item?.eventHash ? item.id : undefined
}
