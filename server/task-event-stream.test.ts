import { describe, expect, it } from 'vitest'
import { encodeRuntimeEventFrame, eventsAfterLastEventId } from './task-event-stream.js'
import type { RuntimeEvent } from './types.js'

const event = (sequence: number): RuntimeEvent => ({
  id: `task_a:event:${sequence}`, taskId: 'task_a', runId: 'turn_a', sequence, type: 'activity_delta', lane: 'activity', payload: {}, createdAt: `2026-07-16T00:00:0${sequence}.000Z`, previousHash: sequence ? `hash-${sequence - 1}` : 'GENESIS', eventHash: `hash-${sequence}`,
})

describe('task event stream replay', () => {
  it('emits browser-resumable SSE ids', () => {
    expect(encodeRuntimeEventFrame(event(2))).toMatch(/^id: task_a:event:2\nevent: runtime_event\ndata: /)
  })

  it('replays only events after the browser Last-Event-ID', () => {
    expect(eventsAfterLastEventId([event(0), event(1), event(2)], 'task_a', 'task_a:event:1').map((item) => item.sequence)).toEqual([2])
  })

  it('rejects malformed and cross-task replay cursors', () => {
    expect(() => eventsAfterLastEventId([event(0)], 'task_a', 'task_b:event:0')).toThrow(/another task/)
    expect(() => eventsAfterLastEventId([event(0)], 'task_a', 'task_a:event:nope')).toThrow(/invalid/)
  })
})
