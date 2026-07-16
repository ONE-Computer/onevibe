import { describe, expect, it } from 'vitest'
import { nativeEventIdFor, normalizeNativeEvent, sanitizeNativePayload } from './native-events.js'

describe('native event envelopes', () => {
  it('redacts secrets and omits hidden reasoning before persistence', () => {
    expect(sanitizeNativePayload({ access_token: 'secret', reasoning_content: 'do not persist', nested: { apiKey: 'also secret' } })).toEqual({
      access_token: '[REDACTED]', reasoning_content: '[OMITTED_HIDDEN_REASONING]', nested: { apiKey: '[REDACTED]' },
    })
    expect(sanitizeNativePayload({ cwd: '/tmp/onevibe/workspaces/task_a', file_path: '/Users/gini/private.txt' })).toEqual({ cwd: '<workspace-path>', file_path: '<workspace-path>' })
  })

  it('bounds oversized native payloads while retaining a digest', () => {
    const normalized = normalizeNativeEvent({
      source: 'claude_agent_sdk', sourceEventId: 'sdk-1', sourceSequence: 1, nativeType: 'assistant',
      payload: { content: ['x'.repeat(64_000), 'y'.repeat(64_000), 'z'.repeat(64_000)] }, projections: [],
    })
    const parsed = JSON.parse(normalized.payloadJson) as Record<string, unknown>
    expect(parsed.payloadTruncated).toBe(true)
    expect(typeof parsed.payloadHash).toBe('string')
    expect(normalized.payloadHash).toHaveLength(64)
  })

  it('derives a stable conversation/run/source identity', () => {
    const input = { source: 'onecomputer_sandbox' as const, sourceEventId: 'tool:3' }
    expect(nativeEventIdFor('task-1', 'run-1', input)).toBe(nativeEventIdFor('task-1', 'run-1', input))
    expect(nativeEventIdFor('task-1', 'run-1', input)).not.toBe(nativeEventIdFor('task-1', 'run-2', input))
  })
})
