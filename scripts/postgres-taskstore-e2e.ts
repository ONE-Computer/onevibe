import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import type { RuntimeLeaseRecord } from '../server/persistence/contracts.js'
import { TaskStore } from '../server/store.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const suffix = randomUUID().replaceAll('-', '')
const ownerUserId = `taskstore-owner-${suffix}`
const otherUserId = `taskstore-other-${suffix}`
const now = new Date()
const seedSql = postgres(databaseUrl, { max: 2, prepare: false })

const main = async () => {
  for (const userId of [ownerUserId, otherUserId]) {
    await seedSql`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (${userId}, ${userId}, ${`${userId}@example.invalid`}, true, ${now}, ${now})`
  }
  const first = new TaskStore(`/tmp/onevibe-postgres-taskstore-${suffix}`, { driver: 'postgres', databaseUrl })
  try {
    await first.initialize()
    const project = await first.createProject('TaskStore Postgres proof', 'Core TaskStore integration.', ownerUserId)
    const task = await first.createTask('Say hello from the Postgres TaskStore.', 'claude_sdk', 'chat', project.id, undefined, [], [], [], ownerUserId)
    const otherTask = await first.createTask('Lease identity fence boundary.', 'onecomputer', 'chat', project.id, undefined, [], [], [], ownerUserId)
    await first.beginTurn(task.id, 'Hello from the durable TaskStore.', task.provider)
    await first.appendEvent(task.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'Hello from Postgres.', payload: {} })
    await first.appendEvent(task.id, { type: 'run_completed', lane: 'control', status: 'completed', label: 'Turn completed', payload: {} })
    const leaseCreatedAt = new Date(now.getTime() + 1).toISOString()
    const lease: RuntimeLeaseRecord = {
      id: `lease_taskstore_${suffix}`, conversationId: task.id, generation: 0, providerName: 'onecomputer', providerSandboxId: null,
      status: 'allocating', allocationOperationId: `allocate_taskstore_${suffix}`, allocationIdempotencyKey: `taskstore_${suffix}:generation:0`,
      createdAt: leaseCreatedAt, updatedAt: leaseCreatedAt, readyAt: null, releaseRequestedAt: null, releasedAt: null, lastError: null,
    }
    await first.insertRuntimeLease(lease, -1, ownerUserId)
    assert.deepEqual(await first.findActiveRuntimeLease(task.id, ownerUserId), lease)
    const readyAt = new Date(now.getTime() + 2).toISOString()
    const readyLease: RuntimeLeaseRecord = { ...lease, status: 'ready', providerSandboxId: 'sandbox-taskstore', updatedAt: readyAt, readyAt }
    await first.transitionRuntimeLease(lease.id, { generation: lease.generation, status: lease.status, updatedAt: lease.updatedAt }, readyLease, ownerUserId)
    assert.equal((await first.findActiveRuntimeLease(task.id, ownerUserId))?.providerSandboxId, 'sandbox-taskstore')
    await assert.rejects(() => first.listRuntimeLeases(task.id, otherUserId), /Task not found/)
    const retry = await first.claimRetry(task.id, 'retry-1', 'Retry the greeting.')
    assert.deepEqual(retry, { claimed: true, state: 'pending' })
    await first.completeRetry(task.id, 'retry-1', { status: 'queued', taskId: task.id })
    await first.close()

    const second = new TaskStore(`/tmp/onevibe-postgres-taskstore-${suffix}`, { driver: 'postgres', databaseUrl })
    try {
      await second.initialize()
      const restored = second.getTask(task.id, ownerUserId)
      const snapshot = await second.snapshot(task.id)
      assert.equal(restored.status, 'pending')
      assert.equal(snapshot.messages.filter((message) => message.role === 'user').length, 1)
      assert.equal(snapshot.messages.find((message) => message.role === 'assistant')?.content, 'Hello from Postgres.')
      assert.equal(snapshot.events.length, 2)
      assert.equal(second.verifyChain(task.id), true)
      assert.deepEqual(await second.getRetry(task.id, 'retry-1'), { state: 'completed', response: { status: 'queued', taskId: task.id } })
      assert.deepEqual((await second.listRuntimeLeases(task.id, ownerUserId)).map((candidate) => ({ status: candidate.status, generation: candidate.generation, providerSandboxId: candidate.providerSandboxId })), [{ status: 'ready', generation: 0, providerSandboxId: 'sandbox-taskstore' }])
      await assert.rejects(() => second.findActiveRuntimeLease(task.id, otherUserId), /Task not found/)
      const wrongOwnerTransition: RuntimeLeaseRecord = { ...readyLease, conversationId: `task_other_${suffix}` }
      await assert.rejects(() => second.transitionRuntimeLease(lease.id, { generation: readyLease.generation, status: readyLease.status, updatedAt: readyLease.updatedAt }, wrongOwnerTransition, otherUserId), /Task not found/)
      const wrongConversationTransition: RuntimeLeaseRecord = { ...readyLease, conversationId: otherTask.id }
      await assert.rejects(() => second.transitionRuntimeLease(lease.id, { generation: readyLease.generation, status: readyLease.status, updatedAt: readyLease.updatedAt }, wrongConversationTransition, ownerUserId), /does not exist for this owner conversation/)
      console.log(JSON.stringify({ driver: 'postgres', taskStore: true, leaseAllocation: true, leaseTransition: true, leaseRestartRecovery: true, leaseOwnerFencing: true, messageCount: snapshot.messages.length, eventCount: snapshot.events.length, retryRecovery: true, limitation: 'opt-in core slice only; production driver selection remains fail-closed until the full async TaskStore surface is integrated' }, null, 2))
    } finally {
      await second.close()
    }
  } finally {
    await first.close().catch(() => undefined)
    await seedSql`DELETE FROM "user" WHERE id IN (${ownerUserId}, ${otherUserId})`
  }
}

main().finally(() => seedSql.end({ timeout: 5 })).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
