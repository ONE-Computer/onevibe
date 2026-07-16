import { describe, expect, it, vi } from 'vitest'
import { encodeRuntimeEventFrame, eventsAfterLastEventId, openReplayLiveHandoff } from './task-event-stream.js'
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

  it('does not lose an event appended while replay is being read', () => {
    const delivered: number[] = []
    let liveListener: ((item: RuntimeEvent) => void) | undefined
    const unsubscribe = vi.fn()

    const close = openReplayLiveHandoff({
      replay: () => {
        liveListener?.(event(2))
        return [event(0), event(1)]
      },
      subscribe: (listener) => {
        liveListener = listener
        return unsubscribe
      },
      send: (item) => delivered.push(item.sequence),
    })

    expect(delivered).toEqual([0, 1, 2])
    close()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('keeps replay/live delivery ordered and duplicate-free at the handoff', () => {
    const delivered: number[] = []
    let liveListener: ((item: RuntimeEvent) => void) | undefined

    openReplayLiveHandoff({
      replay: () => {
        liveListener?.(event(1))
        liveListener?.(event(2))
        return [event(0), event(1)]
      },
      subscribe: (listener) => {
        liveListener = listener
        return () => undefined
      },
      send: (item) => delivered.push(item.sequence),
    })

    expect(delivered).toEqual([0, 1, 2])
  })

  it('rejects malformed and cross-task replay cursors', () => {
    expect(() => eventsAfterLastEventId([event(0)], 'task_a', 'task_b:event:0')).toThrow(/another task/)
    expect(() => eventsAfterLastEventId([event(0)], 'task_a', 'task_a:event:nope')).toThrow(/invalid/)
  })
})
