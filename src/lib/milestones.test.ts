import { describe, expect, it } from 'vitest'
import { milestonesFor } from './milestones'
import type { RuntimeEvent } from '../types'

const event = (sequence: number, type: RuntimeEvent['type'], payload: Record<string, unknown> = {}): RuntimeEvent => ({
  id: `task-1:event:${sequence}`,
  taskId: 'task-1',
  sequence,
  type,
  lane: 'activity',
  payload,
  createdAt: `2026-07-16T00:00:${String(sequence).padStart(2, '0')}.000Z`,
  previousHash: 'previous',
  eventHash: `hash-${sequence}`,
})

const statuses = (events: RuntimeEvent[]) => milestonesFor(events).map((milestone) => `${milestone.id}:${milestone.status}`)

const setPayload = (milestones: Array<{ id: string; label: string }>) => ({ milestones })

describe('milestonesFor', () => {
  it('returns no milestones without events', () => {
    expect(milestonesFor([])).toEqual([])
  })

  it('derives understand as done and gather as active after run_started', () => {
    expect(statuses([event(0, 'run_started')])).toEqual(['understand:done', 'gather:active', 'draft:pending', 'finalize:pending'])
  })

  it('keeps gather active while a tool call is running', () => {
    const events = [event(0, 'run_started'), event(1, 'tool_call_started', { toolUseId: 'tool_1' })]
    expect(statuses(events)).toEqual(['understand:done', 'gather:active', 'draft:pending', 'finalize:pending'])
  })

  it('advances to draft once tools settle and text is streaming', () => {
    const events = [
      event(0, 'run_started'),
      event(1, 'tool_call_started', { toolUseId: 'tool_1' }),
      event(2, 'tool_call_completed', { toolUseId: 'tool_1' }),
      event(3, 'assistant_text_delta'),
    ]
    expect(statuses(events)).toEqual(['understand:done', 'gather:done', 'draft:active', 'finalize:pending'])
  })

  it('marks every phase done at run_completed', () => {
    const events = [
      event(0, 'run_started'),
      event(1, 'tool_call_started', { toolUseId: 'tool_1' }),
      event(2, 'tool_call_completed', { toolUseId: 'tool_1' }),
      event(3, 'assistant_text_delta'),
      event(4, 'run_completed'),
    ]
    expect(statuses(events)).toEqual(['understand:done', 'gather:done', 'draft:done', 'finalize:done'])
  })

  it('shows no active phase after run_failed or run_cancelled', () => {
    expect(statuses([event(0, 'run_started'), event(1, 'run_failed')])).toEqual(['understand:done', 'gather:pending', 'draft:pending', 'finalize:pending'])
    expect(statuses([event(0, 'run_started'), event(1, 'run_cancelled')])).toEqual(['understand:done', 'gather:pending', 'draft:pending', 'finalize:pending'])
  })

  it('uses an explicit milestone_set with milestone_complete progress', () => {
    const events = [
      event(0, 'milestone_set', setPayload([{ id: 'plan', label: 'Plan the answer' }, { id: 'write', label: 'Write the answer' }, { id: 'ship', label: 'Ship it' }])),
      event(1, 'milestone_complete', { id: 'plan' }),
    ]
    const milestones = milestonesFor(events)
    expect(milestones.map((milestone) => `${milestone.id}:${milestone.status}`)).toEqual(['plan:done', 'write:active', 'ship:pending'])
    expect(milestones[1]?.label).toBe('Write the answer')
  })

  it('lets the latest valid milestone_set win', () => {
    const events = [
      event(0, 'milestone_set', setPayload([{ id: 'a', label: 'First draft of phases' }, { id: 'b', label: 'Superseded' }])),
      event(1, 'milestone_set', setPayload([{ id: 'c', label: 'Current step one' }, { id: 'd', label: 'Current step two' }])),
      event(2, 'milestone_complete', { id: 'c' }),
    ]
    expect(statuses(events)).toEqual(['c:done', 'd:active'])
  })

  it('marks every explicit milestone done at run_completed', () => {
    const events = [
      event(0, 'milestone_set', setPayload([{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }])),
      event(1, 'run_completed'),
    ]
    expect(statuses(events)).toEqual(['a:done', 'b:done'])
  })

  it('falls back to derived phases when the milestone_set payload is malformed', () => {
    const badEntries = [event(0, 'run_started'), event(1, 'milestone_set', { milestones: [{ id: 'x' }] })]
    expect(statuses(badEntries)).toEqual(['understand:done', 'gather:active', 'draft:pending', 'finalize:pending'])
    const notAnArray = [event(0, 'run_started'), event(1, 'milestone_set', { milestones: 42 })]
    expect(statuses(notAnArray)).toEqual(['understand:done', 'gather:active', 'draft:pending', 'finalize:pending'])
  })
})
