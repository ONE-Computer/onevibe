import { randomUUID } from 'node:crypto'
import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import type { EventInput, RunStatus, Task } from './types.js'
import { sanitizeNativePayload } from './native-events.js'

/**
 * A2A (Agent-to-Agent) JSON-RPC 2.0 runtime adapter.
 *
 * Discovery: GET {baseUrl}/.well-known/agent.json (Agent Card) backs health().
 * Execution: POST {baseUrl} with message/stream, consuming the SSE stream of
 * TaskStatusUpdateEvent / TaskArtifactUpdateEvent frames and projecting them
 * into the durable RuntimeEvent ledger. input-required is routed through the
 * existing UserInputBroker and the task is continued with the server-assigned
 * A2A task id carried in message.taskId.
 *
 * Wire format source of truth: docs/A2A-SPIKE.md (P13-03 live captures against
 * a2a-sdk 0.2.16). Every published a2a-sdk dispatches message/send +
 * message/stream; the draft-era tasks/sendSubscribe with a client-supplied
 * params.id does not exist on real servers (JSON-RPC -32601).
 */

type A2aMapped = {
  events: EventInput[]
  /** A2A task state when the frame carries a task status. */
  state?: string
  /** True when the remote marks this status frame as the last for the stream. */
  final?: boolean
  /** Prompt text carried by an input-required status message. */
  inputPrompt?: string
  /** JSON-RPC error message when the frame is an error response. */
  error?: string
  /** Server-assigned A2A task id, when the frame carries one. */
  taskId?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Concatenates the text of A2A message/artifact parts; non-text parts are skipped. */
export const textFromA2aParts = (parts: unknown): string => {
  if (!Array.isArray(parts)) return ''
  const texts: string[] = []
  for (const part of parts) {
    if (!isRecord(part)) continue
    const kind = typeof part.kind === 'string' ? part.kind : typeof part.type === 'string' ? part.type : undefined
    if (kind === 'text' && typeof part.text === 'string') texts.push(part.text)
  }
  return texts.join('')
}

const textDelta = (content: string): EventInput => ({ type: 'assistant_text_delta', lane: 'transcript', content, payload: {} })

/**
 * Maps one A2A SSE data payload (a JSON-RPC response carrying a
 * TaskStatusUpdateEvent, TaskArtifactUpdateEvent, or Task result) onto durable
 * RuntimeEvent projections. Pure and exported for contract tests.
 */
export const mapA2aStreamEvent = (value: unknown): A2aMapped => {
  if (!isRecord(value)) return { events: [] }
  if (isRecord(value.error)) {
    const message = typeof value.error.message === 'string' ? value.error.message : 'The A2A endpoint returned a JSON-RPC error.'
    return { events: [{ type: 'run_failed', lane: 'control', status: 'failed', label: 'A2A task failed', content: message, payload: {} }], state: 'failed', final: true, error: message }
  }
  const result = isRecord(value.result) ? value.result : value
  const kind = typeof result.kind === 'string' ? result.kind : undefined
  // The server assigns the A2A task id: Task frames carry it as `id`, event frames as `taskId`.
  const taskId = typeof result.taskId === 'string' ? result.taskId : kind === 'task' && typeof result.id === 'string' ? result.id : undefined

  if (kind === 'artifact-update') {
    const artifact = isRecord(result.artifact) ? result.artifact : undefined
    const text = textFromA2aParts(artifact?.parts)
    const events: EventInput[] = text ? [textDelta(text)] : []
    const name = typeof artifact?.name === 'string' ? artifact.name : undefined
    if (name && result.lastChunk === true) {
      events.push({ type: 'artifact_created', lane: 'artifact', label: name, payload: { a2aArtifact: name } })
    }
    return { events, taskId }
  }

  // TaskStatusUpdateEvent, or the initial Task object returned by message/stream.
  const status = isRecord(result.status) ? result.status : undefined
  if (!status || (kind !== undefined && kind !== 'status-update' && kind !== 'task')) return { events: [], taskId }
  const state = typeof status.state === 'string' ? status.state : 'unknown'
  const final = result.final === true
  const messageText = isRecord(status.message) ? textFromA2aParts(status.message.parts) : ''
  const deltas: EventInput[] = messageText && state !== 'input-required' ? [textDelta(messageText)] : []

  switch (state) {
    case 'submitted':
    case 'working':
      return { events: deltas, state, final, taskId }
    case 'input-required':
      return { events: [], state, final: true, inputPrompt: messageText || 'The A2A agent requested additional input.', taskId }
    case 'completed':
      return { events: [...deltas, { type: 'run_completed', lane: 'control', status: 'completed', label: 'A2A task completed', payload: {} }], state, final: true, taskId }
    case 'canceled':
      return { events: [...deltas, { type: 'run_cancelled', lane: 'control', status: 'cancelled', label: 'A2A task canceled', content: messageText || undefined, payload: {} }], state, final: true, taskId }
    case 'failed':
      return { events: [{ type: 'run_failed', lane: 'control', status: 'failed', label: 'A2A task failed', content: messageText || 'The A2A agent reported a failed task state.', payload: {} }], state, final: true, taskId }
    default:
      return { events: [{ type: 'run_failed', lane: 'control', status: 'failed', label: 'A2A task failed', content: `The A2A agent reported an unhandled task state: ${state}.`, payload: {} }], state, final: true, taskId }
  }
}

type SseFrame = { event: string; data: unknown }

const parseSseBlock = (block: string): SseFrame | null => {
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

const MAX_INPUT_ROUNDS = 8

export class A2aRuntimeAdapter extends RuntimeAdapterBase {
  readonly name = 'a2a'
  readonly providerId: Task['provider'] = 'a2a'
  readonly capabilities = ['streaming', 'tool_use'] as const

  constructor(private readonly baseUrl: string, private readonly bearerToken?: string) {
    super()
  }

  async health() {
    const cardUrl = `${this.baseUrl.replace(/\/+$/, '')}/.well-known/agent.json`
    try {
      const response = await fetch(cardUrl, { headers: this.headers(), signal: AbortSignal.timeout(5_000) })
      if (!response.ok) return { status: 'offline' as const, detail: `A2A Agent Card request returned HTTP ${response.status}.` }
      const card: unknown = await response.json()
      const name = isRecord(card) && typeof card.name === 'string' ? card.name : undefined
      return name
        ? { status: 'online' as const, detail: `A2A Agent Card reachable: ${name}.` }
        : { status: 'offline' as const, detail: 'A2A Agent Card response did not include an agent name.' }
    } catch {
      return { status: 'offline' as const, detail: 'A2A Agent Card is unreachable from the ONEVibe API.' }
    }
  }

  private headers(): Record<string, string> {
    return this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}
  }

  protected async execute({ task, store, signal, prompt, executionId, providerRequestId, requestUserInput }: LegacyRuntimeContext) {
    signal.throwIfAborted()
    await store.updateTask(task.id, { status: 'running' })
    let message = prompt
    let sourceSequence = 0
    let a2aTaskId: string | undefined
    for (let round = 0; round < MAX_INPUT_ROUNDS; round += 1) {
      const outcome = await this.pump({ a2aTaskId, message, taskId: task.id, store, signal, providerRequestId, sourceSequence })
      sourceSequence = outcome.sourceSequence
      a2aTaskId = outcome.taskId ?? a2aTaskId
      if (outcome.inputPrompt !== undefined) {
        await store.appendEvent(task.id, {
          type: 'user_input_requested', lane: 'approval', label: 'A2A input required',
          content: outcome.inputPrompt, payload: {},
        })
        message = await requestUserInput(outcome.inputPrompt, [], signal)
        continue
      }
      break
    }
    const last = store.listEvents(task.id).at(-1)
    if (last?.type !== 'run_completed' && last?.type !== 'run_failed' && last?.type !== 'run_cancelled') {
      await store.appendEvent(task.id, {
        type: 'run_failed', lane: 'control', status: 'failed', label: 'A2A stream ended without a terminal event',
        content: 'The A2A event stream ended without a terminal task state. The provider outcome is unknown; do not retry automatically.',
        payload: { executionRoute: 'a2a_jsonrpc_sse', executionId, providerRequestId, providerState: 'unknown', providerIdempotencyProven: false, reconciliationRequired: true },
      })
      await store.updateTask(task.id, { status: 'failed' })
      return
    }
    const taskStatus: RunStatus = last.type === 'run_completed' ? 'completed' : last.type === 'run_cancelled' ? 'cancelled' : 'failed'
    await store.updateTask(task.id, { status: taskStatus })
  }

  /** Opens one message/stream stream and pumps it until a terminal state, an input-required pause, or stream end. */
  private async pump(args: { a2aTaskId?: string; message: string; taskId: string; store: LegacyRuntimeContext['store']; signal: AbortSignal; providerRequestId: string; sourceSequence: number }): Promise<{ inputPrompt?: string; sourceSequence: number; taskId?: string }> {
    const { message, taskId, store, signal, providerRequestId } = args
    let a2aTaskId = args.a2aTaskId
    let sourceSequence = args.sourceSequence
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...this.headers() },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: providerRequestId,
        method: 'message/stream',
        // No client-supplied task id: the server assigns it (first kind:"task"
        // frame) and continuations reference it via message.taskId.
        params: {
          message: {
            messageId: randomUUID(),
            role: 'user',
            parts: [{ kind: 'text', text: message }],
            ...(a2aTaskId ? { taskId: a2aTaskId } : {}),
          },
        },
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)]),
    })
    if (!response.ok || !response.body) throw new Error(`A2A endpoint returned HTTP ${response.status}`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const frame = parseSseBlock(block)
        if (!frame) continue
        const mapped = mapA2aStreamEvent(frame.data)
        if (mapped.taskId) a2aTaskId = mapped.taskId
        for (const event of mapped.events) {
          await store.ingestNativeEvent(taskId, {
            source: 'a2a_jsonrpc', sourceEventId: `a2a:${a2aTaskId ?? 'unassigned'}:${sourceSequence}`, sourceSequence, nativeType: event.type,
            payload: sanitizeNativePayload(frame.data), projections: [event],
          })
          sourceSequence += 1
        }
        if (mapped.state === 'input-required') return { inputPrompt: mapped.inputPrompt, sourceSequence, taskId: a2aTaskId }
        if (mapped.final) return { sourceSequence, taskId: a2aTaskId }
      }
      if (done) break
    }
    return { sourceSequence, taskId: a2aTaskId }
  }
}
