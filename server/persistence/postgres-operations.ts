import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import type { FollowUpAttachmentRecord, FollowUpAttachmentState, FollowUpOperationRecord, FollowUpOperationState, IdempotencyRecord, McpConfigAuditRecord, McpConfigRecord, OrganizationMemberRecord, OrganizationRecord, RuntimeLeaseFence, RuntimeLeaseRecord, SkillInstallationRecord, TenantThemeAuditSummary, TenantThemeConfigRecord } from './contracts.js'
import { IdempotencyConflictError, OptimisticConflictError, RecordNotFoundError, ThemeVersionConflictError } from './errors.js'

export type PostgresOperationsSql = Sql<Record<string, never>>

type McpRow = { id: string; owner_user_id: string | null; name: string; command: string; args_json: unknown; created_at: Date; updated_at: Date }
type OrganizationRow = { id: string; name: string; created_at: Date; updated_at: Date }
type MemberRow = { org_id: string; user_id: string; role: 'owner' | 'member'; created_at: Date }
type TenantThemeRow = { tenant_id: string; org_id: string; owner_user_id: string; version: number; customized: boolean; config_json: unknown; created_by: string; updated_by: string; created_at: Date; updated_at: Date }
type SkillRow = { id: string; owner_scope: string; owner_user_id: string | null; version: number; title: string; summary: string; sha256: string; content: string; content_url: string; source_url: string; created_at: Date; updated_at: Date }
type LeaseRow = { id: string; task_id: string; generation: number; provider_name: string; provider_sandbox_id: string | null; status: RuntimeLeaseRecord['status']; allocation_operation_id: string; allocation_idempotency_key: string; created_at: Date; updated_at: Date; ready_at: Date | null; release_requested_at: Date | null; released_at: Date | null; last_error_json: unknown }
type IdempotencyRow = { scope: string; key: string; owner_user_id: string | null; request_hash: string; state: 'pending' | 'completed'; response_json: unknown; created_at: Date; completed_at: Date | null }
type FollowUpOperationRow = {
  id: string; task_id: string; owner_user_id: string | null; idempotency_key: string; request_hash: string; prompt: string;
  attachments_json: unknown; execution_mode: 'queued' | 'immediate'; state: FollowUpOperationState; guidance_id: string | null;
  turn_id: string | null; response_json: unknown; error_json: unknown; lease_owner: string | null; lease_expires_at: Date | null;
  attempt_count: number; execution_id: string; provider_request_id: string; provider_state: FollowUpOperationRecord['providerState'];
  provider_started_at: Date | null; provider_completed_at: Date | null; created_at: Date; updated_at: Date; started_at: Date | null; completed_at: Date | null
}
type FollowUpAttachmentRow = {
  id: string; operation_id: string; task_id: string; owner_user_id: string | null; path: string; name: string; mime_type: string;
  size: number; sha256: string; content: Buffer; state: FollowUpAttachmentState; created_at: Date; updated_at: Date
}

const toIso = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString() : value ?? null
const argsString = (value: unknown) => JSON.stringify(Array.isArray(value) ? value : [])
const parseJson = (value: string | null) => {
  try { return value ? JSON.parse(value) as unknown : null } catch { return null }
}
const mcpFromRow = (row: McpRow): McpConfigRecord => ({ id: row.id, ownerUserId: row.owner_user_id, name: row.name, command: row.command, argsJson: argsString(row.args_json), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })
const orgFromRow = (row: OrganizationRow): OrganizationRecord => ({ id: row.id, name: row.name, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })
const memberFromRow = (row: MemberRow): OrganizationMemberRecord => ({ organizationId: row.org_id, userId: row.user_id, role: row.role, createdAt: row.created_at.toISOString() })
const tenantThemeFromRow = (row: TenantThemeRow): TenantThemeConfigRecord => ({
  tenantId: row.tenant_id, organizationId: row.org_id, ownerUserId: row.owner_user_id, version: row.version, customized: row.customized,
  configJson: typeof row.config_json === 'string' ? row.config_json : JSON.stringify(row.config_json),
  createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
})
const skillFromRow = (row: SkillRow): SkillInstallationRecord => ({ id: row.id, ownerUserId: row.owner_user_id, version: row.version, title: row.title, summary: row.summary, sha256: row.sha256, content: row.content, contentUrl: row.content_url, sourceUrl: row.source_url, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })
const leaseFromRow = (row: LeaseRow): RuntimeLeaseRecord => ({ id: row.id, conversationId: row.task_id, generation: row.generation, providerName: row.provider_name, providerSandboxId: row.provider_sandbox_id, status: row.status, allocationOperationId: row.allocation_operation_id, allocationIdempotencyKey: row.allocation_idempotency_key, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), readyAt: toIso(row.ready_at), releaseRequestedAt: toIso(row.release_requested_at), releasedAt: toIso(row.released_at), lastError: row.last_error_json && typeof row.last_error_json === 'object' ? row.last_error_json as RuntimeLeaseRecord['lastError'] : null })
const responseJsonFromRow = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return JSON.stringify(value)
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } catch {
    return value
  }
}
const idempotencyFromRow = (row: IdempotencyRow): IdempotencyRecord => ({ scope: row.scope, key: row.key, requestHash: row.request_hash, state: row.state, responseJson: responseJsonFromRow(row.response_json), createdAt: row.created_at.toISOString(), completedAt: toIso(row.completed_at) })
const jsonStringFromRow = (value: unknown): string | null => value === null || value === undefined ? null : typeof value === 'string' ? value : JSON.stringify(value)
const followUpOperationFromRow = (row: FollowUpOperationRow): FollowUpOperationRecord => ({
  id: row.id, taskId: row.task_id, ownerUserId: row.owner_user_id, idempotencyKey: row.idempotency_key, requestHash: row.request_hash,
  prompt: row.prompt, attachmentsJson: jsonStringFromRow(row.attachments_json) ?? '[]', executionMode: row.execution_mode, state: row.state,
  guidanceId: row.guidance_id, turnId: row.turn_id, responseJson: jsonStringFromRow(row.response_json), errorJson: jsonStringFromRow(row.error_json),
  leaseOwner: row.lease_owner, leaseExpiresAt: toIso(row.lease_expires_at), attemptCount: row.attempt_count,
  executionId: row.execution_id, providerRequestId: row.provider_request_id, providerState: row.provider_state,
  providerStartedAt: toIso(row.provider_started_at), providerCompletedAt: toIso(row.provider_completed_at),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), startedAt: toIso(row.started_at), completedAt: toIso(row.completed_at),
})
const followUpAttachmentFromRow = (row: FollowUpAttachmentRow): FollowUpAttachmentRecord => ({
  id: row.id, operationId: row.operation_id, taskId: row.task_id, ownerUserId: row.owner_user_id, path: row.path,
  name: row.name, mimeType: row.mime_type, size: row.size, sha256: row.sha256, content: Buffer.from(row.content), state: row.state,
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
})

const leaseValues = (record: RuntimeLeaseRecord) => ({
  id: record.id, taskId: record.conversationId, generation: record.generation, providerName: record.providerName, providerSandboxId: record.providerSandboxId,
  status: record.status, allocationOperationId: record.allocationOperationId, allocationIdempotencyKey: record.allocationIdempotencyKey,
  createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt), readyAt: record.readyAt ? new Date(record.readyAt) : null,
  releaseRequestedAt: record.releaseRequestedAt ? new Date(record.releaseRequestedAt) : null, releasedAt: record.releasedAt ? new Date(record.releasedAt) : null,
  lastError: record.lastError ? JSON.stringify(record.lastError) : null,
})

export class PostgresOperationsRepository {
  constructor(private readonly sql: PostgresOperationsSql) {}

  async listMcpConfigs(ownerUserId?: string): Promise<McpConfigRecord[]> {
    const rows = await this.sql<McpRow[]>`
      SELECT id, owner_user_id, name, command, args_json, created_at, updated_at FROM runtime_mcp_config
      ${ownerUserId ? this.sql`WHERE owner_user_id = ${ownerUserId}` : this.sql``}
      ORDER BY updated_at DESC, id ASC
    `
    return rows.map(mcpFromRow)
  }

  async insertMcpConfig(record: McpConfigRecord): Promise<void> {
    await this.sql`
      INSERT INTO runtime_mcp_config (id, owner_user_id, name, command, args_json, created_at, updated_at)
      VALUES (${record.id}, ${record.ownerUserId}, ${record.name}, ${record.command}, ${jsonArray(record.argsJson)}::jsonb, ${new Date(record.createdAt)}, ${new Date(record.updatedAt)})
    `
  }

  async deleteMcpConfig(id: string, ownerUserId?: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM runtime_mcp_config WHERE id = ${id} ${ownerUserId ? this.sql`AND owner_user_id = ${ownerUserId}` : this.sql``}`
    return result.count === 1
  }

  async appendMcpAudit(record: McpConfigAuditRecord, ownerUserId: string): Promise<void> {
    await this.sql`
      INSERT INTO runtime_mcp_config_events (id, config_id, owner_user_id, operation, config_json, created_at)
      VALUES (${record.id}, ${record.configId}, ${ownerUserId}, ${record.action}, ${JSON.stringify({ name: record.name, command: record.command, args: parseJson(record.argsJson) })}::jsonb, ${new Date(record.createdAt)})
    `
  }

  async listMcpAudit(configId: string): Promise<Array<{ id: string; configId: string; operation: string; config: unknown; createdAt: string }>> {
    const rows = await this.sql<{ id: string; config_id: string; operation: string; config_json: unknown; created_at: Date }[]>`
      SELECT id, config_id, operation, config_json, created_at FROM runtime_mcp_config_events WHERE config_id = ${configId} ORDER BY created_at ASC, id ASC
    `
    return rows.map((row) => ({ id: row.id, configId: row.config_id, operation: row.operation, config: row.config_json, createdAt: row.created_at.toISOString() }))
  }

  async insertOrganization(record: OrganizationRecord): Promise<void> {
    await this.sql`INSERT INTO org (id, name, created_at, updated_at) VALUES (${record.id}, ${record.name}, ${new Date(record.createdAt)}, ${new Date(record.updatedAt)})`
  }

  async listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]> {
    const rows = await this.sql<OrganizationRow[]>`
      SELECT o.id, o.name, o.created_at, o.updated_at FROM org o INNER JOIN org_member m ON m.org_id = o.id WHERE m.user_id = ${userId} ORDER BY o.updated_at DESC, o.id ASC
    `
    return rows.map(orgFromRow)
  }

  async listMembers(organizationId: string): Promise<OrganizationMemberRecord[]> {
    const rows = await this.sql<MemberRow[]>`SELECT org_id, user_id, role, created_at FROM org_member WHERE org_id = ${organizationId} ORDER BY created_at ASC, user_id ASC`
    return rows.map(memberFromRow)
  }

  async findMember(organizationId: string, userId: string): Promise<OrganizationMemberRecord | undefined> {
    const rows = await this.sql<MemberRow[]>`SELECT org_id, user_id, role, created_at FROM org_member WHERE org_id = ${organizationId} AND user_id = ${userId}`
    return rows[0] ? memberFromRow(rows[0]) : undefined
  }

  async userExists(userId: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`SELECT id FROM "user" WHERE id = ${userId}`
    return Boolean(rows[0])
  }

  async insertMember(record: OrganizationMemberRecord): Promise<void> {
    await this.sql`INSERT INTO org_member (org_id, user_id, role, created_at) VALUES (${record.organizationId}, ${record.userId}, ${record.role}, ${new Date(record.createdAt)})`
  }

  async deleteMember(organizationId: string, userId: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM org_member WHERE org_id = ${organizationId} AND user_id = ${userId}`
    return result.count === 1
  }

  async findTenantTheme(tenantId: string): Promise<TenantThemeConfigRecord | undefined> {
    const rows = await this.sql<TenantThemeRow[]>`
      SELECT tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at
      FROM tenant_theme_config WHERE tenant_id = ${tenantId}
    `
    return rows[0] ? tenantThemeFromRow(rows[0]) : undefined
  }

  async listTenantThemesForOrganizations(organizationIds: string[]): Promise<TenantThemeConfigRecord[]> {
    if (!organizationIds.length) return []
    const rows = await this.sql<TenantThemeRow[]>`
      SELECT tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at
      FROM tenant_theme_config WHERE org_id IN ${this.sql(organizationIds)}
      ORDER BY updated_at DESC, tenant_id ASC
    `
    return rows.map(tenantThemeFromRow)
  }

  async summarizeTenantThemeAuditForOrganizations(organizationIds: string[]): Promise<TenantThemeAuditSummary> {
    if (!organizationIds.length) return { tenantCount: 0, eventCount: 0, latestOperation: null, latestAt: null }
    const counts = await this.sql<{ tenant_count: number; event_count: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM tenant_theme_config WHERE org_id IN ${this.sql(organizationIds)}) AS tenant_count,
        (SELECT COUNT(*)::int FROM tenant_theme_config_event WHERE org_id IN ${this.sql(organizationIds)}) AS event_count
    `
    const latest = await this.sql<{ operation: string; created_at: Date }[]>`
      SELECT operation, created_at FROM tenant_theme_config_event
      WHERE org_id IN ${this.sql(organizationIds)}
      ORDER BY created_at DESC, id DESC LIMIT 1
    `
    const latestOperation = latest[0]?.operation
    return {
      tenantCount: counts[0]?.tenant_count ?? 0,
      eventCount: counts[0]?.event_count ?? 0,
      latestOperation: latestOperation === 'created' || latestOperation === 'updated' || latestOperation === 'reset' ? latestOperation : null,
      latestAt: latest[0]?.created_at?.toISOString() ?? null,
    }
  }

  async putTenantTheme(tenantId: string, organizationId: string | undefined, configJson: string, actorUserId: string, expectedVersion: number): Promise<TenantThemeConfigRecord> {
    return this.sql.begin(async (tx) => {
      const existingRows = await tx<TenantThemeRow[]>`
        SELECT tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at
        FROM tenant_theme_config WHERE tenant_id = ${tenantId} FOR UPDATE
      `
      const existing = existingRows[0]
      const targetOrganizationId = existing?.org_id ?? organizationId
      if (!targetOrganizationId) throw new RecordNotFoundError(`Tenant theme ${tenantId} is not provisioned`)
      const members = await tx<MemberRow[]>`SELECT org_id, user_id, role, created_at FROM org_member WHERE org_id = ${targetOrganizationId} AND user_id = ${actorUserId}`
      const member = members[0]
      if (!member) throw new RecordNotFoundError(`Tenant theme ${tenantId} does not exist for this user`)
      if (member.role !== 'owner') throw new Error('Organization owner access required')
      const now = new Date()
      if (!existing) {
        if (expectedVersion !== 0) throw new ThemeVersionConflictError(`Tenant theme ${tenantId} does not exist at version ${expectedVersion}`)
        const created: TenantThemeConfigRecord = {
          tenantId, organizationId: targetOrganizationId, ownerUserId: actorUserId, version: 1, customized: true,
          configJson, createdBy: actorUserId, updatedBy: actorUserId, createdAt: now.toISOString(), updatedAt: now.toISOString(),
        }
        await tx`
          INSERT INTO tenant_theme_config (tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at)
          VALUES (${created.tenantId}, ${created.organizationId}, ${created.ownerUserId}, ${created.version}, ${created.customized}, ${created.configJson}::jsonb, ${created.createdBy}, ${created.updatedBy}, ${now}, ${now})
        `
        await tx`
          INSERT INTO tenant_theme_config_event (id, tenant_id, org_id, version, operation, actor_user_id, config_json, created_at)
          VALUES (${`theme_event_${randomUUID()}`}, ${created.tenantId}, ${created.organizationId}, ${created.version}, 'created', ${actorUserId}, ${created.configJson}::jsonb, ${now})
        `
        return created
      }
      if (expectedVersion !== existing.version) throw new ThemeVersionConflictError(`Tenant theme ${tenantId} was modified concurrently`)
      const updated: TenantThemeConfigRecord = {
        ...tenantThemeFromRow(existing), version: existing.version + 1, customized: true, configJson,
        updatedBy: actorUserId, updatedAt: now.toISOString(),
      }
      await tx`
        UPDATE tenant_theme_config SET version = ${updated.version}, customized = true, config_json = ${updated.configJson}::jsonb, updated_by = ${actorUserId}, updated_at = ${now}
        WHERE tenant_id = ${tenantId} AND version = ${expectedVersion}
      `
      await tx`
        INSERT INTO tenant_theme_config_event (id, tenant_id, org_id, version, operation, actor_user_id, config_json, created_at)
        VALUES (${`theme_event_${randomUUID()}`}, ${updated.tenantId}, ${updated.organizationId}, ${updated.version}, 'updated', ${actorUserId}, ${updated.configJson}::jsonb, ${now})
      `
      return updated
    })
  }

  async resetTenantTheme(tenantId: string, baseConfigJson: string, actorUserId: string, expectedVersion: number): Promise<TenantThemeConfigRecord> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<TenantThemeRow[]>`
        SELECT tenant_id, org_id, owner_user_id, version, customized, config_json, created_by, updated_by, created_at, updated_at
        FROM tenant_theme_config WHERE tenant_id = ${tenantId} FOR UPDATE
      `
      const existing = rows[0]
      if (!existing) throw new RecordNotFoundError(`Tenant theme ${tenantId} does not exist`)
      const members = await tx<MemberRow[]>`SELECT org_id, user_id, role, created_at FROM org_member WHERE org_id = ${existing.org_id} AND user_id = ${actorUserId}`
      const member = members[0]
      if (!member) throw new RecordNotFoundError(`Tenant theme ${tenantId} does not exist for this user`)
      if (member.role !== 'owner') throw new Error('Organization owner access required')
      if (expectedVersion !== existing.version) throw new ThemeVersionConflictError(`Tenant theme ${tenantId} was modified concurrently`)
      const now = new Date()
      const updated: TenantThemeConfigRecord = { ...tenantThemeFromRow(existing), version: existing.version + 1, customized: false, configJson: baseConfigJson, updatedBy: actorUserId, updatedAt: now.toISOString() }
      await tx`
        UPDATE tenant_theme_config SET version = ${updated.version}, customized = false, config_json = ${updated.configJson}::jsonb, updated_by = ${actorUserId}, updated_at = ${now}
        WHERE tenant_id = ${tenantId} AND version = ${expectedVersion}
      `
      await tx`
        INSERT INTO tenant_theme_config_event (id, tenant_id, org_id, version, operation, actor_user_id, config_json, created_at)
        VALUES (${`theme_event_${randomUUID()}`}, ${updated.tenantId}, ${updated.organizationId}, ${updated.version}, 'reset', ${actorUserId}, ${updated.configJson}::jsonb, ${now})
      `
      return updated
    })
  }

  async listSkills(ownerUserId?: string): Promise<SkillInstallationRecord[]> {
    const rows = await this.sql<SkillRow[]>`
      SELECT id, owner_scope, owner_user_id, version, title, summary, sha256, content, content_url, source_url, created_at, updated_at FROM skill_installations
      ${ownerUserId ? this.sql`WHERE owner_scope = ${ownerUserId} OR owner_scope = 'global'` : this.sql``}
      ORDER BY updated_at DESC, id ASC
    `
    return rows.map(skillFromRow)
  }

  async insertSkill(record: SkillInstallationRecord): Promise<void> {
    const ownerScope = record.ownerUserId ?? 'global'
    await this.sql`
      INSERT INTO skill_installations (id, owner_scope, owner_user_id, version, title, summary, sha256, content, content_url, source_url, created_at, updated_at)
      VALUES (${record.id}, ${ownerScope}, ${record.ownerUserId}, ${record.version}, ${record.title}, ${record.summary}, ${record.sha256}, ${record.content}, ${record.contentUrl}, ${record.sourceUrl}, ${new Date(record.createdAt)}, ${new Date(record.updatedAt)})
    `
  }

  async deleteSkill(id: string, ownerUserId?: string): Promise<boolean> {
    const result = await this.sql`DELETE FROM skill_installations WHERE id = ${id} ${ownerUserId ? this.sql`AND owner_scope = ${ownerUserId}` : this.sql``}`
    return result.count === 1
  }

  async findIdempotency(scope: string, key: string): Promise<IdempotencyRecord | undefined> {
    const rows = await this.sql<IdempotencyRow[]>`SELECT scope, key, owner_user_id, request_hash, state, response_json, created_at, completed_at FROM idempotency_key WHERE scope = ${scope} AND key = ${key}`
    return rows[0] ? idempotencyFromRow(rows[0]) : undefined
  }

  async claimIdempotency(scope: string, key: string, requestHash: string, createdAt: string, ownerUserId?: string): Promise<boolean> {
    const result = await this.sql`
      INSERT INTO idempotency_key (scope, key, owner_user_id, request_hash, state, created_at)
      VALUES (${scope}, ${key}, ${ownerUserId ?? null}, ${requestHash}, 'pending', ${new Date(createdAt)}) ON CONFLICT (scope, key) DO NOTHING
    `
    if (result.count === 1) return true
    const existing = await this.findIdempotency(scope, key)
    if (!existing) throw new RecordNotFoundError(`Idempotency key ${scope}/${key} is missing after a conflict`)
    if (existing.requestHash !== requestHash) throw new IdempotencyConflictError(`Idempotency key ${scope}/${key} was reused with a different request`)
    return false
  }

  async completeIdempotency(scope: string, key: string, responseJson: string, completedAt: string): Promise<void> {
    let parsedResponse: unknown
    try { parsedResponse = JSON.parse(responseJson) } catch { throw new TypeError('Idempotency response must be valid JSON') }
    const encodedResponse = JSON.stringify(parsedResponse)
    const result = await this.sql`
      UPDATE idempotency_key SET state = 'completed', response_json = ${encodedResponse}::jsonb, completed_at = ${new Date(completedAt)}
      WHERE scope = ${scope} AND key = ${key} AND state = 'pending'
    `
    if (result.count === 1) return
    const existing = await this.findIdempotency(scope, key)
    if (!existing) throw new RecordNotFoundError(`Idempotency key ${scope}/${key} does not exist`)
    if (existing.state === 'completed' && existing.responseJson === encodedResponse) return
    throw new OptimisticConflictError(`Idempotency key ${scope}/${key} is already completed with a different response`)
  }

  async findFollowUpOperation(taskId: string, idempotencyKey: string): Promise<FollowUpOperationRecord | undefined> {
    const rows = await this.sql<FollowUpOperationRow[]>`SELECT id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at FROM follow_up_operation WHERE task_id = ${taskId} AND idempotency_key = ${idempotencyKey}`
    return rows[0] ? followUpOperationFromRow(rows[0]) : undefined
  }

  async listRecoverableFollowUpOperations(): Promise<FollowUpOperationRecord[]> {
    const rows = await this.sql<FollowUpOperationRow[]>`SELECT id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at FROM follow_up_operation WHERE state IN ('prepared', 'ready', 'running') ORDER BY created_at ASC, id ASC`
    return rows.map(followUpOperationFromRow)
  }

  async createFollowUpOperation(record: FollowUpOperationRecord, attachments: FollowUpAttachmentRecord[] = []): Promise<{ claimed: boolean; operation: FollowUpOperationRecord }> {
    return this.sql.begin(async (tx) => {
      const existingRows = await tx<FollowUpOperationRow[]>`SELECT id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at FROM follow_up_operation WHERE task_id = ${record.taskId} AND idempotency_key = ${record.idempotencyKey} FOR UPDATE`
      const existing = existingRows[0]
      if (existing) {
        const operation = followUpOperationFromRow(existing)
        if (operation.requestHash !== record.requestHash) throw new IdempotencyConflictError(`Follow-up operation ${record.taskId}/${record.idempotencyKey} was reused with a different request`)
        return { claimed: false, operation }
      }
      const rows = await tx<FollowUpOperationRow[]>`
        INSERT INTO follow_up_operation (id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at)
        VALUES (${record.id}, ${record.taskId}, ${record.ownerUserId}, ${record.idempotencyKey}, ${record.requestHash}, ${record.prompt}, ${record.attachmentsJson}::jsonb, ${record.executionMode}, ${record.state}, ${record.guidanceId}, ${record.turnId}, ${record.responseJson ? record.responseJson : null}::jsonb, ${record.errorJson ? record.errorJson : null}::jsonb, ${record.leaseOwner}, ${record.leaseExpiresAt ? new Date(record.leaseExpiresAt) : null}, ${record.attemptCount}, ${record.executionId}, ${record.providerRequestId}, ${record.providerState}, ${record.providerStartedAt ? new Date(record.providerStartedAt) : null}, ${record.providerCompletedAt ? new Date(record.providerCompletedAt) : null}, ${new Date(record.createdAt)}, ${new Date(record.updatedAt)}, ${record.startedAt ? new Date(record.startedAt) : null}, ${record.completedAt ? new Date(record.completedAt) : null})
        RETURNING id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at
      `
      if (!rows[0]) throw new OptimisticConflictError(`Follow-up operation ${record.id} was not persisted`)
      for (const attachment of attachments) await tx`
        INSERT INTO follow_up_attachment(id, operation_id, task_id, owner_user_id, path, name, mime_type, size, sha256, content, state, created_at, updated_at)
        VALUES (${attachment.id}, ${attachment.operationId}, ${attachment.taskId}, ${attachment.ownerUserId}, ${attachment.path}, ${attachment.name}, ${attachment.mimeType}, ${attachment.size}, ${attachment.sha256}, ${Buffer.from(attachment.content)}, ${attachment.state}, ${new Date(attachment.createdAt)}, ${new Date(attachment.updatedAt)})
      `
      return { claimed: true, operation: followUpOperationFromRow(rows[0]) }
    })
  }

  async updateFollowUpOperation(record: FollowUpOperationRecord, expectedUpdatedAt: string): Promise<void> {
    const result = await this.sql`
      UPDATE follow_up_operation SET state = ${record.state}, guidance_id = ${record.guidanceId}, turn_id = ${record.turnId},
        response_json = ${record.responseJson ? record.responseJson : null}::jsonb, error_json = ${record.errorJson ? record.errorJson : null}::jsonb,
        lease_owner = ${record.leaseOwner}, lease_expires_at = ${record.leaseExpiresAt ? new Date(record.leaseExpiresAt) : null}, attempt_count = ${record.attemptCount}, execution_id = ${record.executionId}, provider_request_id = ${record.providerRequestId}, provider_state = ${record.providerState}, provider_started_at = ${record.providerStartedAt ? new Date(record.providerStartedAt) : null}, provider_completed_at = ${record.providerCompletedAt ? new Date(record.providerCompletedAt) : null},
        updated_at = ${new Date(record.updatedAt)}, started_at = ${record.startedAt ? new Date(record.startedAt) : null}, completed_at = ${record.completedAt ? new Date(record.completedAt) : null}
      WHERE id = ${record.id} AND updated_at = ${new Date(expectedUpdatedAt)}
    `
    if (result.count === 1) return
    const existing = await this.sql<{ id: string }[]>`SELECT id FROM follow_up_operation WHERE id = ${record.id}`
    if (!existing[0]) throw new RecordNotFoundError(`Follow-up operation ${record.id} does not exist`)
    throw new OptimisticConflictError(`Follow-up operation ${record.id} was modified concurrently`)
  }

  async claimFollowUpOperation(recordId: string, leaseOwner: string, now: string, leaseExpiresAt: string): Promise<FollowUpOperationRecord | undefined> {
    const rows = await this.sql<FollowUpOperationRow[]>`
      UPDATE follow_up_operation
      SET state = 'running', lease_owner = ${leaseOwner}, lease_expires_at = ${new Date(leaseExpiresAt)}, attempt_count = attempt_count + 1, updated_at = ${new Date(now)}
      WHERE id = ${recordId} AND state = 'ready' AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ${new Date(now)})
      RETURNING id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at
    `
    return rows[0] ? followUpOperationFromRow(rows[0]) : undefined
  }

  async renewFollowUpOperation(recordId: string, leaseOwner: string, now: string, leaseExpiresAt: string): Promise<FollowUpOperationRecord | undefined> {
    const rows = await this.sql<FollowUpOperationRow[]>`
      UPDATE follow_up_operation
      SET lease_expires_at = ${new Date(leaseExpiresAt)}, updated_at = ${new Date(now)}
      WHERE id = ${recordId} AND state = 'running' AND lease_owner = ${leaseOwner}
      RETURNING id, task_id, owner_user_id, idempotency_key, request_hash, prompt, attachments_json, execution_mode, state, guidance_id, turn_id, response_json, error_json, lease_owner, lease_expires_at, attempt_count, execution_id, provider_request_id, provider_state, provider_started_at, provider_completed_at, created_at, updated_at, started_at, completed_at
    `
    return rows[0] ? followUpOperationFromRow(rows[0]) : undefined
  }

  async listFollowUpAttachments(operationId: string): Promise<FollowUpAttachmentRecord[]> {
    const rows = await this.sql<FollowUpAttachmentRow[]>`SELECT id, operation_id, task_id, owner_user_id, path, name, mime_type, size, sha256, content, state, created_at, updated_at FROM follow_up_attachment WHERE operation_id = ${operationId} ORDER BY created_at ASC, id ASC`
    return rows.map(followUpAttachmentFromRow)
  }

  async insertFollowUpAttachments(records: FollowUpAttachmentRecord[]): Promise<void> {
    if (!records.length) return
    await this.sql.begin(async (tx) => {
      for (const record of records) await tx`
        INSERT INTO follow_up_attachment(id, operation_id, task_id, owner_user_id, path, name, mime_type, size, sha256, content, state, created_at, updated_at)
        VALUES (${record.id}, ${record.operationId}, ${record.taskId}, ${record.ownerUserId}, ${record.path}, ${record.name}, ${record.mimeType}, ${record.size}, ${record.sha256}, ${Buffer.from(record.content)}, ${record.state}, ${new Date(record.createdAt)}, ${new Date(record.updatedAt)})
      `
    })
  }

  async updateFollowUpAttachment(record: FollowUpAttachmentRecord, expectedUpdatedAt: string): Promise<void> {
    const result = await this.sql`
      UPDATE follow_up_attachment SET state = ${record.state}, path = ${record.path}, updated_at = ${new Date(record.updatedAt)}
      WHERE id = ${record.id} AND updated_at = ${new Date(expectedUpdatedAt)}
    `
    if (result.count === 1) return
    const existing = await this.sql<{ id: string }[]>`SELECT id FROM follow_up_attachment WHERE id = ${record.id}`
    if (!existing[0]) throw new RecordNotFoundError(`Follow-up attachment ${record.id} does not exist`)
    throw new OptimisticConflictError(`Follow-up attachment ${record.id} was modified concurrently`)
  }

  async insertLease(record: RuntimeLeaseRecord, expectedPreviousGeneration: number): Promise<void> {
    const values = leaseValues(record)
    const previous = await this.sql<{ generation: number }[]>`SELECT generation FROM runtime_lease WHERE task_id = ${values.taskId} ORDER BY generation DESC LIMIT 1`
    const expected = previous[0]?.generation ?? -1
    if (expected !== expectedPreviousGeneration) throw new OptimisticConflictError(`Runtime lease generation for ${values.taskId} is stale`)
    await this.sql`
      INSERT INTO runtime_lease (id, task_id, generation, provider_name, provider_sandbox_id, status, allocation_operation_id, allocation_idempotency_key, created_at, updated_at, ready_at, release_requested_at, released_at, last_error_json)
      VALUES (${values.id}, ${values.taskId}, ${values.generation}, ${values.providerName}, ${values.providerSandboxId}, ${values.status}, ${values.allocationOperationId}, ${values.allocationIdempotencyKey}, ${values.createdAt}, ${values.updatedAt}, ${values.readyAt}, ${values.releaseRequestedAt}, ${values.releasedAt}, ${values.lastError}::jsonb)
    `
  }

  async listLeases(conversationId: string): Promise<RuntimeLeaseRecord[]> {
    const rows = await this.sql<LeaseRow[]>`SELECT id, task_id, generation, provider_name, provider_sandbox_id, status, allocation_operation_id, allocation_idempotency_key, created_at, updated_at, ready_at, release_requested_at, released_at, last_error_json FROM runtime_lease WHERE task_id = ${conversationId} ORDER BY generation ASC`
    return rows.map(leaseFromRow)
  }

  async findActiveLease(conversationId: string): Promise<RuntimeLeaseRecord | undefined> {
    const rows = await this.sql<LeaseRow[]>`SELECT id, task_id, generation, provider_name, provider_sandbox_id, status, allocation_operation_id, allocation_idempotency_key, created_at, updated_at, ready_at, release_requested_at, released_at, last_error_json FROM runtime_lease WHERE task_id = ${conversationId} AND status IN ('allocating', 'ready', 'releasing', 'unknown') ORDER BY generation DESC LIMIT 1`
    return rows[0] ? leaseFromRow(rows[0]) : undefined
  }

  async transitionLease(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord): Promise<void> {
    const values = leaseValues(next)
    const result = await this.sql`
      UPDATE runtime_lease SET generation = ${values.generation}, provider_name = ${values.providerName}, provider_sandbox_id = ${values.providerSandboxId}, status = ${values.status}, allocation_operation_id = ${values.allocationOperationId}, allocation_idempotency_key = ${values.allocationIdempotencyKey}, updated_at = ${values.updatedAt}, ready_at = ${values.readyAt}, release_requested_at = ${values.releaseRequestedAt}, released_at = ${values.releasedAt}, last_error_json = ${values.lastError}::jsonb
      WHERE id = ${id} AND generation = ${expected.generation} AND status = ${expected.status} AND updated_at = ${new Date(expected.updatedAt)}
    `
    if (result.count === 1) return
    const existing = await this.sql<{ id: string }[]>`SELECT id FROM runtime_lease WHERE id = ${id}`
    if (!existing[0]) throw new RecordNotFoundError(`Runtime lease ${id} does not exist`)
    throw new OptimisticConflictError(`Runtime lease ${id} changed concurrently`)
  }
}

const jsonArray = (value: string) => {
  try { return JSON.stringify(Array.isArray(JSON.parse(value)) ? JSON.parse(value) : []) } catch { return '[]' }
}

export const createPostgresOperationsRepository = (databaseUrl: string, config: { maxConnections?: number; connectTimeoutSeconds?: number } = {}) => {
  const sql = postgres(databaseUrl, { max: config.maxConnections ?? 4, connect_timeout: config.connectTimeoutSeconds ?? 5, prepare: false })
  return { repository: new PostgresOperationsRepository(sql as PostgresOperationsSql), close: () => sql.end({ timeout: 5 }) }
}
