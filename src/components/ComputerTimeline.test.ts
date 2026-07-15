import { describe, expect, it } from 'vitest'
import { terminalActivityFor } from './computer-timeline-activity'
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

  it('labels an error result for the operator', () => {
    const completed = event('event-finish', 'tool_call_completed', { toolUseId: 'tool-1', isError: true }, 'Permission denied')
    const activity = terminalActivityFor({ id: completed.id, kind: 'terminal', title: 'Tool result', createdAt: completed.createdAt, detail: completed.content, payload: completed.payload }, [completed])

    expect(activity.output).toBe('Permission denied')
    expect(activity.failed).toBe(true)
  })
})
