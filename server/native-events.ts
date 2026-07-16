import { createHash } from 'node:crypto'
import type { EventInput } from './types.js'

export type NativeEventSource = 'claude_agent_sdk' | 'onecomputer_sandbox' | 'remote_runtime'

export type NativeEventInput = {
  source: NativeEventSource
  sourceEventId: string
  sourceSequence: number
  nativeType: string
  payload: unknown
  projections: EventInput[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const secretKey = /authorization|cookie|token|secret|api[_-]?key|password|credential/i
const hiddenReasoningKey = /^(thinking|redacted_thinking|reasoning|reasoning_content|encrypted_content)$/i
const hostPath = /\/(?:Users|home|private\/tmp|tmp)\/[^\s'"`]+/g

/**
 * Native provider envelopes are evidence, not a transcript. Keep bounded
 * operational metadata, redact credentials, and omit hidden reasoning before
 * the payload can reach SQLite or an SSE projection.
 */
export const sanitizeNativePayload = (value: unknown, depth = 0): unknown => {
  if (depth > 7) return '[Max depth]'
  if (typeof value === 'string') {
    const redacted = value.replace(hostPath, '<workspace-path>')
    return redacted.length > 64_000 ? `${redacted.slice(0, 64_000)}…[truncated]` : redacted
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => sanitizeNativePayload(item, depth + 1))
  if (!isRecord(value)) return '[Unsupported native value]'
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (hiddenReasoningKey.test(key)) result[key] = '[OMITTED_HIDDEN_REASONING]'
    else if (secretKey.test(key)) result[key] = '[REDACTED]'
    else result[key] = sanitizeNativePayload(item, depth + 1)
  }
  return result
}

const boundedPayloadJson = (payload: unknown): string => {
  const sanitized = sanitizeNativePayload(payload)
  const encoded = JSON.stringify(sanitized)
  if (encoded.length <= 128_000) return encoded
  return JSON.stringify({
    payloadTruncated: true,
    payloadHash: createHash('sha256').update(encoded, 'utf8').digest('hex'),
    summary: 'Native provider payload exceeded the durable envelope bound.',
  })
}

export const normalizeNativeEvent = (input: NativeEventInput): NativeEventInput & { payloadJson: string; payloadHash: string } => {
  if (!input.sourceEventId.trim() || input.sourceEventId.length > 512) throw new RangeError('Native source event ID is invalid')
  if (!Number.isSafeInteger(input.sourceSequence) || input.sourceSequence < 0) throw new RangeError('Native source sequence is invalid')
  if (!input.nativeType.trim() || input.nativeType.length > 128) throw new RangeError('Native event type is invalid')
  const payloadJson = boundedPayloadJson(input.payload)
  return { ...input, payloadJson, payloadHash: createHash('sha256').update(payloadJson, 'utf8').digest('hex') }
}

export const nativeEventIdFor = (conversationId: string, runId: string, input: Pick<NativeEventInput, 'source' | 'sourceEventId'>) =>
  `${conversationId}:native:${createHash('sha256').update(`${runId}:${input.source}:${input.sourceEventId}`, 'utf8').digest('hex').slice(0, 48)}`
