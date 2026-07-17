import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import type { McpConfigRecord, OrganizationMemberRecord, OrganizationRecord, RuntimeLeaseRecord, SkillInstallationRecord } from '../server/persistence/contracts.js'
import type { RuntimeEvent } from '../server/types.js'
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
    const projectWithFile = await first.addProjectFile(project.id, { name: 'context.md', mimeType: 'text/markdown', bytes: Buffer.from('Durable project context.') }, ownerUserId)
    const projectFilePath = projectWithFile.files[0]!.path
    const projectFileBefore = await first.readProjectFile(project.id, projectFilePath, ownerUserId)
    const savedProjectFile = await first.updateProjectFile(project.id, projectFilePath, 'Updated durable project context.', projectFileBefore.contentHash, ownerUserId)
    const task = await first.createTask('Say hello from the Postgres TaskStore.', 'claude_sdk', 'chat', project.id, undefined, [], [], [], ownerUserId)
    const otherTask = await first.createTask('Lease identity fence boundary.', 'onecomputer', 'chat', project.id, undefined, [], [], [], ownerUserId)
    const recoveryTask = await first.createTask('Recover an interrupted Postgres task.', 'claude_sdk', 'chat', project.id, undefined, [], [], [], ownerUserId)
    await first.beginTurn(task.id, 'Hello from the durable TaskStore.', task.provider)
    await first.appendEvent(task.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'Hello from Postgres.', payload: {} })
    await first.appendEvent(task.id, { type: 'run_completed', lane: 'control', status: 'completed', label: 'Turn completed', payload: {} })
    await first.appendStandaloneMessage(task.id, 'assistant', 'A standalone durable message.')
    const branchBoundary = await first.appendStandaloneMessage(task.id, 'user', 'Branch from this message.')
    await first.writeWorkspaceFile(task.id, 'README.md', '# Durable workspace\n')
    await first.writeWorkspaceBytes(task.id, 'data.bin', new Uint8Array([0, 1, 2, 255]))
    const workspaceVersion = await first.createWorkspaceVersion(task.id, 'Initial durable workspace')
    assert.ok(workspaceVersion)
    await first.writeWorkspaceFile(task.id, 'README.md', '# Changed workspace\n')
    assert.deepEqual((await first.compareWorkspaceVersion(task.id, workspaceVersion!.id)).summary, { added: 0, changed: 1, removed: 0 })
    await first.restoreWorkspaceVersion(task.id, workspaceVersion!.id)
    assert.equal(await first.readWorkspaceFile(task.id, 'README.md'), '# Durable workspace\n')
    assert.deepEqual([...await first.readWorkspaceBytes(task.id, 'data.bin')], [0, 1, 2, 255])
    await first.beginTurn(otherTask.id, 'Capture a native event.', otherTask.provider)
    const nativeInput = {
      source: 'onecomputer_sandbox' as const, sourceEventId: 'sandbox-event-0', sourceSequence: 0, nativeType: 'tool_result',
      payload: { command: 'pwd', access_token: 'must-not-leak' },
      projections: [{ type: 'tool_call_completed' as const, lane: 'activity' as const, label: 'Sandbox command completed', content: 'Workspace inspected.', payload: { tool: 'pwd' } }],
    }
    const native = await first.ingestNativeEvent(otherTask.id, nativeInput)
    assert.equal(native.events.length, 1)
    assert.equal((await first.ingestNativeEvent(otherTask.id, nativeInput)).events.length, 0)
    await assert.rejects(() => first.ingestNativeEvent(otherTask.id, { ...nativeInput, payload: { command: 'ls', access_token: 'changed' } }), /conflicts with the current source cursor/)
    await first.appendEvent(otherTask.id, { type: 'run_completed', lane: 'control', status: 'completed', label: 'Native proof completed', payload: {} })
    const mcp: McpConfigRecord = { id: `mcp_taskstore_${suffix}`, ownerUserId, name: 'TaskStore MCP', command: 'node', argsJson: JSON.stringify(['fixture.mjs']), createdAt: now.toISOString(), updatedAt: now.toISOString() }
    const createdMcp = await first.createMcpConfig({ name: mcp.name, command: mcp.command, args: ['fixture.mjs'] }, ownerUserId)
    mcp.id = createdMcp.id
    assert.deepEqual((await first.listMcpConfigs(ownerUserId)).map((config) => config.id), [mcp.id])
    assert.equal((await first.listMcpConfigs(otherUserId)).length, 0)
    const skill: SkillInstallationRecord = { id: `skill_taskstore_${suffix}`, ownerUserId, version: 1, title: 'TaskStore skill', summary: 'TaskStore proof skill', sha256: 'd'.repeat(64), content: '# TaskStore skill', contentUrl: 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json', sourceUrl: 'https://github.com/ONE-Computer/onevibe', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await first.installSkillInstallation(skill, ownerUserId)
    assert.deepEqual((await first.listSkillInstallationRecords(ownerUserId)).map((item) => item.id), [skill.id])
    assert.equal((await first.listSkillInstallationRecords(otherUserId)).length, 0)
    const organization: OrganizationRecord = { id: `org_taskstore_${suffix}`, name: 'TaskStore organization', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await first.createOrganization(organization.name, ownerUserId)
    const ownerOrganizations = await first.listOrganizations(ownerUserId)
    assert.equal(ownerOrganizations.length, 1)
    const member: OrganizationMemberRecord = await first.addOrganizationMember(ownerOrganizations[0]!.id, otherUserId, ownerUserId)
    assert.equal(member.role, 'member')
    assert.deepEqual((await first.listOrganizations(otherUserId)).map((item) => item.id), [ownerOrganizations[0]!.id])
    assert.deepEqual((await first.listOrganizationMembers(ownerOrganizations[0]!.id, otherUserId)).map((item) => item.userId), [ownerUserId, otherUserId])
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
    await first.updateTask(recoveryTask.id, { status: 'running', activeRunId: 'crashed-run' })
    await first.close()

    const second = new TaskStore(`/tmp/onevibe-postgres-taskstore-${suffix}`, { driver: 'postgres', databaseUrl })
    try {
      await second.initialize()
      const restored = second.getTask(task.id, ownerUserId)
      const recovered = second.getTask(recoveryTask.id, ownerUserId)
      const snapshot = await second.snapshot(task.id)
      assert.equal(restored.status, 'pending')
      assert.equal(recovered.status, 'failed')
      assert.equal((await second.listEvents(recoveryTask.id)).some((event) => event.type === 'run_failed' && event.runId === 'crashed-run'), true)
      assert.equal(snapshot.messages.filter((message) => message.role === 'user').length, 2)
      assert.equal(snapshot.messages.find((message) => message.role === 'assistant')?.content, 'Hello from Postgres.')
      assert.equal(snapshot.messages.length, 4)
      assert.equal(snapshot.events.length, 2)
      assert.equal((await second.listNativeEvents(otherTask.id)).length, 1, 'native event count')
      assert.equal((await second.snapshot(otherTask.id)).events.length, 2, 'native projection event count')
      assert.equal(await second.readWorkspaceFile(task.id, 'README.md'), '# Durable workspace\n')
      assert.deepEqual([...await second.readWorkspaceBytes(task.id, 'data.bin')], [0, 1, 2, 255])
      assert.equal((await second.listWorkspaceVersions(task.id)).length, 1)
      assert.equal((await second.readProjectFile(project.id, projectFilePath, ownerUserId)).content, 'Updated durable project context.')
      const projectVersions = second.listProjectFileVersions(project.id, projectFilePath, ownerUserId)
      assert.equal(projectVersions.length, 1)
      const restoredProjectFile = await second.restoreProjectFileVersion(project.id, projectFilePath, projectVersions[0]!.id, savedProjectFile.contentHash, ownerUserId)
      assert.equal(restoredProjectFile.content, 'Durable project context.')
      assert.equal(second.verifyChain(task.id), true)
      assert.deepEqual(await second.getRetry(task.id, 'retry-1'), { state: 'completed', response: { status: 'queued', taskId: task.id } })
      assert.deepEqual((await second.listRuntimeLeases(task.id, ownerUserId)).map((candidate) => ({ status: candidate.status, generation: candidate.generation, providerSandboxId: candidate.providerSandboxId })), [{ status: 'ready', generation: 0, providerSandboxId: 'sandbox-taskstore' }])
      assert.deepEqual((await second.listMcpConfigs(ownerUserId)).map((config) => config.id), [mcp.id])
      assert.deepEqual((await second.listSkillInstallationRecords(ownerUserId)).map((item) => item.id), [skill.id])
      assert.deepEqual((await second.listOrganizationMembers((await second.listOrganizations(ownerUserId))[0]!.id, ownerUserId)).map((item) => item.userId), [ownerUserId, otherUserId])
      await assert.rejects(() => second.findActiveRuntimeLease(task.id, otherUserId), /Task not found/)
      const wrongOwnerTransition: RuntimeLeaseRecord = { ...readyLease, conversationId: `task_other_${suffix}` }
      await assert.rejects(() => second.transitionRuntimeLease(lease.id, { generation: readyLease.generation, status: readyLease.status, updatedAt: readyLease.updatedAt }, wrongOwnerTransition, otherUserId), /Task not found/)
      const wrongConversationTransition: RuntimeLeaseRecord = { ...readyLease, conversationId: otherTask.id }
      await assert.rejects(() => second.transitionRuntimeLease(lease.id, { generation: readyLease.generation, status: readyLease.status, updatedAt: readyLease.updatedAt }, wrongConversationTransition, ownerUserId), /does not exist for this owner conversation/)
      const organizationId = (await second.listOrganizations(ownerUserId))[0]!.id
      assert.equal(await second.deleteMcpConfig(mcp.id, ownerUserId), true)
      assert.equal(await second.removeSkillInstallation(skill.id, ownerUserId), true)
      await second.removeOrganizationMember(organizationId, otherUserId, ownerUserId)
      await second.updateTask(task.id, { status: 'completed' })
      const fork = await second.forkTask(task.id, branchBoundary.id, 'Forked Postgres conversation')
      assert.equal(fork.parentTaskId, task.id)
      assert.equal((await second.snapshot(fork.id)).messages.length, 3)
      assert.equal(await second.readWorkspaceFile(fork.id, 'README.md'), '# Durable workspace\n')
      const concurrentA = new TaskStore(`/tmp/onevibe-postgres-concurrent-a-${suffix}`, { driver: 'postgres', databaseUrl })
      const concurrentB = new TaskStore(`/tmp/onevibe-postgres-concurrent-b-${suffix}`, { driver: 'postgres', databaseUrl })
      try {
        await Promise.all([concurrentA.initialize(), concurrentB.initialize()])
        const concurrentEvents = await Promise.all([
          concurrentA.appendEvent(task.id, { type: 'activity_delta', lane: 'activity', label: 'Concurrent writer A', payload: {} }),
          concurrentB.appendEvent(task.id, { type: 'activity_delta', lane: 'activity', label: 'Concurrent writer B', payload: {} }),
        ])
        assert.deepEqual(new Set(concurrentEvents.map((event) => event.sequence)).size, 2)
        await concurrentA.refreshPostgresState(ownerUserId)
        const concurrentSnapshot = await concurrentA.snapshot(task.id)
        const concurrentLabels = concurrentSnapshot.events.filter((event) => event.label?.startsWith('Concurrent writer')).map((event) => event.label).sort()
        assert.deepEqual(concurrentLabels, ['Concurrent writer A', 'Concurrent writer B'])
        assert.equal(concurrentA.verifyChain(task.id), true)
        const crossInstanceLive = new Promise<RuntimeEvent>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('cross-instance event polling timed out')), 2_000)
          const unsubscribe = concurrentA.subscribe(task.id, (event) => {
            if (event.label !== 'Cross-instance writer') return
            clearTimeout(timeout)
            unsubscribe()
            resolve(event)
          })
          void concurrentB.appendEvent(task.id, { type: 'activity_delta', lane: 'activity', label: 'Cross-instance writer', payload: {} }).catch((error: unknown) => {
            clearTimeout(timeout)
            unsubscribe()
            reject(error)
          })
        })
        assert.equal((await crossInstanceLive).label, 'Cross-instance writer')
      } finally {
        await Promise.all([concurrentA.close(), concurrentB.close()])
      }
      console.log(JSON.stringify({ driver: 'postgres', taskStore: true, projectFileRestartRecovery: true, projectRevisionRestore: true, workspaceBytesRestartRecovery: true, workspaceVersionRestore: true, workspaceForkCopy: true, interruptedTaskReconciliation: true, standaloneMessageRestartRecovery: true, nativeAtomicReplayAndConflict: true, nativeRestartRecovery: true, forkHistoryAtomic: true, concurrentEventAllocation: true, mcpOwnerIsolation: true, skillOwnerIsolation: true, organizationOwnerIsolation: true, leaseAllocation: true, leaseTransition: true, leaseRestartRecovery: true, leaseOwnerFencing: true, messageCount: snapshot.messages.length, eventCount: snapshot.events.length, retryRecovery: true, limitation: 'Postgres is opt-in; project revisions and legacy workspace/project/native import are durable; bounded follow-up idempotency is proven separately; private attachment export policy/round trips, crash-safe full workflow idempotency/concurrency, cross-instance live SSE, and production deployment controls remain open' }, null, 2))
    } finally {
      await second.close()
    }
  } finally {
    await first.close().catch(() => undefined)
    await seedSql`DELETE FROM "user" WHERE id IN (${ownerUserId}, ${otherUserId})`
  }
}

main().finally(() => seedSql.end({ timeout: 5 })).catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })
