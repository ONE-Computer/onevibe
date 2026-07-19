import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import type { EventInput, EventLane, EventType, RunStatus } from './types.js'
import type { Task } from './types.js'
import { sanitizeNativePayload } from './native-events.js'
import { isRecord } from './util/is-record.js'
import { parseSseBlock } from './util/sse.js'

const normalize = (value: unknown): EventInput | null => {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  const allowedTypes = new Set<EventType>([
    'run_started', 'run_status_changed', 'user_message', 'assistant_text_delta', 'activity_delta',
    'tool_call_started', 'tool_call_progress', 'tool_call_completed', 'approval_requested', 'approval_resolved',
    'user_input_requested', 'user_input_resolved', 'artifact_created', 'artifact_updated', 'run_completed',
    'run_failed', 'run_cancelled',
  ])
  const allowedLanes = new Set<EventLane>(['transcript', 'activity', 'control', 'artifact', 'approval'])
  if (!allowedTypes.has(value.type as EventType)) return null
  const lane = allowedLanes.has(value.lane as EventLane) ? (value.lane as EventLane) : 'activity'
  return {
    type: value.type as EventType,
    lane,
    status: typeof value.status === 'string' ? (value.status as RunStatus) : undefined,
    label: typeof value.label === 'string' ? value.label : undefined,
    content: typeof value.content === 'string' ? value.content : undefined,
    payload: isRecord(value.payload) ? value.payload : { nativeEvent: value },
  }
}

export class RemoteRuntimeAdapter extends RuntimeAdapterBase {
  readonly name: string
  readonly providerId: Task['provider']
  readonly capabilities = ['streaming', 'tool_use', 'file_system'] as const

  constructor(private readonly endpoint: string, private readonly bearerToken?: string, providerId: Task['provider'] = 'remote', name = 'remote') {
    super()
    this.providerId = providerId
    this.name = name
  }

  protected async execute({ task, store, signal, prompt, executionId, providerRequestId }: LegacyRuntimeContext) {
    signal.throwIfAborted()
    await store.updateTask(task.id, { status: 'running' })
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
        'X-OneVibe-Execution-Id': executionId,
        'X-OneVibe-Provider-Request-Id': providerRequestId,
      },
      body: JSON.stringify({
        provider: this.providerId === 'agentcore' ? 'agentcore' : 'claude_agentcore',
        prompt,
        userId: 'local-onevibe-user',
        projectId: 'onevibe-local',
        runId: executionId,
        executionId,
        providerRequestId,
        providerIdempotencyProven: false,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)]),
    })
    if (!response.ok || !response.body) throw new Error(`Remote runtime returned HTTP ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let sourceSequence = 0
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const frame = parseSseBlock(block)
        if (!frame || frame.event !== 'runtime_event') continue
        const event = normalize(frame.data)
        if (event) {
          const candidate = isRecord(frame.data) && typeof frame.data.id === 'string' ? frame.data.id : `${frame.event}:${sourceSequence}`
          await store.ingestNativeEvent(task.id, {
            source: this.providerId === 'agentcore' ? 'agentcore_runtime' : 'remote_runtime', sourceEventId: candidate, sourceSequence, nativeType: event.type,
            payload: sanitizeNativePayload(frame.data), projections: [event],
          })
          sourceSequence += 1
        }
      }
      if (done) break
    }
    const last = store.listEvents(task.id).at(-1)
    if (last?.type !== 'run_completed' && last?.type !== 'run_failed' && last?.type !== 'run_cancelled') {
      await store.appendEvent(task.id, {
        type: 'run_failed', lane: 'control', status: 'failed', label: 'Remote stream ended without a terminal event',
        content: 'The configured runtime stream ended without a terminal normalized event. The provider outcome is unknown; do not retry automatically.', payload: { executionRoute: 'remote_sse', executionId, providerRequestId, providerState: 'unknown', providerIdempotencyProven: false, reconciliationRequired: true },
      })
      await store.updateTask(task.id, { status: 'failed' })
      return
    }
    await store.updateTask(task.id, { status: 'completed' })
  }
}
