import type { RuntimeEvent } from './types.js'

export const encodeRuntimeEventFrame = (event: RuntimeEvent) =>
  `id: ${event.id}\nevent: runtime_event\ndata: ${JSON.stringify(event)}\n\n`

export const eventsAfterLastEventId = (events: RuntimeEvent[], taskId: string, lastEventId?: string) => {
  if (!lastEventId) return events
  const prefix = `${taskId}:event:`
  if (!lastEventId.startsWith(prefix)) throw new RangeError('Task event cursor is invalid or belongs to another task')
  const sequence = Number(lastEventId.slice(prefix.length))
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new RangeError('Task event cursor is invalid or belongs to another task')
  return events.filter((event) => event.sequence > sequence)
}
