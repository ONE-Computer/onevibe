import type { MilestoneDescriptor, RuntimeEvent } from '../types'

export type MilestoneStatus = 'pending' | 'active' | 'done'
export type MilestoneView = { id: string; label: string; status: MilestoneStatus }

const PHASE_IDS = ['understand', 'gather', 'draft', 'finalize'] as const

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined

const milestoneSetFrom = (event: RuntimeEvent): MilestoneDescriptor[] | undefined => {
  const milestones = recordValue(event.payload)?.milestones
  if (!Array.isArray(milestones) || milestones.length === 0) return undefined
  const parsed: MilestoneDescriptor[] = []
  for (const value of milestones) {
    const record = recordValue(value)
    if (!record || typeof record.id !== 'string' || typeof record.label !== 'string' || !record.id || !record.label) return undefined
    parsed.push({ id: record.id, label: record.label })
  }
  return parsed
}

const withActive = (views: MilestoneView[], runEnded: boolean): MilestoneView[] => {
  if (runEnded) return views
  const firstPending = views.find((view) => view.status === 'pending')
  if (!firstPending) return views
  return views.map((view) => view.id === firstPending.id ? { ...view, status: 'active' } : view)
}

// Path A: the runtime emitted an explicit milestone_set for this run.
const explicitMilestones = (events: RuntimeEvent[]): MilestoneView[] | undefined => {
  let descriptors: MilestoneDescriptor[] | undefined
  for (const event of events) {
    if (event.type !== 'milestone_set') continue
    const parsed = milestoneSetFrom(event)
    if (parsed) descriptors = parsed
  }
  if (!descriptors) return undefined
  const completed = new Set<string>()
  let runEnded = false
  let runFailed = false
  for (const event of events) {
    if (event.type === 'milestone_complete') {
      const id = recordValue(event.payload)?.id
      if (typeof id === 'string') completed.add(id)
    } else if (event.type === 'run_completed') {
      runEnded = true
    } else if (event.type === 'run_failed' || event.type === 'run_cancelled') {
      runFailed = true
    }
  }
  const views = descriptors.map((descriptor) => ({
    ...descriptor,
    status: (runEnded || completed.has(descriptor.id) ? 'done' : 'pending') as MilestoneStatus,
  }))
  return withActive(views, runEnded || runFailed)
}

// Path B: no explicit set, so derive the fixed four phases from the event stream.
const derivedMilestones = (events: RuntimeEvent[]): MilestoneView[] => {
  const counts = { started: 0, completed: 0 }
  let runStarted = false
  let runCompleted = false
  let runFailed = false
  let hasText = false
  for (const event of events) {
    if (event.type === 'run_started') runStarted = true
    else if (event.type === 'tool_call_started') counts.started += 1
    else if (event.type === 'tool_call_completed') counts.completed += 1
    else if (event.type === 'assistant_text_delta') hasText = true
    else if (event.type === 'run_completed') runCompleted = true
    else if (event.type === 'run_failed' || event.type === 'run_cancelled') runFailed = true
  }
  const understandDone = runStarted
  const gatherDone = counts.started > 0 ? counts.completed >= counts.started : hasText
  const draftDone = runCompleted
  const finalizeDone = runCompleted
  const done: Record<string, boolean> = { understand: understandDone, gather: gatherDone, draft: draftDone, finalize: finalizeDone }
  const runEnded = runCompleted || runFailed
  const views = PHASE_IDS.map((id) => ({ id, label: id, status: (runCompleted || done[id] ? 'done' : 'pending') as MilestoneStatus }))
  return withActive(views, runEnded)
}

export const milestonesFor = (events: readonly RuntimeEvent[]): MilestoneView[] => {
  if (events.length === 0) return []
  return explicitMilestones([...events]) ?? derivedMilestones([...events])
}
