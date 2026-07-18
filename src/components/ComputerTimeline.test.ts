import { describe, expect, it } from 'vitest'
import { activityPreviewFor, artifactRailItems, causalVisualItemsFor, commandFor, compareRunArtifacts, defaultComputerItem, evidenceItemId, filterItemsByRun, formatDuration, formatInspectable, isRailToolGroup, matchesRailQuery, presentationItems, railCardTypeFor, railRowsFor, railStatusFor, runIdsFor, runLabel, summarizeRunEvidence, terminalActivityFor, timelineNavigationAllowedFor, toolCallGroupsFor, virtualRailRows, visualEvidenceStateFor, type ComputerItem, type RailRow, type RailToolGroup } from './computer-timeline-activity'
import type { RuntimeEvent } from '../types'

const event = (id: string, type: string, payload: Record<string, unknown>, content?: string): RuntimeEvent => ({
  id, taskId: 'task-1', sequence: 1, type, lane: 'activity', payload, content,
  createdAt: '2026-07-16T00:00:00.000Z', previousHash: 'previous', eventHash: 'current',
})

describe('Computer timeline terminal inspection', () => {
  it('pairs a tool request with the matching result without exposing unrelated activity', () => {
    const started = event('event-start', 'tool_call_started', { toolUseId: 'tool-12345678', input: { command: 'npm run build' } })
    const finished = event('event-finish', 'tool_call_completed', { toolUseId: 'tool-12345678' }, 'Build succeeded')
    const other = event('event-other', 'tool_call_completed', { toolUseId: 'tool-other' }, 'Do not show this')
    const activity = terminalActivityFor({ id: started.id, kind: 'terminal', title: 'Bash', createdAt: started.createdAt, detail: started.content, payload: started.payload }, [started, finished, other])

    expect(activity.request).toEqual({ command: 'npm run build' })
    expect(activity.output).toBe('Build succeeded')
    expect(activity.failed).toBe(false)
  })

  it('shows the paired result, not a start-event summary, on a grouped tool card', () => {
    const started = event('event-start', 'tool_call_started', { toolUseId: 'tool-12345678', input: { command: 'npm run build' } }, 'Starting build')
    const finished = event('event-finish', 'tool_call_completed', { toolUseId: 'tool-12345678' }, 'Build succeeded')
    const activity = terminalActivityFor({ id: started.id, kind: 'terminal', eventType: 'tool_call_started', title: 'Bash', createdAt: started.createdAt, detail: started.content, payload: started.payload }, [started, finished])

    expect(activity.output).toBe('Build succeeded')
  })

  it('derives a readable duration from the paired immutable event timestamp', () => {
    const started = event('event-start', 'tool_call_started', { toolUseId: 'tool-timed', input: { command: 'npm test' } })
    started.createdAt = '2026-07-16T00:00:00.000Z'
    const finished = event('event-finish', 'tool_call_completed', { toolUseId: 'tool-timed' }, 'Tests passed')
    finished.createdAt = '2026-07-16T00:00:02.400Z'
    const activity = terminalActivityFor({ id: started.id, kind: 'terminal', eventType: 'tool_call_started', title: 'Bash', createdAt: started.createdAt, payload: started.payload }, [started, finished])

    expect(activity.durationMs).toBe(2_400)
    expect(formatDuration(activity.durationMs)).toBe('2.4s')
  })

  it('labels an error result for the operator', () => {
    const completed = event('event-finish', 'tool_call_completed', { toolUseId: 'tool-1', isError: true }, 'Permission denied')
    const activity = terminalActivityFor({ id: completed.id, kind: 'terminal', title: 'Tool result', createdAt: completed.createdAt, detail: completed.content, payload: completed.payload }, [completed])

    expect(activity.output).toBe('Permission denied')
    expect(activity.failed).toBe(true)
  })

  it('only links screenshot evidence whose causal event is the selected tool call', () => {
    const items: ComputerItem[] = [
      { id: 'frame-one', kind: 'screenshot', title: 'X11 frame', createdAt: '2026-07-16T00:00:00.000Z', payload: { causedByEventId: 'event-start' } },
      { id: 'frame-two', kind: 'screenshot', title: 'X11 frame', createdAt: '2026-07-16T00:00:01.000Z', payload: { causedByEventId: 'different-event' } },
      { id: 'terminal', kind: 'terminal', title: 'Read', createdAt: '2026-07-16T00:00:02.000Z' },
    ]

    expect(causalVisualItemsFor('event-start', items).map((item) => item.id)).toEqual(['frame-one'])
  })

  it('keeps a causal frame attached when the compact rail card folds its result event', () => {
    const tool: ComputerItem = { id: 'tool-start', kind: 'terminal', eventType: 'tool_call_started', title: 'Browser navigate', createdAt: '2026-07-16T00:00:00.000Z', payload: { toolUseId: 'tool-1', browserTool: true } }
    const result: ComputerItem = { id: 'tool-result', kind: 'terminal', eventType: 'tool_call_completed', title: 'Browser navigate complete', createdAt: '2026-07-16T00:00:01.000Z', payload: { toolUseId: 'tool-1' } }
    const frame: ComputerItem = { id: 'frame', kind: 'screenshot', title: 'Browser frame', createdAt: '2026-07-16T00:00:02.000Z', payload: { causedByEventId: 'tool-result' } }
    const [railCard] = artifactRailItems([tool, result, frame])

    expect(railCard.relatedEventIds).toEqual(['tool-result'])
    expect(causalVisualItemsFor([railCard.id, ...(railCard.relatedEventIds ?? [])], [tool, result, frame]).map((item) => item.id)).toEqual(['frame'])
    expect(visualEvidenceStateFor(railCard, [tool, result, frame])).toBe('captured')
  })

  it('keeps mixed rail semantics explicit and never invents a browser frame', () => {
    const browser: ComputerItem = { id: 'browser-start', kind: 'terminal', title: 'Navigate', createdAt: '2026-07-16T00:00:00.000Z', payload: { browserTool: true } }
    const frame: ComputerItem = { id: 'frame', kind: 'screenshot', title: 'Browser frame', createdAt: '2026-07-16T00:00:01.000Z', payload: { causedByEventId: 'browser-start' } }
    const file: ComputerItem = { id: 'file', kind: 'file', title: 'README.md', createdAt: '2026-07-16T00:00:02.000Z' }

    expect(railCardTypeFor(browser)).toBe('cli')
    expect(railCardTypeFor(frame)).toBe('visual')
    expect(railCardTypeFor(file)).toBe('deliverable')
    expect(visualEvidenceStateFor(browser, [browser])).toBe('unavailable')
    expect(visualEvidenceStateFor(browser, [browser, frame])).toBe('captured')
  })

  it('only restores a URL reference for immutable evidence, never the live display', () => {
    const items: ComputerItem[] = [
      { id: 'recorded-frame', kind: 'screenshot', title: 'X11 frame', createdAt: '2026-07-16T00:00:00.000Z', eventHash: 'abc123' },
      { id: 'live-x11', kind: 'screenshot', title: 'Live X11 display', createdAt: '2026-07-16T00:00:01.000Z', live: true },
    ]

    expect(evidenceItemId(items, 'recorded-frame')).toBe('recorded-frame')
    expect(evidenceItemId(items, 'live-x11')).toBeUndefined()
  })

  it('creates a compact command preview while excluding secret-shaped inputs', () => {
    expect(activityPreviewFor({ input: { command: 'pnpm build', token: 'do-not-show' } })).toBe('$ pnpm build')
    expect(activityPreviewFor({ input: { operation: 'write', paths: ['src/App.tsx', 'src/index.css'], api_key: 'do-not-show' } })).toBe('write · src/App.tsx, src/index.css')
  })

  it('projects a CLI command without exposing credentials or host paths', () => {
    const command = commandFor({ command: 'API_KEY=not-for-the-rail node /Users/operator/project/build.mjs --token top-secret' })
    expect(command).toBe('API_KEY=<redacted> node <workspace-path> --token=<redacted>')
    const activity = terminalActivityFor({ id: 'command', kind: 'terminal', title: 'Bash', createdAt: '2026-07-16T00:00:00.000Z', payload: { input: { command: 'pwd' } } }, [])
    expect(activity.command).toBe('pwd')
    expect(activity.workspaceLabel).toBe('Sandbox workspace')
  })

  it('redacts secret-shaped terminal output and host paths before inspection', () => {
    const output = formatInspectable({ authorization: 'Bearer never-show', nested: { password: 'do-not-show', output: 'token=also-hidden at /Users/operator/private.log' } })
    expect(output).toContain('<redacted>')
    expect(output).not.toContain('never-show')
    expect(output).not.toContain('do-not-show')
    expect(output).not.toContain('also-hidden')
    expect(output).not.toContain('/Users/operator')
  })

  it('folds a completed tool result into its originating rail card without changing evidence order', () => {
    const started: ComputerItem = { id: 'tool-start', kind: 'terminal', eventType: 'tool_call_started', title: 'Read', createdAt: '2026-07-16T00:00:00.000Z', eventHash: 'start-hash', payload: { toolUseId: 'tool-1', input: { path: 'README.md' } } }
    const completed: ComputerItem = { id: 'tool-finish', kind: 'terminal', eventType: 'tool_call_completed', title: 'Read complete', createdAt: '2026-07-16T00:00:01.000Z', eventHash: 'finish-hash', payload: { toolUseId: 'tool-1' } }
    const artifact: ComputerItem = { id: 'artifact', kind: 'file', title: 'README.md', createdAt: '2026-07-16T00:00:02.000Z', eventHash: 'artifact-hash' }

    const rail = artifactRailItems([started, completed, artifact])

    expect(rail.map((item) => item.id)).toEqual(['tool-start', 'artifact'])
    expect(rail[0].relatedEventIds).toEqual(['tool-finish'])
    expect(evidenceItemId(rail, 'tool-finish')).toBe('tool-start')
  })

  it('keeps unpaired result events visible instead of silently discarding audit evidence', () => {
    const result: ComputerItem = { id: 'orphan-result', kind: 'terminal', eventType: 'tool_call_completed', title: 'Recovered result', createdAt: '2026-07-16T00:00:00.000Z', eventHash: 'result-hash', payload: { toolUseId: 'unknown' } }
    expect(artifactRailItems([result]).map((item) => item.id)).toEqual(['orphan-result'])
  })

  it('opens settled work on its latest visual deliverable while active work follows the newest event', () => {
    const terminal: ComputerItem = { id: 'terminal', kind: 'terminal', title: 'Write source', createdAt: '2026-07-16T00:00:01.000Z', payload: { input: { command: 'wc -c NOTES.md' } } }
    const preview: ComputerItem = { id: 'preview', kind: 'preview', title: 'Interactive preview', createdAt: '2026-07-16T00:00:02.000Z' }
    const control: ComputerItem = { id: 'control', kind: 'approval', title: 'Approval pending', createdAt: '2026-07-16T00:00:03.000Z' }
    expect(defaultComputerItem([terminal, preview, control], true)?.id).toBe('preview')
    expect(defaultComputerItem([terminal, control], true)?.id).toBe('terminal')
    expect(defaultComputerItem([terminal, preview, control], false)?.id).toBe('control')
    expect(defaultComputerItem([terminal, preview], true, 'general')?.id).toBe('terminal')
    expect(defaultComputerItem([{ ...preview, detail: 'artifact-manifest.json' }, terminal], true, 'website')?.id).toBe('terminal')
  })

  it('windows a long rail while retaining an overscan buffer for smooth scrolling', () => {
    const rows: RailRow[] = Array.from({ length: 10_000 }, (_, index) => ({
      type: 'item', id: `item-${index}`, depth: 0,
      item: { id: `item-${index}`, kind: 'terminal', title: `Step ${index}`, createdAt: '2026-07-16T00:00:00.000Z' },
    }))
    const view = virtualRailRows(rows, 44 * 500, 340)
    expect({ start: view.start, end: view.end, offsets: view.offsets.length, total: view.total }).toEqual({ start: 490, end: 518, offsets: 10_000, total: 440_000 })
    expect(virtualRailRows(rows.slice(0, 3), 0, 340)).toMatchObject({ start: 0, end: 3, total: 132 })
  })

  it('measures mixed run divider, group header, and item row heights', () => {
    const grouped = (id: string): ComputerItem => ({ id, kind: 'terminal', title: `Tool ${id}`, createdAt: '2026-07-16T00:00:00.000Z' })
    const group: RailToolGroup = { id: 'turn-a', items: [grouped('a'), grouped('b')], failedCount: 0, pendingCount: 0 }
    const rows: RailRow[] = [
      { type: 'run', id: 'run-run-a-0', runId: 'run-a' },
      { type: 'group', id: group.id, group },
      { type: 'item', id: 'a', item: grouped('a'), depth: 1 },
      { type: 'item', id: 'b', item: grouped('b'), depth: 1 },
    ]
    expect(virtualRailRows(rows, 24, 44)).toMatchObject({ start: 0, end: 4, total: 144 })
  })

  it('reserves arrow and home/end controls for the rail without stealing editable-field navigation', () => {
    expect(timelineNavigationAllowedFor('div')).toBe(true)
    expect(timelineNavigationAllowedFor('input')).toBe(false)
    expect(timelineNavigationAllowedFor('textarea')).toBe(false)
    expect(timelineNavigationAllowedFor('select')).toBe(false)
    expect(timelineNavigationAllowedFor('div', true)).toBe(false)
  })

  it('searches only projected rail metadata', () => {
    const item: ComputerItem = { id: 'browser-event', kind: 'terminal', title: 'browser_navigate', detail: 'Opened the approved reference', activityPreview: 'https://example.com/docs', createdAt: '2026-07-16T00:00:00.000Z' }
    expect(matchesRailQuery(item, 'navigate')).toBe(true)
    expect(matchesRailQuery(item, 'example.com')).toBe(true)
    expect(matchesRailQuery(item, 'unrelated')).toBe(false)
  })

  it('filters a multi-run rail without including an unbound live surface', () => {
    const items: ComputerItem[] = [
      { id: 'one', kind: 'terminal', title: 'First', createdAt: '2026-07-16T00:00:00.000Z', runId: 'run-first' },
      { id: 'live', kind: 'screenshot', title: 'Live X11', createdAt: '2026-07-16T00:00:01.000Z', live: true },
      { id: 'two', kind: 'preview', title: 'Second', createdAt: '2026-07-16T00:00:02.000Z', runId: 'run-second' },
    ]
    expect(runIdsFor(items)).toEqual(['run-first', 'run-second'])
    expect(filterItemsByRun(items, 'run-second').map((item) => item.id)).toEqual(['two'])
  })

  it('summarizes bounded evidence for one immutable run without inspecting its content', () => {
    const items: ComputerItem[] = [
      { id: 'command', kind: 'terminal', title: 'Bash', createdAt: '2026-07-16T00:00:00.000Z', runId: 'run-a' },
      { id: 'frame', kind: 'screenshot', title: 'X11', createdAt: '2026-07-16T00:00:01.200Z', runId: 'run-a' },
      { id: 'page', kind: 'preview', title: 'Preview', createdAt: '2026-07-16T00:00:02.000Z', runId: 'run-a' },
      { id: 'other', kind: 'file', title: 'Later', createdAt: '2026-07-16T00:00:03.000Z', runId: 'run-b' },
    ]
    expect(summarizeRunEvidence(items, 'run-a')).toEqual({ runId: 'run-a', cards: 3, toolCards: 1, visualFrames: 1, deliverables: 1, durationMs: 2_000 })
  })

  it('compares run deliverables using projected metadata only', () => {
    const items: ComputerItem[] = [
      { id: 'old-preview', kind: 'preview', title: 'Preview', detail: 'index.html', createdAt: '2026-07-16T00:00:00.000Z', runId: 'run-old' },
      { id: 'old-file', kind: 'file', title: 'README.md', createdAt: '2026-07-16T00:00:01.000Z', runId: 'run-old' },
      { id: 'new-preview', kind: 'preview', title: 'Preview', detail: 'index.html', createdAt: '2026-07-16T00:00:02.000Z', runId: 'run-new' },
      { id: 'new-deck', kind: 'slide', title: 'Deck', detail: 'briefing.pptx', createdAt: '2026-07-16T00:00:03.000Z', runId: 'run-new' },
    ]
    expect(compareRunArtifacts(items, 'run-old', 'run-new')).toEqual({ added: ['briefing.pptx'], removed: ['README.md'], unchanged: 1, truncated: false })
  })

  it('derives display-only legacy run boundaries from immutable run-start events', () => {
    const firstStart = event('run-start-one', 'run_started', {})
    const firstTool = event('first-tool', 'tool_call_started', { toolUseId: 'first' })
    const secondStart = event('run-start-two', 'run_started', {})
    const secondTool = event('second-tool', 'tool_call_started', { toolUseId: 'second' })
    const task = { id: 'task-1', status: 'completed', updatedAt: secondTool.createdAt, events: [firstStart, firstTool, secondStart, secondTool], files: [], messages: [] } as unknown as import('../types').TaskSnapshot
    expect(presentationItems(task).map((item) => ({ id: item.id, runId: item.runId }))).toEqual([
      { id: 'first-tool', runId: 'legacy-run-start-one' },
      { id: 'second-tool', runId: 'legacy-run-start-two' },
    ])
  })

  it('uses chronological turn labels for legacy runs and short IDs for persisted runs', () => {
    expect(runLabel('legacy-run-start-one', ['legacy-run-start-one', 'legacy-run-start-two'])).toBe('Turn 1')
    expect(runLabel('persisted-abcdef', [])).toBe('Run abcdef')
  })
})

describe('Computer timeline checkpoint rail', () => {
  const tool = (id: string, runId = 'run-a', createdAt = '2026-07-16T00:00:00.000Z'): ComputerItem => ({
    id, kind: 'terminal', eventType: 'tool_call_started', title: `Tool ${id}`, createdAt, runId, payload: { toolUseId: id },
  })

  it('keeps an approval pending until its immutable resolution event exists', () => {
    const requested: ComputerItem = { id: 'approval-event', kind: 'approval', eventType: 'approval_requested', title: 'Approval required', createdAt: '2026-07-16T00:00:00.000Z', payload: { approvalId: 'approval-1' } }
    expect(railStatusFor(requested, [])).toBe('pending')
    expect(railStatusFor(requested, [event('resolution', 'approval_resolved', { approvalId: 'approval-1', decision: 'approved' })])).toBe('completed')
    expect(railStatusFor(requested, [event('resolution', 'approval_resolved', { approvalId: 'approval-1', decision: 'denied' })])).toBe('failed')
    expect(railStatusFor(requested, [event('resolution', 'approval_resolved', { approvalId: 'approval-1', state: 'expired', walletDecision: false })])).toBe('skipped')
  })

  it('reads an approval resolution card from its own payload', () => {
    const resolved = (payload: Record<string, unknown>): ComputerItem => ({ id: 'resolution', kind: 'approval', eventType: 'approval_resolved', title: 'Approval resolved', createdAt: '2026-07-16T00:00:01.000Z', payload })
    expect(railStatusFor(resolved({ approvalId: 'approval-1', decision: 'approved' }), [])).toBe('completed')
    expect(railStatusFor(resolved({ approvalId: 'approval-1', state: 'expired', walletDecision: false }), [])).toBe('skipped')
  })

  it('derives tool call status from the paired terminal result, never from optimism', () => {
    const started = event('tool-start', 'tool_call_started', { toolUseId: 'tool-1' })
    const finished = event('tool-finish', 'tool_call_completed', { toolUseId: 'tool-1' }, 'Done')
    finished.createdAt = '2026-07-16T00:00:01.200Z'
    const startItem: ComputerItem = { id: started.id, kind: 'terminal', eventType: 'tool_call_started', title: 'Bash', createdAt: started.createdAt, payload: started.payload }
    expect(railStatusFor(startItem, [started])).toBe('pending')
    expect(railStatusFor(startItem, [started, finished])).toBe('completed')
    expect(railStatusFor({ ...startItem, relatedEventIds: [finished.id] }, [])).toBe('completed')
    const orphan: ComputerItem = { id: 'orphan', kind: 'terminal', eventType: 'tool_call_completed', title: 'Recovered', createdAt: '2026-07-16T00:00:02.000Z', payload: { toolUseId: 'gone' } }
    expect(railStatusFor(orphan, [])).toBe('completed')
    expect(railStatusFor({ ...orphan, payload: { toolUseId: 'gone', isError: true } }, [])).toBe('failed')
  })

  it('marks live surfaces pending and recorded evidence completed', () => {
    const frame: ComputerItem = { id: 'frame', kind: 'screenshot', title: 'X11 frame', createdAt: '2026-07-16T00:00:00.000Z' }
    expect(railStatusFor(frame, [])).toBe('completed')
    expect(railStatusFor({ ...frame, live: true }, [])).toBe('pending')
  })

  it('groups consecutive tool calls of one LLM turn with truthful aggregates', () => {
    const items = [
      tool('t1', 'run-a', '2026-07-16T00:00:00.000Z'),
      { ...tool('t2', 'run-a', '2026-07-16T00:00:01.000Z'), payload: { toolUseId: 't2', isError: true } },
      tool('t3', 'run-a', '2026-07-16T00:00:02.500Z'),
    ]
    const entries = toolCallGroupsFor(items, [])
    expect(entries).toHaveLength(1)
    const [group] = entries
    expect(isRailToolGroup(group)).toBe(true)
    if (isRailToolGroup(group)) {
      expect(group.id).toBe('turn-t1')
      expect(group.items.map((item) => item.id)).toEqual(['t1', 't2', 't3'])
      expect(group.failedCount).toBe(1)
      expect(group.pendingCount).toBe(2)
      expect(group.durationMs).toBe(2_500)
    }
  })

  it('starts a new group when assistant text evidence separates two tool calls', () => {
    const events = [
      event('t1', 'tool_call_started', { toolUseId: 't1' }),
      event('delta', 'assistant_text_delta', {}),
      event('t2', 'tool_call_started', { toolUseId: 't2' }),
      event('t3', 'tool_call_started', { toolUseId: 't3' }),
    ]
    const entries = toolCallGroupsFor([tool('t1'), tool('t2'), tool('t3')], events)
    expect(entries).toHaveLength(2)
    expect(isRailToolGroup(entries[0])).toBe(false)
    expect(isRailToolGroup(entries[1])).toBe(true)
    if (!isRailToolGroup(entries[0])) expect(entries[0].id).toBe('t1')
    if (isRailToolGroup(entries[1])) expect(entries[1].items.map((item) => item.id)).toEqual(['t2', 't3'])
  })

  it('never groups across run boundaries, non-tool evidence, or live surfaces', () => {
    expect(toolCallGroupsFor([tool('t1')], []).map((entry) => entry.id)).toEqual(['t1'])
    const acrossRuns = toolCallGroupsFor([tool('t1', 'run-a'), tool('t2', 'run-b')], [])
    expect(acrossRuns.every((entry) => !isRailToolGroup(entry))).toBe(true)
    const frame: ComputerItem = { id: 'frame', kind: 'screenshot', title: 'X11', createdAt: '2026-07-16T00:00:01.000Z', runId: 'run-a' }
    expect(toolCallGroupsFor([tool('t1'), frame, tool('t2')], []).map((entry) => entry.id)).toEqual(['t1', 'frame', 't2'])
    const live: ComputerItem = { ...tool('live-call'), live: true }
    expect(toolCallGroupsFor([tool('t1'), live, tool('t2')], []).every((entry) => !isRailToolGroup(entry))).toBe(true)
  })

  it('flattens entries into run dividers, group headers, and collapsible item rows', () => {
    const first = tool('t1', 'run-a')
    const group: RailToolGroup = { id: 'turn-t2', items: [tool('t2', 'run-a'), tool('t3', 'run-a')], failedCount: 0, pendingCount: 2 }
    const artifact: ComputerItem = { id: 'artifact', kind: 'file', title: 'README.md', createdAt: '2026-07-16T00:00:03.000Z', runId: 'run-b' }
    const rows = railRowsFor([first, group, artifact], new Set())
    expect(rows.map((row) => row.type)).toEqual(['run', 'item', 'group', 'item', 'item', 'run', 'item'])
    expect(rows.flatMap((row) => row.type === 'item' ? [row.depth] : [])).toEqual([0, 1, 1, 0])
    const collapsed = railRowsFor([first, group, artifact], new Set([group.id]))
    expect(collapsed.map((row) => row.type)).toEqual(['run', 'item', 'group', 'run', 'item'])
    expect(collapsed.some((row) => row.type === 'item' && row.depth === 1)).toBe(false)
  })
})
