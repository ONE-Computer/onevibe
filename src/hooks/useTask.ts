import { useCallback, useEffect, useRef, useState } from 'react'
import { getTask } from '../lib/api'
import type { RuntimeEvent, TaskSnapshot } from '../types'
import { createRefreshScheduler } from './refresh-scheduler'

const terminalStatuses = new Set<TaskSnapshot['status']>(['completed', 'failed', 'cancelled'])
export const streamInterruptionMessage = (status: TaskSnapshot['status'] | undefined) => status && terminalStatuses.has(status) ? null : 'Live task connection interrupted. Retrying…'

export const useTask = (taskId: string | null) => {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef(new Set<string>())
  const status = useRef<TaskSnapshot['status'] | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!taskId) return
    const next = await getTask(taskId)
    next.events.forEach((event) => seen.current.add(event.id))
    status.current = next.status
    setSnapshot(next)
    return next
  }, [taskId])

  useEffect(() => {
    seen.current = new Set()
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
      setSnapshot((current) => current ? { ...current, status: event.status ?? current.status, events: [...current.events, event] } : current)
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
