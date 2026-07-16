import type { RuntimeEvent } from '../types'

/** Keep the conversation surface calm without changing the immutable ledger. */
export const runtimeCheckpointEventsFor = (events: RuntimeEvent[]) => events.filter((event) => (
  event.lane !== 'transcript' &&
  event.lane !== 'approval' &&
  event.lane !== 'artifact' &&
  !event.type.startsWith('tool_call') &&
  event.label !== 'X11 evidence capture unavailable'
))

export const visualCaptureFailureCountFor = (events: RuntimeEvent[]) => events.filter((event) => event.label === 'X11 evidence capture unavailable').length
