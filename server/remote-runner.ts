import type { RuntimeAdapter, RuntimeContext } from './runtime-adapter.js'
import type { EventInput, EventLane, EventType, RunStatus } from './types.js'

type SseFrame = { event: string; data: unknown }

const parseBlock = (block: string): SseFrame | null => {
  const lines = block.split('\n')
  let event = 'message'
  const data: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (!data.length) return null
  const raw = data.join('\n')
  try {
    return { event, data: JSON.parse(raw) as unknown }
  } catch {
    return { event, data: raw }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

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

export class RemoteRuntimeAdapter implements RuntimeAdapter {
  readonly name = 'remote'

  constructor(private readonly endpoint: string, private readonly bearerToken?: string) {}

  async run({ task, store, signal, prompt }: RuntimeContext) {
    signal.throwIfAborted()
    await store.updateTask(task.id, { status: 'running' })
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify({
        provider: 'claude_agentcore',
        prompt,
        userId: 'local-onevibe-user',
        projectId: 'onevibe-local',
        runId: task.id,
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)]),
    })
    if (!response.ok || !response.body) throw new Error(`Remote runtime returned HTTP ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const frame = parseBlock(block)
        if (!frame || frame.event !== 'runtime_event') continue
        const event = normalize(frame.data)
        if (event) await store.appendEvent(task.id, event)
      }
      if (done) break
    }
    const last = store.listEvents(task.id).at(-1)
    if (last?.type !== 'run_completed' && last?.type !== 'run_failed' && last?.type !== 'run_cancelled') {
      await store.appendEvent(task.id, {
        type: 'run_completed', lane: 'control', status: 'completed', label: 'Remote stream closed',
        content: 'The configured runtime completed without a terminal normalized event.', payload: { executionRoute: 'remote_sse' },
      })
    }
    await store.updateTask(task.id, { status: 'completed' })
  }
}
