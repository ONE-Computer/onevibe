import { RuntimeAdapterBase, type LegacyRuntimeContext } from './runtime-adapter.js'
import type { EventInput, Task } from './types.js'
import { sanitizeNativePayload } from './native-events.js'
import { isRecord } from './util/is-record.js'

/**
 * Kimi Code CLI runtime adapter.
 *
 * The Kimi Code CLI exposes a local REST server (no SSE on the prompt
 * endpoint), so execution is poll-based: create/reuse a session, submit a
 * prompt, then page `GET /messages?after_id=…` every 400ms until the session
 * reports `busy=false` with no pending interaction. Native message envelopes
 * are preserved through the shared redaction helper and projected into the
 * durable RuntimeEvent ledger under the `kimi_cli` source.
 *
 * Registered only when KIMI_SERVER_URL is set. Contract-tested against a
 * stubbed fetch — no live Kimi server proof is claimed here.
 */

type KimiEnvelope<T> = { code: number; msg?: string; data: T }

type KimiSessionStatus = { busy: boolean; pending_interaction?: string; last_turn_reason?: string }

const POLL_INTERVAL_MS = 400
const REQUEST_TIMEOUT_MS = 10_000
const TOOL_OUTPUT_PREVIEW_MAX = 2_000

/**
 * Maps one Kimi session message onto durable RuntimeEvent projections. Pure
 * and exported for contract tests. Assistant text becomes transcript deltas;
 * tool_use/tool_result parts become activity-lane tool call records; user
 * messages and empty parts produce nothing (the durable user message already
 * exists from the composer turn).
 */
export const mapKimiMessage = (msg: Record<string, unknown>): EventInput[] => {
  const role = typeof msg.role === 'string' ? msg.role : ''
  const content = Array.isArray(msg.content) ? msg.content : []
  const events: EventInput[] = []
  for (const part of content) {
    if (!isRecord(part)) continue
    if (role === 'assistant' && part.type === 'text' && typeof part.text === 'string' && part.text) {
      events.push({ type: 'assistant_text_delta', lane: 'transcript', content: part.text, payload: {} })
    } else if (role === 'assistant' && part.type === 'tool_use') {
      events.push({
        type: 'tool_call_started', lane: 'activity', label: String(part.tool_name ?? 'tool'), payload: {
          toolName: typeof part.tool_name === 'string' ? part.tool_name : undefined,
          toolCallId: typeof part.tool_call_id === 'string' ? part.tool_call_id : undefined,
          input: sanitizeNativePayload(part.input),
        },
      })
    } else if (part.type === 'tool_result') {
      const isError = part.is_error === true
      const output = typeof part.output === 'string' ? part.output : ''
      events.push({
        type: 'tool_call_completed', lane: 'activity', label: String(part.tool_call_id ?? 'tool result'),
        content: output.length > TOOL_OUTPUT_PREVIEW_MAX ? `${output.slice(0, TOOL_OUTPUT_PREVIEW_MAX)}…` : output || undefined,
        status: isError ? 'failed' : undefined,
        payload: { toolCallId: typeof part.tool_call_id === 'string' ? part.tool_call_id : undefined, isError },
      })
    }
  }
  return events
}

export class KimiRuntimeAdapter extends RuntimeAdapterBase {
  readonly name = 'kimi'
  readonly providerId: Task['provider'] = 'kimi'
  readonly capabilities = ['streaming', 'tool_use', 'file_system'] as const

  constructor(
    private readonly serverUrl: string,
    private readonly sessionId: string | undefined,
    private readonly cwd: string,
  ) {
    super()
  }

  private async apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.serverUrl}${path}`, { signal })
    if (!response.ok) throw new Error(`Kimi API ${path} returned HTTP ${response.status}`)
    const envelope = await response.json() as KimiEnvelope<T>
    if (envelope.code !== 0) throw new Error(`Kimi API ${path} returned error code ${envelope.code}: ${envelope.msg ?? 'no message'}`)
    return envelope.data
  }

  private async apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${this.serverUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!response.ok) throw new Error(`Kimi API ${path} returned HTTP ${response.status}`)
    const envelope = await response.json() as KimiEnvelope<T>
    if (envelope.code !== 0) throw new Error(`Kimi API ${path} returned error code ${envelope.code}: ${envelope.msg ?? 'no message'}`)
    return envelope.data
  }

  async health() {
    try {
      const data = await this.apiGet<{ ok: boolean }>('/api/v1/healthz', AbortSignal.timeout(5_000))
      return data.ok
        ? { status: 'online' as const, detail: 'Kimi Code CLI server is healthy.' }
        : { status: 'offline' as const, detail: 'Kimi Code CLI healthz returned not-ok.' }
    } catch {
      return { status: 'offline' as const, detail: 'Kimi Code CLI server is not reachable.' }
    }
  }

  protected async execute({ task, store, signal, prompt, executionId, providerRequestId }: LegacyRuntimeContext) {
    signal.throwIfAborted()
    await store.updateTask(task.id, { status: 'running' })
    const requestSignal = (timeoutMs: number) => AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])

    // Create or reuse a session.
    let sessionId = this.sessionId
    let createdSession = false
    if (!sessionId) {
      const session = await this.apiPost<{ id: string }>('/api/v1/sessions', {
        metadata: { cwd: this.cwd },
        agent_config: { permission_mode: 'yolo' },
      }, requestSignal(REQUEST_TIMEOUT_MS))
      sessionId = session.id
      createdSession = true
    }

    try {
      const status = await this.apiGet<KimiSessionStatus>(`/api/v1/sessions/${sessionId}/status`, requestSignal(REQUEST_TIMEOUT_MS))
      if (status.busy) throw new Error('Kimi session is busy. Try again shortly.')

      // Baseline so the poll only pages messages created by this prompt.
      const baseline = await this.apiGet<{ items: Array<{ id: string }> }>(`/api/v1/sessions/${sessionId}/messages?page_size=1`, requestSignal(REQUEST_TIMEOUT_MS))
      let afterId = baseline.items[0]?.id ?? ''

      const submitted = await this.apiPost<{ prompt_id: string }>(`/api/v1/sessions/${sessionId}/prompts`, {
        content: [{ type: 'text', text: prompt }],
      }, requestSignal(REQUEST_TIMEOUT_MS))
      const promptId = submitted.prompt_id

      let sourceSequence = 0
      await store.ingestNativeEvent(task.id, {
        source: 'kimi_cli', sourceEventId: `kimi:${sessionId}:${promptId}:started`, sourceSequence: sourceSequence++,
        nativeType: 'run_started', payload: { sessionId, promptId },
        projections: [{
          type: 'run_started', lane: 'control', status: 'running', label: 'Kimi Code CLI started',
          content: 'Kimi session messages are polled, preserved as native envelopes, and projected into the ONEVibe task timeline.',
          payload: { executionRoute: 'kimi_cli', executionId, providerRequestId, providerIdempotencyProven: false },
        }],
      })

      let finalReason = 'completed'
      let done = false
      while (!done) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        if (signal.aborted) {
          // Best-effort provider abort; the durable run_cancelled projection is
          // emitted by the server run supervisor when this execute() throws.
          await this.apiPost(`/api/v1/sessions/${sessionId}/prompts/${promptId}:abort`, {}, AbortSignal.timeout(3_000)).catch(() => undefined)
          throw new DOMException('Task cancelled', 'AbortError')
        }

        const page = await this.apiGet<{ items: Array<Record<string, unknown>> }>(
          `/api/v1/sessions/${sessionId}/messages?page_size=50${afterId ? `&after_id=${afterId}` : ''}`,
          requestSignal(REQUEST_TIMEOUT_MS),
        )
        for (const msg of page.items) {
          if (typeof msg.id === 'string') afterId = msg.id
          const projections = mapKimiMessage(msg)
          if (projections.length === 0) continue
          await store.ingestNativeEvent(task.id, {
            source: 'kimi_cli', sourceEventId: `kimi:${sessionId}:${String(msg.id ?? sourceSequence)}`, sourceSequence: sourceSequence++,
            nativeType: typeof msg.role === 'string' ? msg.role : 'message',
            payload: sanitizeNativePayload(msg) as Record<string, unknown>,
            projections,
          })
        }

        const current = await this.apiGet<KimiSessionStatus>(`/api/v1/sessions/${sessionId}/status`, requestSignal(REQUEST_TIMEOUT_MS))
        if (!current.busy && (!current.pending_interaction || current.pending_interaction === 'none')) {
          finalReason = current.last_turn_reason ?? 'completed'
          done = true
        }
      }

      const terminal = finalReason === 'completed'
        ? { type: 'run_completed', status: 'completed', label: 'Kimi Code CLI completed' } as const
        : finalReason === 'cancelled'
          ? { type: 'run_cancelled', status: 'cancelled', label: 'Kimi Code CLI cancelled' } as const
          : { type: 'run_failed', status: 'failed', label: 'Kimi Code CLI failed' } as const
      await store.ingestNativeEvent(task.id, {
        source: 'kimi_cli', sourceEventId: `kimi:${sessionId}:${promptId}:done`, sourceSequence: sourceSequence++,
        nativeType: finalReason, payload: { sessionId, promptId, reason: finalReason },
        projections: [{ ...terminal, lane: 'control', content: `Kimi session reported last_turn_reason=${finalReason}.`, payload: { executionRoute: 'kimi_cli', executionId, providerRequestId } }],
      })
      await store.updateTask(task.id, { status: terminal.status })
    } finally {
      if (createdSession) {
        await this.apiPost(`/api/v1/sessions/${sessionId}:archive`, {}, AbortSignal.timeout(3_000)).catch(() => undefined)
      }
    }
  }
}
