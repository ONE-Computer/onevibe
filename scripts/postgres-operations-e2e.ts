import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { createPostgresMetadataRepository } from '../server/persistence/postgres-metadata.js'
import { createPostgresOperationsRepository } from '../server/persistence/postgres-operations.js'
import type { McpConfigRecord, OrganizationRecord, RuntimeLeaseRecord, SkillInstallationRecord } from '../server/persistence/contracts.js'
import type { Project, Task } from '../server/types.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const suffix = randomUUID().replaceAll('-', '')
const ownerUserId = `operations-owner-${suffix}`
const memberUserId = `operations-member-${suffix}`
const projectId = `project_operations_${suffix}`
const taskId = `task_operations_${suffix}`
const orgId = `org_operations_${suffix}`
const mcpId = `mcp_operations_${suffix}`
const skillId = `skill_operations_${suffix}`
const leaseId = `lease_operations_${suffix}`
const now = new Date()
const sql = postgres(databaseUrl, { max: 3, prepare: false })

const seedUser = (id: string) => sql`
  INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
  VALUES (${id}, ${id}, ${`${id}@example.invalid`}, true, ${now}, ${now})
`

const main = async () => {
  const metadata = createPostgresMetadataRepository(databaseUrl, { maxConnections: 1 })
  const operations = createPostgresOperationsRepository(databaseUrl, { maxConnections: 1 })
  const project: Project = { id: projectId, ownerUserId, name: 'Operations proof', context: '', files: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }
  const task: Task = { id: taskId, ownerUserId, title: 'Operations task', prompt: 'Exercise operational persistence.', provider: 'claude_sdk', mode: 'chat', skills: [], tags: [], queuedGuidance: [], projectId, references: [], attachments: [], status: 'pending', plan: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }
  await seedUser(ownerUserId); await seedUser(memberUserId)
  try {
    await metadata.repository.insertProject(project)
    await metadata.repository.insertTask(task)
    const organization: OrganizationRecord = { id: orgId, name: 'Operations org', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await operations.repository.insertOrganization(organization)
    await operations.repository.insertMember({ organizationId: orgId, userId: ownerUserId, role: 'owner', createdAt: now.toISOString() })
    await operations.repository.insertMember({ organizationId: orgId, userId: memberUserId, role: 'member', createdAt: now.toISOString() })
    assert.equal((await operations.repository.listOrganizationsForUser(memberUserId)).length, 1)
    assert.equal((await operations.repository.listMembers(orgId)).length, 2)

    const mcp: McpConfigRecord = { id: mcpId, ownerUserId, name: 'Operations MCP', command: 'node', argsJson: JSON.stringify(['fixture.mjs']), createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await operations.repository.insertMcpConfig(mcp)
    await operations.repository.appendMcpAudit({ id: `${mcpId}:created`, configId: mcpId, action: 'created', name: mcp.name, command: mcp.command, argsJson: mcp.argsJson, createdAt: now.toISOString() }, ownerUserId)
    assert.equal((await operations.repository.listMcpConfigs(memberUserId)).length, 0)
    assert.equal((await operations.repository.listMcpConfigs(ownerUserId)).length, 1)
    assert.equal(await operations.repository.deleteMcpConfig(mcpId, ownerUserId), true)
    await operations.repository.appendMcpAudit({ id: `${mcpId}:deleted`, configId: mcpId, action: 'deleted', name: mcp.name, command: mcp.command, argsJson: mcp.argsJson, createdAt: new Date(now.getTime() + 1).toISOString() }, ownerUserId)
    assert.equal((await operations.repository.listMcpAudit(mcpId)).length, 2)

    const skill: SkillInstallationRecord = { id: skillId, ownerUserId, version: 1, title: 'Operations skill', summary: 'Proof skill', sha256: 'a'.repeat(64), content: '# Proof', contentUrl: 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json', sourceUrl: 'https://github.com/ONE-Computer/onevibe', createdAt: now.toISOString(), updatedAt: now.toISOString() }
    await operations.repository.insertSkill(skill)
    assert.equal((await operations.repository.listSkills(ownerUserId)).length, 1)
    assert.equal((await operations.repository.listSkills(memberUserId)).length, 0)
    assert.equal(await operations.repository.deleteSkill(skillId, ownerUserId), true)

    const lease: RuntimeLeaseRecord = { id: leaseId, conversationId: taskId, generation: 0, providerName: 'onecomputer', providerSandboxId: null, status: 'allocating', allocationOperationId: `${leaseId}:op`, allocationIdempotencyKey: `${leaseId}:key`, createdAt: now.toISOString(), updatedAt: now.toISOString(), readyAt: null, releaseRequestedAt: null, releasedAt: null, lastError: null }
    await operations.repository.insertLease(lease, -1)
    assert.equal((await operations.repository.findActiveLease(taskId))?.status, 'allocating')
    const ready: RuntimeLeaseRecord = { ...lease, status: 'ready', providerSandboxId: 'sandbox-proof', generation: 0, updatedAt: new Date(now.getTime() + 2).toISOString(), readyAt: new Date(now.getTime() + 2).toISOString() }
    await operations.repository.transitionLease(leaseId, { generation: 0, status: 'allocating', updatedAt: lease.updatedAt }, ready)
    assert.equal((await operations.repository.listLeases(taskId))[0]?.status, 'ready')

    const requestHash = 'b'.repeat(64)
    assert.equal(await operations.repository.claimIdempotency('e2e', `${taskId}:retry`, requestHash, now.toISOString(), ownerUserId), true)
    assert.equal(await operations.repository.claimIdempotency('e2e', `${taskId}:retry`, requestHash, now.toISOString(), ownerUserId), false)
    await operations.repository.completeIdempotency('e2e', `${taskId}:retry`, JSON.stringify({ accepted: true }), new Date(now.getTime() + 3).toISOString())
    assert.equal((await operations.repository.findIdempotency('e2e', `${taskId}:retry`))?.state, 'completed')

    console.log(JSON.stringify({ repository: 'Postgres operations', organizationMembers: 2, mcpAuditAfterDelete: (await operations.repository.listMcpAudit(mcpId)).length, skillsOwnerScoped: true, leaseStatus: (await operations.repository.findActiveLease(taskId))?.status, idempotencyReplay: true, limitation: 'not yet selected by the running TaskStore/server driver' }, null, 2))
  } finally {
    await metadata.close(); await operations.close(); await sql`DELETE FROM "user" WHERE id = ${ownerUserId} OR id = ${memberUserId}`
  }
}

main().finally(() => sql.end({ timeout: 5 })).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
