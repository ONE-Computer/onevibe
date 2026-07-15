import { describe, expect, it } from 'vitest'
import { approvalReviewPolicyFor } from './approval-review'
import type { RuntimeEvent } from '../types'

const event = (id: string, approvalId: string, policy: unknown): RuntimeEvent => ({ id, taskId: 'task-1', sequence: 1, type: 'approval_requested', lane: 'approval', payload: { approvalId, policy }, createdAt: '2026-07-16T00:00:00.000Z', previousHash: 'previous', eventHash: 'current' })

describe('approval review policy projection', () => {
  it('projects only the exact approval-bound policy with an approval-required decision', () => {
    const events = [event('other', 'approval-other', { decision: 'approval_required', policyId: 'other', reason: 'Other', controls: [] }), event('match', 'approval-match', { decision: 'approval_required', policyId: 'global.external-sharing.v1', reason: 'External sharing needs review.', controls: ['external_wallet', 'no_web_approval'] })]
    expect(approvalReviewPolicyFor(events, 'approval-match')).toEqual({ policyId: 'global.external-sharing.v1', reason: 'External sharing needs review.', controls: ['external_wallet', 'no_web_approval'] })
  })

  it('does not project malformed or non-approval policy input', () => {
    expect(approvalReviewPolicyFor([event('bad', 'approval-match', { decision: 'allow', policyId: 'not-for-review', reason: 'No', controls: [] })], 'approval-match')).toBeUndefined()
  })
})
