import type { McpConfigRecord, NativeEventProjectionRecord, NativeEventRecord, NativeProjectionOffset, OrganizationMemberRecord, OrganizationRecord, RuntimeLeaseFence, RuntimeLeaseRecord, SkillInstallationRecord } from './contracts.js'
import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as schema from '../db/schema.js'
import type { ChatMessage, EventInput, Project, RuntimeEvent, Task, TaskSchedule, WorkspaceVersion } from '../types.js'
import { PostgresChatRepository, type AtomicNativeProjectionInput, type CloneConversationMessageInput, type CloneConversationTurnInput, type PostgresChatMessage, type PostgresRuntimeEventRow } from './postgres-chat.js'
import { RecordNotFoundError } from './errors.js'
import { PostgresMetadataRepository } from './postgres-metadata.js'
import { PostgresOperationsRepository } from './postgres-operations.js'
import { PostgresWorkspaceRepository, type PostgresWorkspaceFileRecord } from './postgres-workspace.js'

export type PostgresStateConfig = { readonly maxConnections?: number; readonly connectTimeoutSeconds?: number }
export type PostgresMcpAuditRecord = { id: string; configId: string; operation: string; config: unknown; createdAt: string }

const providerFor = (value: unknown, fallback: Task['provider']): Task['provider'] => value === 'demo' || value === 'claude_sdk' || value === 'codex' || value === 'agentcore' || value === 'onecomputer' || value === 'remote' ? value : fallback
const messageFromRow = (row: PostgresChatMessage, task: Task): ChatMessage => {
  const content = row.content && typeof row.content === 'object' && !Array.isArray(row.content) ? row.content as { text?: unknown; provider?: unknown; updatedAt?: unknown } : {}
  return {
    id: row.id, taskId: task.id, turnId: row.turnId ?? `legacy_turn_${row.sequence}`, role: row.role === 'tool' ? 'system' : row.role as ChatMessage['role'],
    content: typeof content.text === 'string' ? content.text : '', status: row.status as ChatMessage['status'], provider: providerFor(content.provider, task.provider),
    createdAt: row.createdAt.toISOString(), updatedAt: typeof content.updatedAt === 'string' ? content.updatedAt : row.createdAt.toISOString(),
  }
}
const eventFromRow = (row: PostgresRuntimeEventRow): RuntimeEvent => ({
  id: row.id, taskId: row.task_id, ...(row.run_id ? { runId: row.run_id } : {}), sequence: row.sequence, type: row.type as RuntimeEvent['type'], lane: row.lane as RuntimeEvent['lane'],
  ...(row.status ? { status: row.status as RuntimeEvent['status'] } : {}), ...(row.label ? { label: row.label } : {}), ...(row.content ? { content: row.content } : {}),
  payload: row.payload_json && typeof row.payload_json === 'object' && !Array.isArray(row.payload_json) ? row.payload_json as Record<string, unknown> : {},
  createdAt: row.created_at.toISOString(), previousHash: row.previous_hash, eventHash: row.event_hash,
})

export type PostgresStateSnapshot = { projects: Project[]; tasks: Task[]; schedules: TaskSchedule[]; messages: Map<string, ChatMessage[]>; messageRevisions: Map<string, number>; events: Map<string, RuntimeEvent[]> }

const requireActor = (actorUserId: string, resource: string) => {
  if (!actorUserId.trim()) throw new Error(`${resource} actor is required`)
}

const requireOwner = (ownerUserId: string | null | undefined, actorUserId: string, resource: string) => {
  requireActor(actorUserId, resource)
  if (!ownerUserId) throw new Error(`${resource} requires an owner`)
  if (ownerUserId !== actorUserId) throw new Error(`${resource} owner access required`)
}

export class PostgresStateCoordinator {
  readonly #sql: Sql<Record<string, never>>
  readonly #authSql: Sql<Record<string, never>>
  readonly #database: PostgresJsDatabase<typeof schema>
  readonly #chat: PostgresChatRepository
  readonly #metadata: PostgresMetadataRepository
  readonly #operations: PostgresOperationsRepository
  readonly #workspace: PostgresWorkspaceRepository

  constructor(databaseUrl: string, config: PostgresStateConfig = {}) {
    this.#sql = postgres(databaseUrl, { max: config.maxConnections ?? 8, connect_timeout: config.connectTimeoutSeconds ?? 5, prepare: false }) as Sql<Record<string, never>>
    // Drizzle mutates the client's date/json serializers when it is
    // constructed. Keep Better Auth on a dedicated client so the raw
    // repository SQL retains postgres-js's normal Date serialization.
    this.#authSql = postgres(databaseUrl, { max: 2, connect_timeout: config.connectTimeoutSeconds ?? 5, prepare: false }) as Sql<Record<string, never>>
    this.#database = drizzle(this.#authSql, { schema })
    this.#chat = new PostgresChatRepository(this.#sql)
    this.#metadata = new PostgresMetadataRepository(this.#sql)
    this.#operations = new PostgresOperationsRepository(this.#sql)
    this.#workspace = new PostgresWorkspaceRepository(this.#sql)
    this.#close = async () => { await Promise.all([this.#sql.end({ timeout: 5 }), this.#authSql.end({ timeout: 5 })]) }
  }

  #close: () => Promise<void>

  async close() { await this.#close() }

  /**
   * Operational methods below are intentionally thin, typed wrappers around
   * PostgresOperationsRepository. The repository currently exposes separate
   * SQL calls for a mutation and its audit row (and for organization creation
   * plus its owner membership), so these wrappers do not claim a shared
   * transaction boundary. Callers must treat those pairs as a staged proof
   * until the repository is upgraded with transaction-aware operations.
   */

  async #requireOwnedConversation(conversationId: string, ownerUserId: string): Promise<void> {
    requireActor(ownerUserId, 'Conversation')
    const state = await this.#metadata.load(ownerUserId)
    if (!state.tasks.some((task) => task.id === conversationId)) {
      throw new RecordNotFoundError(`Conversation ${conversationId} does not exist for this owner`)
    }
  }

  async #requireOrganizationMember(organizationId: string, actorUserId: string): Promise<OrganizationMemberRecord> {
    requireActor(actorUserId, 'Organization')
    const member = await this.#operations.findMember(organizationId, actorUserId)
    if (!member) throw new RecordNotFoundError(`Organization ${organizationId} does not exist for this user`)
    return member
  }

  async listMcpConfigs(ownerUserId: string): Promise<McpConfigRecord[]> {
    requireActor(ownerUserId, 'MCP config')
    return this.#operations.listMcpConfigs(ownerUserId)
  }

  async createMcpConfig(record: McpConfigRecord, actorUserId: string): Promise<McpConfigRecord> {
    requireOwner(record.ownerUserId, actorUserId, 'MCP config')
    await this.#operations.insertMcpConfig(record)
    await this.#operations.appendMcpAudit({
      id: `${record.id}:created`, configId: record.id, action: 'created', name: record.name,
      command: record.command, argsJson: record.argsJson, createdAt: record.createdAt,
    }, actorUserId)
    return record
  }

  async listMcpAudit(configId: string, ownerUserId: string): Promise<PostgresMcpAuditRecord[]> {
    const config = (await this.listMcpConfigs(ownerUserId)).find((candidate) => candidate.id === configId)
    if (!config) throw new RecordNotFoundError(`MCP config ${configId} does not exist for this owner`)
    return this.#operations.listMcpAudit(configId)
  }

  async deleteMcpConfig(configId: string, ownerUserId: string): Promise<boolean> {
    const config = (await this.listMcpConfigs(ownerUserId)).find((candidate) => candidate.id === configId)
    if (!config) return false
    const deleted = await this.#operations.deleteMcpConfig(configId, ownerUserId)
    if (!deleted) return false
    await this.#operations.appendMcpAudit({
      id: `${config.id}:deleted:${randomUUID()}`, configId: config.id, action: 'deleted', name: config.name,
      command: config.command, argsJson: config.argsJson, createdAt: new Date().toISOString(),
    }, ownerUserId)
    return true
  }

  async listOrganizationsForUser(userId: string): Promise<OrganizationRecord[]> {
    requireActor(userId, 'Organization')
    return this.#operations.listOrganizationsForUser(userId)
  }

  async createOrganization(record: OrganizationRecord, ownerUserId: string): Promise<OrganizationRecord> {
    requireActor(ownerUserId, 'Organization')
    if (!await this.#operations.userExists(ownerUserId)) throw new RecordNotFoundError(`User ${ownerUserId} does not exist`)
    await this.#operations.insertOrganization(record)
    await this.#operations.insertMember({ organizationId: record.id, userId: ownerUserId, role: 'owner', createdAt: record.createdAt })
    return record
  }

  async listOrganizationMembers(organizationId: string, actorUserId: string): Promise<OrganizationMemberRecord[]> {
    await this.#requireOrganizationMember(organizationId, actorUserId)
    return this.#operations.listMembers(organizationId)
  }

  async addOrganizationMember(organizationId: string, userId: string, actorUserId: string): Promise<OrganizationMemberRecord> {
    const actor = await this.#requireOrganizationMember(organizationId, actorUserId)
    if (actor.role !== 'owner') throw new Error('Organization owner access required')
    requireActor(userId, 'Organization member')
    if (!await this.#operations.userExists(userId)) throw new RecordNotFoundError(`User ${userId} does not exist`)
    const member: OrganizationMemberRecord = { organizationId, userId, role: 'member', createdAt: new Date().toISOString() }
    await this.#operations.insertMember(member)
    return member
  }

  async removeOrganizationMember(organizationId: string, userId: string, actorUserId: string): Promise<{ organizationId: string; userId: string; removed: true }> {
    const actor = await this.#requireOrganizationMember(organizationId, actorUserId)
    if (actor.role !== 'owner') throw new Error('Organization owner access required')
    if (userId === actorUserId) throw new Error('Organization owner cannot remove themselves')
    if (!await this.#operations.deleteMember(organizationId, userId)) throw new RecordNotFoundError(`Organization member ${userId} does not exist`)
    return { organizationId, userId, removed: true }
  }

  async listSkillInstallations(ownerUserId: string): Promise<SkillInstallationRecord[]> {
    requireActor(ownerUserId, 'Skill')
    return this.#operations.listSkills(ownerUserId)
  }

  async installSkillInstallation(record: SkillInstallationRecord, actorUserId: string): Promise<SkillInstallationRecord> {
    requireOwner(record.ownerUserId, actorUserId, 'Skill')
    await this.#operations.insertSkill(record)
    return record
  }

  async removeSkillInstallation(skillId: string, ownerUserId: string): Promise<boolean> {
    const visible = await this.listSkillInstallations(ownerUserId)
    const skill = visible.find((candidate) => candidate.id === skillId)
    if (!skill || skill.ownerUserId !== ownerUserId) return false
    return this.#operations.deleteSkill(skillId, ownerUserId)
  }

  async listRuntimeLeases(conversationId: string, ownerUserId: string): Promise<RuntimeLeaseRecord[]> {
    await this.#requireOwnedConversation(conversationId, ownerUserId)
    return this.#operations.listLeases(conversationId)
  }

  async findActiveRuntimeLease(conversationId: string, ownerUserId: string): Promise<RuntimeLeaseRecord | undefined> {
    await this.#requireOwnedConversation(conversationId, ownerUserId)
    return this.#operations.findActiveLease(conversationId)
  }

  async insertRuntimeLease(record: RuntimeLeaseRecord, expectedPreviousGeneration: number, ownerUserId: string): Promise<void> {
    await this.#requireOwnedConversation(record.conversationId, ownerUserId)
    await this.#operations.insertLease(record, expectedPreviousGeneration)
  }

  async transitionRuntimeLease(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord, ownerUserId: string): Promise<void> {
    await this.#requireOwnedConversation(next.conversationId, ownerUserId)
    const ownedLease = (await this.#operations.listLeases(next.conversationId)).find((lease) => lease.id === id)
    if (!ownedLease) throw new RecordNotFoundError(`Runtime lease ${id} does not exist for this owner conversation`)
    await this.#operations.transitionLease(id, expected, next)
  }

  /**
   * Better Auth uses a dedicated reviewed Postgres client owned by this
   * coordinator because the Drizzle adapter mutates driver serializers.
   * Callers must not close this handle independently.
   */
  databaseHandle(): PostgresJsDatabase<typeof schema> { return this.#database }

  async load(ownerUserId?: string): Promise<PostgresStateSnapshot> {
    const metadata = await this.#metadata.load(ownerUserId)
    const messages = new Map<string, ChatMessage[]>()
    const messageRevisions = new Map<string, number>()
    const events = new Map<string, RuntimeEvent[]>()
    for (const task of metadata.tasks) {
      if (!task.ownerUserId) continue
      const rows = await this.#chat.listMessages(task.id, task.ownerUserId)
      messages.set(task.id, rows.map((row) => messageFromRow(row, task)))
      for (const row of rows) messageRevisions.set(row.id, row.revision)
      events.set(task.id, (await this.#chat.listRuntimeEvents(task.id, task.ownerUserId)).map(eventFromRow))
    }
    return { ...metadata, messages, messageRevisions, events }
  }

  async insertProject(project: Project) { await this.#metadata.insertProject(project) }
  async updateProject(project: Project, expectedUpdatedAt: string) { await this.#metadata.updateProject(project, expectedUpdatedAt) }
  async insertTask(task: Task) { await this.#metadata.insertTask(task) }
  async updateTask(task: Task, expectedUpdatedAt: string) { await this.#metadata.updateTask(task, expectedUpdatedAt) }
  async insertSchedule(schedule: TaskSchedule) { await this.#metadata.insertSchedule(schedule) }
  async updateSchedule(schedule: TaskSchedule, expectedUpdatedAt: string) { await this.#metadata.updateSchedule(schedule, expectedUpdatedAt) }
  async deleteSchedule(id: string, ownerUserId: string) { await this.#metadata.deleteSchedule(id, ownerUserId) }

  async listWorkspaceFiles(task: Task) {
    if (!task.ownerUserId) return []
    return this.#workspace.listFiles(task.id, task.ownerUserId)
  }

  async readWorkspaceFile(task: Task, relativePath: string) {
    if (!task.ownerUserId) throw new Error('Postgres workspace files require an owner')
    return this.#workspace.readFile(task.id, task.ownerUserId, relativePath)
  }

  async writeWorkspaceFile(task: Task, relativePath: string, content: Uint8Array, sha256: string, updatedAt = new Date()) {
    if (!task.ownerUserId) throw new Error('Postgres workspace files require an owner')
    return this.#workspace.putFile(task.id, task.ownerUserId, relativePath, content, sha256, updatedAt)
  }

  async deleteWorkspaceFile(task: Task, relativePath: string) {
    if (!task.ownerUserId) throw new Error('Postgres workspace files require an owner')
    return this.#workspace.deleteFile(task.id, task.ownerUserId, relativePath)
  }

  async createWorkspaceVersion(task: Task, version: WorkspaceVersion, files: PostgresWorkspaceFileRecord[]) {
    if (!task.ownerUserId) throw new Error('Postgres workspace versions require an owner')
    return this.#workspace.createVersion(task.id, task.ownerUserId, version, files)
  }

  async listWorkspaceVersions(task: Task) {
    if (!task.ownerUserId) return []
    return this.#workspace.listVersions(task.id, task.ownerUserId)
  }

  async listWorkspaceVersionFiles(task: Task, versionId: string) {
    if (!task.ownerUserId) throw new Error('Postgres workspace versions require an owner')
    return this.#workspace.listVersionFiles(task.id, task.ownerUserId, versionId)
  }

  async restoreWorkspaceVersion(task: Task, versionId: string) {
    if (!task.ownerUserId) throw new Error('Postgres workspace versions require an owner')
    return this.#workspace.restoreVersion(task.id, task.ownerUserId, versionId)
  }

  async copyWorkspaceFiles(source: Task, target: Task) {
    if (!source.ownerUserId || source.ownerUserId !== target.ownerUserId) throw new Error('Postgres workspace copies require one owner')
    return this.#workspace.copyFiles(source.id, target.id, source.ownerUserId)
  }

  async listProjectFiles(project: Project, ownerUserId: string) {
    return this.#workspace.listProjectFiles(project.id, ownerUserId)
  }

  async readProjectFile(project: Project, ownerUserId: string, relativePath: string) {
    return this.#workspace.readProjectFile(project.id, ownerUserId, relativePath)
  }

  async writeProjectFile(project: Project, ownerUserId: string, relativePath: string, content: Uint8Array, sha256: string, updatedAt = new Date()) {
    return this.#workspace.putProjectFile(project.id, ownerUserId, relativePath, content, sha256, updatedAt)
  }

  async putProjectFileAndMetadata(project: Project, expectedUpdatedAt: string, relativePath: string, content: Uint8Array, sha256: string, nextProject: Project) {
    return this.#workspace.putProjectFileAndMetadata(project, expectedUpdatedAt, relativePath, content, sha256, nextProject)
  }

  async updateProjectFileAndMetadata(project: Project, expectedUpdatedAt: string, relativePath: string, content: Uint8Array, sha256: string, nextProject: Project) {
    return this.#workspace.updateProjectFileAndMetadata(project, expectedUpdatedAt, relativePath, content, sha256, nextProject)
  }

  async deleteProjectFile(project: Project, ownerUserId: string, relativePath: string) {
    return this.#workspace.deleteProjectFile(project.id, ownerUserId, relativePath)
  }

  async deleteProjectFileAndMetadata(project: Project, expectedUpdatedAt: string, relativePath: string, nextProject: Project) {
    return this.#workspace.deleteProjectFileAndMetadata(project, expectedUpdatedAt, relativePath, nextProject)
  }

  async beginTurn(task: Task, turnId: string, clientRequestId: string, prompt: string, createdAt = new Date()) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.beginTurn({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, turnId, clientRequestId, prompt, createdAt })
  }

  async createAssistantPlaceholder(task: Task, turnId: string, messageId: string, createdAt = new Date()) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.appendAssistantMessage({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, turnId, content: { text: '', provider: task.provider, updatedAt: createdAt.toISOString() }, createdAt })
  }

  async appendStandaloneMessage(task: Task, messageId: string, role: ChatMessage['role'], content: unknown, status: ChatMessage['status'], createdAt = new Date()) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return messageFromRow(await this.#chat.appendStandaloneMessage({
      conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, role, content, status, createdAt,
    }), task)
  }

  async cloneConversationHistory(source: Task, target: Task, turns: CloneConversationTurnInput[], messages: CloneConversationMessageInput[]) {
    if (!source.ownerUserId || !target.ownerUserId || source.ownerUserId !== target.ownerUserId) throw new Error('Postgres conversation branches require one owner')
    await this.#chat.cloneConversationHistory(source.id, target.id, source.ownerUserId, turns, messages)
  }

  async appendAssistantDelta(task: Task, messageId: string, expectedRevision: number, delta: string, status: ChatMessage['status'] = 'streaming') {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.appendAssistantDelta({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, expectedRevision, delta, status })
  }

  async reviseAssistant(task: Task, messageId: string, expectedRevision: number, content: unknown, status: ChatMessage['status']) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.reviseAssistant({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, expectedRevision, content, status })
  }

  async finishTurn(task: Task, turnId: string, status: ChatMessage['status'], completedAt = new Date(), error?: unknown) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    await this.#chat.finishTurn(task.id, task.id, task.ownerUserId, turnId, status, completedAt, error)
  }

  async appendEvent(task: Task, event: { id: string; runId?: string; sequence?: number; type: EventInput['type']; lane: EventInput['lane']; status?: EventInput['status']; label?: string; content?: string; payload: Record<string, unknown>; createdAt: Date; previousHash: string; eventHash: string }) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    const row = await this.#chat.appendRuntimeEvent({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, eventId: event.id, runId: event.runId, type: event.type, lane: event.lane, status: event.status, label: event.label, content: event.content, payload: event.payload, previousHash: event.previousHash, eventHash: event.eventHash, createdAt: event.createdAt })
    return eventFromRow(row)
  }

  async listMessages(task: Task) {
    if (!task.ownerUserId) return []
    return (await this.#chat.listMessages(task.id, task.ownerUserId)).map((row) => messageFromRow(row, task))
  }

  async listEvents(task: Task) {
    if (!task.ownerUserId) return []
    return (await this.#chat.listRuntimeEvents(task.id, task.ownerUserId)).map(eventFromRow)
  }

  async findNativeEvent(task: Task, runId: string, source: string, sourceEventId: string) {
    if (!task.ownerUserId) return undefined
    return this.#chat.findNativeEvent(task.id, task.ownerUserId, runId, source, sourceEventId)
  }

  async listNativeEvents(task: Task, runId?: string, source?: string, afterSourceSequence = -1, limit = 10_000) {
    if (!task.ownerUserId) return []
    return this.#chat.listNativeEvents(task.id, task.ownerUserId, runId, source, afterSourceSequence, limit)
  }

  async appendNativeEvent(task: Task, record: NativeEventRecord) {
    if (!task.ownerUserId) throw new Error('Postgres native events require an owner')
    if (record.conversationId !== task.id) throw new Error(`Native event ${record.id} is not bound to task conversation ${task.id}`)
    await this.#chat.appendNativeEvent(record, task.ownerUserId)
  }

  async ingestNativeEvent(task: Task, record: NativeEventRecord, projections: AtomicNativeProjectionInput[], offset?: NativeProjectionOffset) {
    if (!task.ownerUserId) throw new Error('Postgres native events require an owner')
    if (record.conversationId !== task.id) throw new Error(`Native event ${record.id} is not bound to task conversation ${task.id}`)
    const result = await this.#chat.ingestNativeEventAtomic(record, task.ownerUserId, projections, offset)
    return { ...result, events: result.events.map(eventFromRow) }
  }

  async appendNativeEventProjection(task: Task, record: NativeEventProjectionRecord) {
    if (!task.ownerUserId) throw new Error('Postgres native event projections require an owner')
    await this.#chat.appendNativeEventProjection(record, task.id, task.ownerUserId)
  }

  async getNativeProjectionOffset(task: Task, runId: string, source: string, projectorVersion: number) {
    if (!task.ownerUserId) return undefined
    return this.#chat.getNativeProjectionOffset(task.id, task.ownerUserId, runId, source, projectorVersion)
  }

  async setNativeProjectionOffset(task: Task, record: NativeProjectionOffset) {
    if (!task.ownerUserId) throw new Error('Postgres native projection offsets require an owner')
    if (record.conversationId !== task.id) throw new Error(`Native projection offset is not bound to task conversation ${task.id}`)
    await this.#chat.setNativeProjectionOffset(record, task.ownerUserId)
  }

  async claimIdempotency(scope: string, key: string, requestHash: string, createdAt: string, ownerUserId?: string): Promise<{ claimed: boolean; state: 'pending' | 'completed'; response?: Record<string, unknown> }> {
    const existing = await this.#operations.findIdempotency(scope, key)
    if (existing) {
      await this.#operations.claimIdempotency(scope, key, requestHash, createdAt, ownerUserId)
      return {
        claimed: false,
        state: existing.state,
        ...(existing.responseJson ? { response: JSON.parse(existing.responseJson) as Record<string, unknown> } : {}),
      }
    }
    await this.#operations.claimIdempotency(scope, key, requestHash, createdAt, ownerUserId)
    return { claimed: true, state: 'pending' }
  }
  async findIdempotency(scope: string, key: string) { return this.#operations.findIdempotency(scope, key) }
  async completeIdempotency(scope: string, key: string, responseJson: string, completedAt: string) { return this.#operations.completeIdempotency(scope, key, responseJson, completedAt) }
}
