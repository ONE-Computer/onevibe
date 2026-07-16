import { describe, expect, it } from 'vitest'
import type { RuntimeEvent } from '../types'
import { runtimeCheckpointEventsFor, visualCaptureFailureCountFor } from './task-timeline-projection'

const event = (id: string, type: string, lane: RuntimeEvent['lane'], label?: string): RuntimeEvent => ({
  id, taskId: 'task-1', sequence: 1, type, lane, label, payload: {},
  createdAt: '2026-07-16T00:00:00.000Z', previousHash: 'previous', eventHash: id,
})

describe('conversation runtime checkpoint projection', () => {
  it('leaves tool and artifact detail to the dedicated Computer rail', () => {
    const events = [
      event('run', 'run_started', 'control', 'ONEComputer sandbox execution started'),
      event('tool-start', 'tool_call_started', 'activity', 'Read'),
      event('tool-finish', 'tool_call_completed', 'activity', 'Tool result'),
      event('artifact', 'artifact_created', 'artifact', 'Sandbox deliverable'),
      event('ready', 'activity_delta', 'control', 'ONEComputer sandbox ready'),
    ]

    expect(runtimeCheckpointEventsFor(events).map((item) => item.id)).toEqual(['run', 'ready'])
  })

  it('collapses repeated visual capture failures into one digest row', () => {
    const events = [
      event('failure-1', 'activity_delta', 'activity', 'X11 evidence capture unavailable'),
      event('failure-2', 'activity_delta', 'activity', 'X11 evidence capture unavailable'),
      event('completed', 'run_completed', 'control', 'Task completed'),
    ]

    expect(visualCaptureFailureCountFor(events)).toBe(2)
    expect(runtimeCheckpointEventsFor(events).map((item) => item.id)).toEqual(['completed'])
  })
})
