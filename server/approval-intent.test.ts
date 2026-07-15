import { describe, expect, it } from 'vitest'
import { approvalIntentHash, evidenceHeadFor } from './approval-intent.js'

describe('approval intent binding', () => {
  it('changes when the action, expiry, or evidence head changes', () => {
    const base = { approvalId: 'approval-1', taskId: 'task-1', action: 'share_artifact', expiresAt: '2026-07-16T00:00:00.000Z', evidenceHash: 'head-a' }
    expect(approvalIntentHash(base)).toHaveLength(64)
    expect(approvalIntentHash({ ...base, evidenceHash: 'head-b' })).not.toBe(approvalIntentHash(base))
    expect(approvalIntentHash({ ...base, action: 'publish_preview' })).not.toBe(approvalIntentHash(base))
    expect(evidenceHeadFor([{ eventHash: 'first' }, { eventHash: 'last' }])).toBe('last')
    expect(evidenceHeadFor([])).toBe('GENESIS')
  })
})
