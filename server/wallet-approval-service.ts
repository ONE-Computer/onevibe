import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { TaskStore } from './store.js'

export class WalletApprovalService {
  constructor(private readonly store: TaskStore, private readonly walletToken: string) {
    if (walletToken.length < 24) throw new Error('ONEVIBE_WALLET_TOKEN must contain at least 24 characters')
  }

  authorize(header: string | undefined) {
    const supplied = header?.startsWith('Bearer ') ? header.slice(7) : ''
    const expectedBytes = Buffer.from(this.walletToken)
    const suppliedBytes = Buffer.from(supplied)
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) throw new Error('Wallet authorization failed')
  }

  async listPending() {
    await this.store.reconcileExpiredApprovals()
    return this.store.listTasks().flatMap((task) => {
      const approval = task.approval
      if (!approval || approval.state !== 'pending') return []
      return [{
        taskId: task.id,
        title: task.title,
        approval,
        // This is intentionally the entire wallet-facing review surface. The
        // wallet receives no browser session, sandbox handle, raw task prompt,
        // connector credential, or mutable workspace capability.
        intent: approval.intentHash && approval.evidenceHash ? {
          version: 1 as const,
          taskId: task.id,
          title: task.title,
          action: approval.action,
          expiresAt: approval.expiresAt,
          evidenceHash: approval.evidenceHash,
          intentHash: approval.intentHash,
        } : undefined,
      }]
    })
  }

  async decide(approvalId: string, decision: 'approved' | 'denied', signer: string) {
    await this.store.reconcileExpiredApprovals()
    const task = this.store.findTaskByApproval(approvalId)
    const approval = task.approval
    if (!approval || approval.state !== 'pending') throw new Error('Approval is not pending')
    if (!approval.intentHash || !approval.evidenceHash) throw new Error('Approval is missing an evidence-bound intent; request a new approval')
    const decidedAt = new Date().toISOString()
    const receiptBody = JSON.stringify({ approvalId, taskId: task.id, action: approval.action, decision, signer, decidedAt, intentHash: approval.intentHash })
    const signature = createHmac('sha256', this.walletToken).update(receiptBody).digest('hex')
    const receipt = { decision, signer, decidedAt, signature, intentHash: approval.intentHash } as const
    const share = decision === 'approved' && approval.action === 'share_artifact'
      ? { id: randomBytes(24).toString('base64url'), createdAt: decidedAt, approvalId }
      : task.share
    await this.store.updateTask(task.id, { approval: { ...approval, state: decision, receipt }, share })
    await this.store.appendEvent(task.id, {
      type: 'approval_resolved', lane: 'approval', status: task.status, label: `External wallet ${decision}`,
      content: `${signer} ${decision} ${approval.action}.`,
      payload: { approvalId, action: approval.action, decision, signer, decidedAt, signature, intentHash: approval.intentHash, evidenceHash: approval.evidenceHash, authority: 'external_wallet_service' },
    })
    return { task: this.store.getTask(task.id), receipt, share }
  }
}
