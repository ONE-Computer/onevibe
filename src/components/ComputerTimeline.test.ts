import { describe, expect, it } from 'vitest'
import { activityPreviewFor, artifactRailItems, causalVisualItemsFor, evidenceItemId, formatDuration, terminalActivityFor, type ComputerItem } from './computer-timeline-activity'
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
})
