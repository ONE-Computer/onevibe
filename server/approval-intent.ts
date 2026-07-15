import { createHash } from 'node:crypto'

export type ApprovalIntent = {
  approvalId: string
  taskId: string
  action: string
  expiresAt: string
  evidenceHash: string
}

/**
 * A wallet decision must name the exact task action and evidence head it was
 * shown. This canonical digest is transport-neutral: a future OpenVTC Trust
 * Task receipt can carry the same value without trusting the browser.
 */
export const approvalIntentHash = (intent: ApprovalIntent) => createHash('sha256')
  .update(JSON.stringify({ approvalId: intent.approvalId, taskId: intent.taskId, action: intent.action, expiresAt: intent.expiresAt, evidenceHash: intent.evidenceHash }))
  .digest('hex')

export const evidenceHeadFor = (events: Array<{ eventHash: string }>) => events.at(-1)?.eventHash ?? 'GENESIS'
