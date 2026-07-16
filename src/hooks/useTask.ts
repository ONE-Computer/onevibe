import { useCallback, useEffect, useRef, useState } from 'react'
import { getTask } from '../lib/api'
import type { RuntimeEvent, TaskSnapshot } from '../types'
import { createRefreshScheduler } from './refresh-scheduler'

const terminalStatuses = new Set<TaskSnapshot['status']>(['completed', 'failed', 'cancelled'])
const MAX_RECONNECT_ATTEMPTS = 5
export const reconnectDelayMs = (attempt: number) => Math.min(500 * (2 ** Math.max(0, attempt)), 8_000)
export const reconnectExhaustedMessage = `Live task connection lost after ${MAX_RECONNECT_ATTEMPTS} retries. Click retry to reconnect.`
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
  const pendingUiEvents = useRef<RuntimeEvent[]>([])
  const snapshotReady = useRef(false)
  const status = useRef<TaskSnapshot['status'] | undefined>(undefined)
  const [retryGeneration, setRetryGeneration] = useState(0)

  const refresh = useCallback(async () => {
    if (!taskId) return
    const next = await getTask(taskId)
    next.events.forEach((event) => seen.current.add(event.id))
    setSnapshot(() => {
      const merged = mergeRuntimeEventsIntoSnapshot(next, [...pendingEvents.current.splice(0), ...pendingUiEvents.current.splice(0)])
      status.current = merged.status
      snapshotReady.current = true
      return merged
    })
    return next
  }, [taskId])

  useEffect(() => {
    seen.current = new Set()
    pendingEvents.current = []
    pendingUiEvents.current = []
    snapshotReady.current = false
    status.current = undefined
    setSnapshot(null)
    setError(null)
    if (!taskId) return
    let disposed = false
    let activeStream: EventSource | undefined
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let frameHandle: number | ReturnType<typeof setTimeout> | undefined
    let frameUsesAnimationFrame = false
    let reconnectAttempt = 0
    const scheduler = createRefreshScheduler(refresh)
    const closeStream = () => {
      activeStream?.close()
      activeStream = undefined
    }
    const flushUiEvents = () => {
      frameHandle = undefined
      frameUsesAnimationFrame = false
      const queued = pendingUiEvents.current.splice(0)
      if (!queued.length) return
      setSnapshot((current) => current ? mergeRuntimeEventsIntoSnapshot(current, queued) : current)
    }
    const scheduleUiFlush = () => {
      if (frameHandle !== undefined) return
      if (typeof window.requestAnimationFrame === 'function') {
        frameUsesAnimationFrame = true
        frameHandle = window.requestAnimationFrame(flushUiEvents)
      } else {
        frameHandle = setTimeout(flushUiEvents, 16)
      }
    }
    const connect = () => {
      if (disposed) return
      closeStream()
      const nextStream = new EventSource(`/api/tasks/${taskId}/events`)
      activeStream = nextStream
      nextStream.onopen = () => {
        if (activeStream !== nextStream) return
        reconnectAttempt = 0
        setConnected(true)
        setError(null)
        void scheduler.run()
      }
      nextStream.onerror = () => {
        if (activeStream !== nextStream) return
        closeStream()
        setConnected(false)
        if (disposed || (status.current && terminalStatuses.has(status.current))) return
        if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
          setError(reconnectExhaustedMessage)
          return
        }
        const delay = reconnectDelayMs(reconnectAttempt)
        reconnectAttempt += 1
        setError(`Live task connection interrupted. Retrying in ${Math.ceil(delay / 1000)}s…`)
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          connect()
        }, delay)
      }
      nextStream.addEventListener('runtime_event', (message) => {
        if (activeStream !== nextStream) return
        const event = JSON.parse((message as MessageEvent<string>).data) as RuntimeEvent
        if (seen.current.has(event.id)) return
        seen.current.add(event.id)
        if (event.status) status.current = event.status
        if (!snapshotReady.current) pendingEvents.current.push(event)
        else {
          pendingUiEvents.current.push(event)
          scheduleUiFlush()
        }
        void scheduler.run().catch(() => undefined)
        if (event.status && terminalStatuses.has(event.status)) {
          closeStream()
          setConnected(false)
          setError(null)
        }
      })
    }
    connect()
    scheduler.run().then(() => {
      const next = status.current
      if (next && terminalStatuses.has(next)) {
        closeStream()
        setConnected(false)
        setError(null)
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
    return () => {
      disposed = true
      scheduler.dispose()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (frameHandle !== undefined) {
        if (frameUsesAnimationFrame && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameHandle as number)
        else clearTimeout(frameHandle as ReturnType<typeof setTimeout>)
        frameHandle = undefined
      }
      closeStream()
      setConnected(false)
    }
  }, [refresh, retryGeneration, taskId])

  return { snapshot, connected, error, refresh, retry: () => setRetryGeneration((value) => value + 1) }
}
