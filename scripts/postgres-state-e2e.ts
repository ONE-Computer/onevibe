import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import type { McpConfigRecord, OrganizationRecord, RuntimeLeaseRecord, SkillInstallationRecord } from '../server/persistence/contracts.js'
import { PostgresStateCoordinator } from '../server/persistence/postgres-state.js'
import type { Project, Task } from '../server/types.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const suffix = randomUUID().replaceAll('-', '')
const ownerUserId = `state-owner-${suffix}`
const memberUserId = `state-member-${suffix}`
const outsiderUserId = `state-outsider-${suffix}`
const projectId = `project_state_${suffix}`
const taskId = `task_state_${suffix}`
const orgId = `org_state_${suffix}`
const deletedMcpId = `mcp_state_deleted_${suffix}`
const restartMcpId = `mcp_state_restart_${suffix}`
const skillId = `skill_state_${suffix}`
const leaseId = `lease_state_${suffix}`
const now = new Date()
const sql = postgres(databaseUrl, { max: 2, prepare: false })
const project: Project = { id: projectId, ownerUserId, name: 'Coordinator proof', context: '', files: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }
const task: Task = { id: taskId, ownerUserId, title: 'Coordinator task', prompt: 'Prove the composed state boundary.', provider: 'claude_sdk', mode: 'chat', skills: [], tags: [], queuedGuidance: [], projectId, references: [], attachments: [], status: 'pending', plan: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }

const main = async () => {
  for (const userId of [ownerUserId, memberUserId, outsiderUserId]) {
    await sql`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (${userId}, ${userId}, ${`${userId}@example.invalid`}, true, ${now}, ${now})`
  }
  let coordinator = new PostgresStateCoordinator(databaseUrl, { maxConnections: 1 })
  try {
    await coordinator.insertProject(project)
    await coordinator.insertTask(task)

    const organization: OrganizationRecord = { id: orgId, name: 'Coordinator organization', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await coordinator.createOrganization(organization, ownerUserId)
    await coordinator.addOrganizationMember(orgId, memberUserId, ownerUserId)
    assert.deepEqual((await coordinator.listOrganizationsForUser(memberUserId)).map((item) => item.id), [orgId])
    assert.deepEqual((await coordinator.listOrganizationMembers(orgId, memberUserId)).map((item) => item.userId), [ownerUserId, memberUserId])
    await assert.rejects(() => coordinator.listOrganizationMembers(orgId, outsiderUserId), /does not exist for this user/)
    await assert.rejects(() => coordinator.addOrganizationMember(orgId, outsiderUserId, memberUserId), /owner access required/)

    const deletedMcp: McpConfigRecord = { id: deletedMcpId, ownerUserId, name: 'Deleted coordinator MCP', command: 'node', argsJson: JSON.stringify(['fixture.mjs']), createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await coordinator.createMcpConfig(deletedMcp, ownerUserId)
    assert.equal((await coordinator.listMcpConfigs(ownerUserId)).length, 1)
    assert.equal((await coordinator.listMcpConfigs(memberUserId)).length, 0)
    assert.equal((await coordinator.listMcpAudit(deletedMcpId, ownerUserId)).length, 1)
    await assert.rejects(() => coordinator.listMcpAudit(deletedMcpId, memberUserId), /does not exist for this owner/)
    assert.equal(await coordinator.deleteMcpConfig(deletedMcpId, memberUserId), false)
    assert.equal(await coordinator.deleteMcpConfig(deletedMcpId, ownerUserId), true)

    const restartMcp: McpConfigRecord = { id: restartMcpId, ownerUserId, name: 'Restart coordinator MCP', command: 'node', argsJson: JSON.stringify(['restart-fixture.mjs']), createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await coordinator.createMcpConfig(restartMcp, ownerUserId)

    const skill: SkillInstallationRecord = { id: skillId, ownerUserId, version: 1, title: 'Coordinator skill', summary: 'Coordinator proof skill', sha256: 'c'.repeat(64), content: '# Coordinator proof', contentUrl: 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json', sourceUrl: 'https://github.com/ONE-Computer/onevibe', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await coordinator.installSkillInstallation(skill, ownerUserId)
    assert.equal((await coordinator.listSkillInstallations(ownerUserId)).length, 1)
    assert.equal((await coordinator.listSkillInstallations(memberUserId)).length, 0)
    assert.equal(await coordinator.removeSkillInstallation(skillId, memberUserId), false)

    const lease: RuntimeLeaseRecord = { id: leaseId, conversationId: taskId, generation: 0, providerName: 'onecomputer', providerSandboxId: null, status: 'allocating', allocationOperationId: `${leaseId}:op`, allocationIdempotencyKey: `${leaseId}:key`, createdAt: now.toISOString(), updatedAt: now.toISOString(), readyAt: null, releaseRequestedAt: null, releasedAt: null, lastError: null }
    await coordinator.insertRuntimeLease(lease, -1, ownerUserId)
    assert.equal((await coordinator.findActiveRuntimeLease(taskId, ownerUserId))?.status, 'allocating')
    await assert.rejects(() => coordinator.listRuntimeLeases(taskId, memberUserId), /does not exist for this owner/)
    const readyLease: RuntimeLeaseRecord = { ...lease, status: 'ready', providerSandboxId: 'sandbox-coordinator', updatedAt: new Date(now.getTime() + 2).toISOString(), readyAt: new Date(now.getTime() + 2).toISOString() }
    await coordinator.transitionRuntimeLease(leaseId, { generation: 0, status: 'allocating', updatedAt: lease.updatedAt }, readyLease, ownerUserId)

    await coordinator.close()
    coordinator = new PostgresStateCoordinator(databaseUrl, { maxConnections: 1 })
    const restored = await coordinator.load(ownerUserId)
    assert.deepEqual(restored.tasks.map((item) => item.id), [taskId])
    assert.deepEqual((await coordinator.listOrganizationsForUser(memberUserId)).map((item) => item.id), [orgId])
    assert.deepEqual((await coordinator.listOrganizationMembers(orgId, ownerUserId)).map((item) => item.userId), [ownerUserId, memberUserId])
    assert.deepEqual((await coordinator.listMcpConfigs(ownerUserId)).map((item) => item.id), [restartMcpId])
    assert.equal((await coordinator.listMcpAudit(restartMcpId, ownerUserId)).length, 1)
    assert.deepEqual((await coordinator.listSkillInstallations(ownerUserId)).map((item) => item.id), [skillId])
    assert.equal((await coordinator.findActiveRuntimeLease(taskId, ownerUserId))?.status, 'ready')
    await coordinator.removeOrganizationMember(orgId, memberUserId, ownerUserId)
    await assert.rejects(() => coordinator.listOrganizationMembers(orgId, memberUserId), /does not exist for this user/)

    const turn = await coordinator.beginTurn(task, `${taskId}:turn:1`, 'client-1', 'Hello from the composed boundary.', now)
    await coordinator.createAssistantPlaceholder(task, turn.id, `${taskId}:assistant:1`, now)
    const placeholder = (await coordinator.listMessages(task)).find((message) => message.id === `${taskId}:assistant:1`)
    assert.ok(placeholder)
    await coordinator.appendAssistantDelta(task, placeholder.id, 0, 'Durable answer.', 'streaming')
    const event = await coordinator.appendEvent(task, { id: `${taskId}:event:1`, runId: turn.id, type: 'assistant_text_delta', lane: 'transcript', content: 'Durable answer.', payload: {}, createdAt: now, previousHash: 'GENESIS', eventHash: 'a'.repeat(64) })
    assert.equal(event.sequence, 0)
    const nativeEvent = {
      id: `${taskId}:native:1`, conversationId: task.id, runId: turn.id, source: 'claude_agent_sdk', sourceEventId: 'sdk-1',
      sourceSequence: 0, nativeType: 'assistant_message', payloadJson: '{"text":"Durable answer."}', payloadHash: 'b'.repeat(64), receivedAt: now.toISOString(),
    } as const
    await assert.rejects(() => coordinator.appendNativeEvent(task, { ...nativeEvent, id: `${taskId}:native:invalid`, payloadJson: '[]' }), /payload must be an object/)
    await coordinator.appendNativeEvent(task, nativeEvent)
    assert.deepEqual((await coordinator.findNativeEvent(task, turn.id, nativeEvent.source, nativeEvent.sourceEventId))?.id, nativeEvent.id)
    assert.deepEqual((await coordinator.listNativeEvents(task, turn.id, nativeEvent.source)).map((item) => item.sourceSequence), [0])
    assert.equal(await coordinator.findNativeEvent({ ...task, ownerUserId: 'different-owner' }, turn.id, nativeEvent.source, nativeEvent.sourceEventId), undefined)
    await coordinator.appendNativeEventProjection(task, { nativeEventId: nativeEvent.id, projectionIndex: 0, runtimeEventId: event.id, projectorVersion: 1, projectedAt: now.toISOString() })
    await coordinator.setNativeProjectionOffset(task, { conversationId: task.id, runId: turn.id, source: nativeEvent.source, projectorVersion: 1, lastSourceSequence: 0, updatedAt: now.toISOString() })
    assert.equal((await coordinator.getNativeProjectionOffset(task, turn.id, nativeEvent.source, 1))?.lastSourceSequence, 0)
    await coordinator.setNativeProjectionOffset(task, { conversationId: task.id, runId: turn.id, source: nativeEvent.source, projectorVersion: 1, lastSourceSequence: -1, updatedAt: new Date(now.getTime() + 1).toISOString() })
    assert.equal((await coordinator.getNativeProjectionOffset(task, turn.id, nativeEvent.source, 1))?.lastSourceSequence, 0, 'projection offsets must be monotonic')
    await assert.rejects(() => coordinator.appendNativeEvent(task, { ...nativeEvent, id: `${taskId}:native:duplicate-id`, sourceEventId: 'sdk-2' }), /conflicts with the current source cursor/)
    await assert.rejects(() => coordinator.appendNativeEvent(task, { ...nativeEvent, id: `${taskId}:native:duplicate-sequence`, sourceEventId: 'sdk-3' }), /conflicts with the current source cursor/)
    await coordinator.finishTurn(task, turn.id, 'completed', new Date(now.getTime() + 1))
    const messages = await coordinator.listMessages(task)
    assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant'])
    assert.equal(messages[1]?.content, 'Durable answer.')
    assert.equal((await coordinator.listEvents(task)).length, 1)
    await coordinator.close()
    coordinator = new PostgresStateCoordinator(databaseUrl, { maxConnections: 1 })
    assert.deepEqual((await coordinator.listNativeEvents(task, turn.id, nativeEvent.source)).map((item) => item.id), [nativeEvent.id])
    assert.equal((await coordinator.getNativeProjectionOffset(task, turn.id, nativeEvent.source, 1))?.lastSourceSequence, 0)
    console.log(JSON.stringify({ repository: 'Postgres state coordinator', restoredTasks: restored.tasks.length, messageCount: messages.length, eventCount: 1, nativeEventCount: 1, nativeProjectionCount: 1, offsetSequence: 0, organizationMembers: 2, organizationRestartRecovery: true, mcpOwnerIsolation: true, mcpAuditOnActiveConfig: true, mcpDeleteOperation: true, skillOwnerIsolation: true, skillRestartRecovery: true, leaseStatus: 'ready', leaseOwnerIsolation: true, leaseRestartRecovery: true, restartRecovery: true, limitation: 'operational mutation-plus-audit and organization-plus-owner-member calls remain separate PostgresOperationsRepository calls; audit reads for a deleted MCP config remain unavailable through the owner-authorized coordinator wrapper; use e2e:postgres-taskstore for the composed running TaskStore proof' }, null, 2))
  } finally {
    await coordinator.close()
    for (const userId of [ownerUserId, memberUserId, outsiderUserId]) await sql`DELETE FROM "user" WHERE id = ${userId}`
  }
}

main().finally(() => sql.end({ timeout: 5 })).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
