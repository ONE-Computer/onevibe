import type { RuntimeEvent } from './types.js'

export const encodeRuntimeEventFrame = (event: RuntimeEvent) =>
  `id: ${event.id}\nevent: runtime_event\ndata: ${JSON.stringify(event)}\n\n`

type ReplayLiveHandoffOptions = {
  replay: () => readonly RuntimeEvent[]
  subscribe: (listener: (event: RuntimeEvent) => void) => () => void
  send: (event: RuntimeEvent) => void
}

/**
 * Subscribe before reading replay so events appended during setup are buffered
 * and delivered after the replay. The replay callback remains responsible for
 * validating any task-bound cursor before it reads the event history.
 */
export const openReplayLiveHandoff = ({ replay, subscribe, send }: ReplayLiveHandoffOptions) => {
  let phase: 'replay' | 'drain' | 'live' = 'replay'
  let closed = false
  const deliveredIds = new Set<string>()
  const pending: RuntimeEvent[] = []

  const deliver = (event: RuntimeEvent) => {
    if (closed || deliveredIds.has(event.id)) return
    deliveredIds.add(event.id)
    send(event)
  }

  const unsubscribe = subscribe((event) => {
    if (phase !== 'live') pending.push(event)
    else deliver(event)
  })

  try {
    for (const event of replay()) deliver(event)
    phase = 'drain'
    for (let index = 0; index < pending.length; index += 1) deliver(pending[index])
    pending.length = 0
    phase = 'live'
  } catch (error) {
    closed = true
    pending.length = 0
    unsubscribe()
    throw error
  }

  return () => {
    if (closed) return
    closed = true
    pending.length = 0
    unsubscribe()
  }
}

export const eventsAfterLastEventId = (events: RuntimeEvent[], taskId: string, lastEventId?: string) => {
  if (!lastEventId) return events
  const prefix = `${taskId}:event:`
  if (!lastEventId.startsWith(prefix)) throw new RangeError('Task event cursor is invalid or belongs to another task')
  const sequence = Number(lastEventId.slice(prefix.length))
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError('Task event cursor is invalid or belongs to another task')
  return events.filter((event) => event.sequence > sequence)
}
