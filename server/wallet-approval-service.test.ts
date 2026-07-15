import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approvalIntentHash } from './approval-intent.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

describe('WalletApprovalService', () => {
  it('requires separate authorization and signs a share approval receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-wallet-'))
    roots.push(root)
    const { TaskStore } = await import('./store.js')
    const { WalletApprovalService } = await import('./wallet-approval-service.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Share a governed artifact', 'demo')
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const evidenceHash = 'test-evidence-head'
    const intentHash = approvalIntentHash({ approvalId: 'approval-test', taskId: task.id, action: 'share_artifact', expiresAt, evidenceHash })
    await store.updateTask(task.id, { approval: { id: 'approval-test', action: 'share_artifact', intentHash, evidenceHash, state: 'pending', walletUrl: 'openvtc://trust-task/approval-test', expiresAt } })
    const token = 'wallet-test-token-that-is-long-enough'
    const wallet = new WalletApprovalService(store, token)

    expect(() => wallet.authorize('Bearer wrong')).toThrow('authorization failed')
    expect(wallet.listPending()).toHaveLength(1)
    const result = await wallet.decide('approval-test', 'approved', 'test-vti-wallet')

    expect(result.share?.id.length).toBeGreaterThan(20)
    expect(result.receipt.signature).toMatch(/^[a-f0-9]{64}$/)
    expect(result.receipt.intentHash).toBe(intentHash)
    expect(JSON.stringify(result)).not.toContain(token)
    expect(store.getTask(task.id).approval?.state).toBe('approved')
    expect(store.listEvents(task.id).at(-1)?.type).toBe('approval_resolved')
    expect(store.verifyChain(task.id)).toBe(true)
  })
})
