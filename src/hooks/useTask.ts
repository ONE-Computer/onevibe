import { useCallback, useEffect, useRef, useState } from 'react'
import { getTask } from '../lib/api'
import type { RuntimeEvent, TaskSnapshot } from '../types'

export const useTask = (taskId: string | null) => {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seen = useRef(new Set<string>())

  const refresh = useCallback(async () => {
    if (!taskId) return
    const next = await getTask(taskId)
    next.events.forEach((event) => seen.current.add(event.id))
    setSnapshot(next)
  }, [taskId])

  useEffect(() => {
    seen.current = new Set()
    setSnapshot(null)
    setError(null)
    if (!taskId) return
    let disposed = false
    refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
    const stream = new EventSource(`/api/tasks/${taskId}/events`)
    stream.onopen = () => setConnected(true)
    stream.onerror = () => {
      setConnected(false)
      if (!disposed) setError('Live task connection interrupted. Retrying…')
    }
    stream.addEventListener('runtime_event', (message) => {
      const event = JSON.parse((message as MessageEvent<string>).data) as RuntimeEvent
      if (seen.current.has(event.id)) return
      seen.current.add(event.id)
      setSnapshot((current) => current ? { ...current, status: event.status ?? current.status, events: [...current.events, event] } : current)
      refresh().catch(() => undefined)
    })
    return () => {
      disposed = true
      stream.close()
      setConnected(false)
    }
  }, [refresh, taskId])

  return { snapshot, connected, error, refresh }
}
