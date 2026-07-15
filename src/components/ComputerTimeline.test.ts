import { describe, expect, it } from 'vitest'
import { activityPreviewFor, artifactRailItems, causalVisualItemsFor, commandFor, compareRunArtifacts, defaultComputerItem, evidenceItemId, filterItemsByRun, formatDuration, formatInspectable, matchesRailQuery, presentationItems, runIdsFor, runLabel, summarizeRunEvidence, terminalActivityFor, virtualRailRange, type ComputerItem } from './computer-timeline-activity'
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
    expect(command).toBe('API_KEY=<redacted> node <host-path> --token=<redacted>')
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
    const terminal: ComputerItem = { id: 'terminal', kind: 'terminal', title: 'Write source', createdAt: '2026-07-16T00:00:01.000Z' }
    const preview: ComputerItem = { id: 'preview', kind: 'preview', title: 'Interactive preview', createdAt: '2026-07-16T00:00:02.000Z' }
    const control: ComputerItem = { id: 'control', kind: 'approval', title: 'Approval pending', createdAt: '2026-07-16T00:00:03.000Z' }
    expect(defaultComputerItem([terminal, preview, control], true)?.id).toBe('preview')
    expect(defaultComputerItem([terminal, preview, control], false)?.id).toBe('control')
  })

  it('windows a long rail while retaining an overscan buffer for smooth scrolling', () => {
    expect(virtualRailRange(10_000, 68 * 500, 340)).toEqual({ start: 488, end: 517 })
    expect(virtualRailRange(3, 0, 340)).toEqual({ start: 0, end: 3 })
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
