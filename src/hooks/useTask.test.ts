import { describe, expect, it } from 'vitest'
import { appendRuntimeEvent, mergeRuntimeEventsIntoSnapshot, reconnectDelayMs, reconnectExhaustedMessage, streamInterruptionMessage } from './useTask'
import type { RuntimeEvent, TaskSnapshot } from '../types'

const snapshot = (events: RuntimeEvent[] = []): TaskSnapshot => ({
  id: 'task_test', title: 'Test', prompt: 'hello', provider: 'demo', mode: 'chat', skills: [], tags: [], queuedGuidance: [], projectId: 'project_onevibe', references: [], attachments: [], status: 'running', plan: [], createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z', events, files: [], messages: [],
})
const event = (id: string, sequence: number, status: RuntimeEvent['status'] = 'running'): RuntimeEvent => ({
  id, taskId: 'task_test', sequence, type: 'activity_delta', lane: 'activity', status, label: 'Buffered', content: 'buffered', payload: {}, createdAt: '2026-07-16T00:00:01.000Z', previousHash: 'prev', eventHash: id,
})

describe('task stream connection semantics', () => {
  it('does not portray a completed history record as a broken live stream', () => {
    expect(streamInterruptionMessage('completed')).toBeNull()
    expect(streamInterruptionMessage('failed')).toBeNull()
    expect(streamInterruptionMessage('cancelled')).toBeNull()
  })

  it('warns when an active conversation stream is interrupted', () => {
    expect(streamInterruptionMessage('running')).toMatch(/interrupted/i)
    expect(streamInterruptionMessage('waiting_for_user_input')).toMatch(/interrupted/i)
  })

  it('replays events received before the REST snapshot without duplication', () => {
    const first = event('event_1', 1)
    const completed = event('event_2', 2, 'completed')
    const merged = mergeRuntimeEventsIntoSnapshot(snapshot(), [first, completed, first])
    expect(merged.events.map((item) => item.id)).toEqual(['event_1', 'event_2'])
    expect(merged.status).toBe('completed')
  })

  it('does not append a live event already persisted in the snapshot', () => {
    const persisted = event('event_1', 1)
    const current = appendRuntimeEvent(snapshot([persisted]), persisted)
    expect(current.events).toHaveLength(1)
  })

  it('uses bounded exponential reconnect delays and an explicit exhausted state', () => {
    expect([0, 1, 2, 3, 4].map(reconnectDelayMs)).toEqual([500, 1_000, 2_000, 4_000, 8_000])
    expect(reconnectExhaustedMessage).toMatch(/5 retries/i)
  })
})
