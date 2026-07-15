import type { RuntimeEvent } from '../types'

export type ApprovalReviewPolicy = { policyId: string; reason: string; controls: string[] }

const policyFrom = (value: unknown): ApprovalReviewPolicy | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.decision !== 'approval_required' || typeof candidate.policyId !== 'string' || typeof candidate.reason !== 'string' || !Array.isArray(candidate.controls) || !candidate.controls.every((control) => typeof control === 'string')) return undefined
  return { policyId: candidate.policyId, reason: candidate.reason, controls: candidate.controls as string[] }
}

/** Project only the policy bound to this exact immutable approval request. */
export const approvalReviewPolicyFor = (events: RuntimeEvent[], approvalId: string) => {
  const request = [...events].reverse().find((event) => event.type === 'approval_requested' && event.payload.approvalId === approvalId)
  return policyFrom(request?.payload.policy)
}
