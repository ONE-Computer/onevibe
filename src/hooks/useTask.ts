import { useCallback, useEffect, useRef, useState } from 'react'
import { getTask } from '../lib/api'
import type { RuntimeEvent, TaskSnapshot } from '../types'
import { createRefreshScheduler } from './refresh-scheduler'

const terminalStatuses = new Set<TaskSnapshot['status']>(['completed', 'failed', 'cancelled'])
export const streamInterruptionMessage = (status: TaskSnapshot['status'] | undefined) => status && terminalStatuses.has(status) ? null : 'Live task connection interrupted. Retrying…'
export const appendRuntimeEvent = (snapshot: TaskSnapshot, event: RuntimeEvent): TaskSnapshot => {
  if (snapshot.events.some((candidate) => candidate.id === event.id)) return snapshot
  return { ...snapshot, status: event.status ?? snapshot.status, events: [...snapshot.events, event] }
}
export const mergeRuntimeEventsIntoSnapshot = (snapshot: TaskSnapshot, events: readonly RuntimeEvent[]) => events.reduce(appendRuntimeEvent, snapshot)

export const useTask = (taskId: string | null) => {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const pendingEvents = useRef<RuntimeEvent[]>([])
  const status = useRef<TaskSnapshot['status'] | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!taskId) return
    const next = await getTask(taskId)
    next.events.forEach((event) => seen.current.add(event.id))
    setSnapshot(() => {
      const merged = mergeRuntimeEventsIntoSnapshot(next, pendingEvents.current.splice(0))
      status.current = merged.status
      return merged
    })
    return next
  }, [taskId])

  useEffect(() => {
    seen.current = new Set()
    pendingEvents.current = []
    status.current = undefined
    setSnapshot(null)
    setError(null)
    if (!taskId) return
    let disposed = false
    const stream = new EventSource(`/api/tasks/${taskId}/events`)
    const scheduler = createRefreshScheduler(refresh)
    scheduler.run().then(() => {
      const next = status.current
      if (next && terminalStatuses.has(next)) {
        stream.close()
        setConnected(false)
        setError(null)
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
    stream.onopen = () => { setConnected(true); setError(null); void scheduler.run() }
    stream.onerror = () => {
      setConnected(false)
      if (!disposed) setError(streamInterruptionMessage(status.current))
    }
    stream.addEventListener('runtime_event', (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as RuntimeEvent
      if (seen.current.has(event.id)) return
      seen.current.add(event.id)
      if (event.status) status.current = event.status
      setSnapshot((current) => {
        if (!current) {
          pendingEvents.current.push(event)
          return current
        }
        return appendRuntimeEvent(current, event)
      })
      void scheduler.run().catch(() => undefined)
      if (event.status && terminalStatuses.has(event.status)) {
        stream.close()
        setConnected(false)
        setError(null)
      }
    })
    return () => {
      disposed = true
      scheduler.dispose()
      stream.close()
      setConnected(false)
    }
  }, [refresh, taskId])

  return { snapshot, connected, error, refresh }
}
