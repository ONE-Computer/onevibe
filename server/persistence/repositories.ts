import type Database from 'better-sqlite3'
import type {
  ConversationRecord,
  ConversationRepository,
  IdempotencyRecord,
  IdempotencyRepository,
  LegacyImportRecord,
  LegacyImportRepository,
  McpConfigAuditRecord,
  McpConfigRecord,
  McpConfigRepository,
  MessagePage,
  MessageRecord,
  MessageRepository,
  NativeEventProjectionRecord,
  NativeEventRecord,
  NativeEventRepository,
  OrganizationMemberRecord,
  OrganizationRecord,
  OrganizationRepository,
  NativeProjectionOffset,
  RuntimeEventRecord,
  RuntimeEventRepository,
  Repositories,
  SkillInstallationRecord,
  SkillInstallationRepository,
  TurnRecord,
  TurnRepository,
  TurnStatus,
} from './contracts.js'
import { IdempotencyConflictError, InvalidCursorError, OptimisticConflictError, RecordNotFoundError } from './errors.js'
import { SqliteRuntimeLeaseRepository } from './runtime-lease-repository.js'

type ConversationRow = { id: string; title: string | null; status: ConversationRecord['status']; created_at: string; updated_at: string }
type TurnRow = { id: string; conversation_id: string; client_request_id: string; ordinal: number; status: TurnStatus; created_at: string; started_at: string | null; completed_at: string | null }
type MessageRow = { id: string; conversation_id: string; turn_id: string | null; sequence: number; role: MessageRecord['role']; content_json: string; revision: number; status: MessageRecord['status']; created_at: string }
type IdempotencyRow = { scope: string; key: string; request_hash: string; state: IdempotencyRecord['state']; response_json: string | null; created_at: string; completed_at: string | null }
type LegacyImportRow = { source_kind: string; source_id: string; source_digest: string; conversation_id: string; result_json: string; imported_at: string }
type RuntimeEventRow = {
  id: string; conversation_id: string; run_id: string | null; sequence: number; type: string; lane: string;
  status: string | null; label: string | null; content: string | null; payload_json: string; created_at: string;
  previous_hash: string; event_hash: string;
}
type NativeEventRow = {
  id: string; conversation_id: string; run_id: string; source: string; source_event_id: string;
  source_sequence: number; native_type: string; payload_json: string; payload_hash: string; received_at: string;
}
type McpConfigRow = { id: string; owner_user_id: string | null; name: string; command: string; args_json: string; created_at: string; updated_at: string }
type SkillInstallationRow = { id: string; owner_scope: string; owner_user_id: string | null; version: number; title: string; summary: string; sha256: string; content: string; content_url: string; source_url: string; created_at: string; updated_at: string }
type OrganizationRow = { id: string; name: string; created_at: string; updated_at: string }
type OrganizationMemberRow = { organization_id: string; user_id: string; role: 'owner' | 'member'; created_at: string }

const conversationFromRow = (row: ConversationRow): ConversationRecord => ({
  id: row.id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
})
const turnFromRow = (row: TurnRow): TurnRecord => ({
  id: row.id, conversationId: row.conversation_id, clientRequestId: row.client_request_id, ordinal: row.ordinal,
  status: row.status, createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at,
})
const messageFromRow = (row: MessageRow): MessageRecord => ({
  id: row.id, conversationId: row.conversation_id, turnId: row.turn_id, sequence: row.sequence, role: row.role,
  contentJson: row.content_json, revision: row.revision, status: row.status, createdAt: row.created_at,
})

const organizationFromRow = (row: OrganizationRow): OrganizationRecord => ({
  id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at,
})

const organizationMemberFromRow = (row: OrganizationMemberRow): OrganizationMemberRecord => ({
  organizationId: row.organization_id, userId: row.user_id, role: row.role, createdAt: row.created_at,
})

export class SqliteConversationRepository implements ConversationRepository {
  constructor(private readonly database: Database.Database) {}

  findById(id: string): ConversationRecord | undefined {
    const row = this.database.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined
    return row && conversationFromRow(row)
  }

  insert(record: ConversationRecord): void {
    this.database.prepare('INSERT INTO conversations(id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(record.id, record.title, record.status, record.createdAt, record.updatedAt)
  }

  update(record: ConversationRecord, expectedUpdatedAt: string): void {
    const result = this.database.prepare(`
      UPDATE conversations SET title = ?, status = ?, updated_at = ? WHERE id = ? AND updated_at = ?
    `).run(record.title, record.status, record.updatedAt, record.id, expectedUpdatedAt)
    if (result.changes === 0) {
      if (!this.findById(record.id)) throw new RecordNotFoundError(`Conversation ${record.id} does not exist`)
      throw new OptimisticConflictError(`Conversation ${record.id} was modified concurrently`)
    }
  }
}

export class SqliteTurnRepository implements TurnRepository {
  constructor(private readonly database: Database.Database) {}

  findById(id: string): TurnRecord | undefined {
    const row = this.database.prepare('SELECT * FROM turns WHERE id = ?').get(id) as TurnRow | undefined
    return row && turnFromRow(row)
  }

  findByClientRequest(conversationId: string, clientRequestId: string): TurnRecord | undefined {
    const row = this.database.prepare('SELECT * FROM turns WHERE conversation_id = ? AND client_request_id = ?')
      .get(conversationId, clientRequestId) as TurnRow | undefined
    return row && turnFromRow(row)
  }

  insert(record: TurnRecord): void {
    this.database.prepare(`
      INSERT INTO turns(id, conversation_id, client_request_id, ordinal, status, created_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.conversationId, record.clientRequestId, record.ordinal, record.status, record.createdAt, record.startedAt, record.completedAt)
  }

  update(record: TurnRecord): void {
    const result = this.database.prepare(`
      UPDATE turns SET client_request_id = ?, ordinal = ?, status = ?, started_at = ?, completed_at = ? WHERE id = ?
    `).run(record.clientRequestId, record.ordinal, record.status, record.startedAt, record.completedAt, record.id)
    if (result.changes === 0) throw new RecordNotFoundError(`Turn ${record.id} does not exist`)
  }

  transition(id: string, expectedStatus: TurnStatus, record: TurnRecord): void {
    if (id !== record.id) throw new TypeError('Turn transition id does not match its record')
    const result = this.database.prepare(`
      UPDATE turns SET client_request_id = ?, ordinal = ?, status = ?, started_at = ?, completed_at = ?
      WHERE id = ? AND status = ?
    `).run(record.clientRequestId, record.ordinal, record.status, record.startedAt, record.completedAt, id, expectedStatus)
    if (result.changes === 0) {
      if (!this.findById(id)) throw new RecordNotFoundError(`Turn ${id} does not exist`)
      throw new OptimisticConflictError(`Turn ${id} is no longer ${expectedStatus}`)
    }
  }
}

interface CursorPayload { v: 1; conversationId: string; sequence: number }

const encodeCursor = (payload: CursorPayload): string => Buffer.from(JSON.stringify(payload)).toString('base64url')
const decodeCursor = (cursor: string, conversationId: string): CursorPayload => {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>
    if (payload.v !== 1 || payload.conversationId !== conversationId || !Number.isSafeInteger(payload.sequence) || payload.sequence! < 0) throw new Error('invalid')
    return payload as CursorPayload
  } catch {
    throw new InvalidCursorError('Message cursor is invalid or belongs to another conversation')
  }
}

export class SqliteMessageRepository implements MessageRepository {
  constructor(private readonly database: Database.Database) {}

  listByConversation(conversationId: string, afterSequence = -1, limit = 100): MessageRecord[] {
    return this.pageFromSequence(conversationId, afterSequence, limit).items
  }

  pageByConversation(conversationId: string, cursor?: string, limit = 100): MessagePage {
    const sequence = cursor ? decodeCursor(cursor, conversationId).sequence : -1
    return this.pageFromSequence(conversationId, sequence, limit)
  }

  private pageFromSequence(conversationId: string, afterSequence: number, limit: number): MessagePage {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new RangeError('Message page limit must be between 1 and 500')
    const rows = this.database.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? AND sequence > ? ORDER BY sequence ASC LIMIT ?
    `).all(conversationId, afterSequence, limit + 1) as MessageRow[]
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const last = pageRows.at(-1)
    return {
      items: pageRows.map(messageFromRow),
      ...(hasMore && last ? { nextCursor: encodeCursor({ v: 1, conversationId, sequence: last.sequence }) } : {}),
    }
  }

  append(record: MessageRecord): void {
    const result = this.database.prepare(`
      INSERT INTO messages(id, conversation_id, turn_id, sequence, role, content_json, revision, status, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? = (SELECT COALESCE(MAX(sequence) + 1, 0) FROM messages WHERE conversation_id = ?)
    `).run(
      record.id, record.conversationId, record.turnId, record.sequence, record.role, record.contentJson,
      record.revision, record.status, record.createdAt, record.sequence, record.conversationId,
    )
    if (result.changes === 0) {
      const expected = this.database.prepare('SELECT COALESCE(MAX(sequence) + 1, 0) FROM messages WHERE conversation_id = ?')
        .pluck().get(record.conversationId) as number
      throw new OptimisticConflictError(`Message sequence ${record.sequence} is stale; expected ${expected}`)
    }
  }

  appendAssistantDelta(id: string, expectedRevision: number, delta: string, status: MessageRecord['status'] = 'streaming'): MessageRecord {
    const result = this.database.prepare(`
      UPDATE messages
      SET content_json = json_set(content_json, '$.text', COALESCE(json_extract(content_json, '$.text'), '') || ?),
          status = ?, revision = revision + 1
      WHERE id = ? AND role = 'assistant' AND revision = ?
    `).run(delta, status, id, expectedRevision)
    if (result.changes === 0) return this.throwMessageConflict(id)
    return messageFromRow(this.database.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow)
  }

  reviseAssistant(id: string, expectedRevision: number, contentJson: string, status: MessageRecord['status']): MessageRecord {
    const result = this.database.prepare(`
      UPDATE messages SET content_json = ?, status = ?, revision = revision + 1
      WHERE id = ? AND role = 'assistant' AND revision = ?
    `).run(contentJson, status, id, expectedRevision)
    if (result.changes === 0) return this.throwMessageConflict(id)
    return messageFromRow(this.database.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow)
  }

  private throwMessageConflict(id: string): never {
    const row = this.database.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
    if (!row) throw new RecordNotFoundError(`Message ${id} does not exist`)
    throw new OptimisticConflictError(`Assistant message ${id} revision conflict`)
  }
}

export class SqliteIdempotencyRepository implements IdempotencyRepository {
  constructor(private readonly database: Database.Database) {}

  find(scope: string, key: string): IdempotencyRecord | undefined {
    const row = this.database.prepare('SELECT * FROM idempotency_keys WHERE scope = ? AND key = ?').get(scope, key) as IdempotencyRow | undefined
    return row && {
      scope: row.scope, key: row.key, requestHash: row.request_hash, state: row.state, responseJson: row.response_json,
      createdAt: row.created_at, completedAt: row.completed_at,
    }
  }

  claim(scope: string, key: string, requestHash: string, createdAt: string): boolean {
    const result = this.database.prepare(`
      INSERT INTO idempotency_keys(scope, key, request_hash, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(scope, key) DO NOTHING
    `).run(scope, key, requestHash, createdAt)
    if (result.changes === 1) return true
    const existing = this.find(scope, key)
    if (existing?.requestHash !== requestHash) throw new IdempotencyConflictError(`Idempotency key ${scope}/${key} was reused with a different request`)
    return false
  }

  complete(scope: string, key: string, responseJson: string, completedAt: string): void {
    const result = this.database.prepare(`
      UPDATE idempotency_keys SET state = 'completed', response_json = ?, completed_at = ?
      WHERE scope = ? AND key = ? AND state = 'pending'
    `).run(responseJson, completedAt, scope, key)
    if (result.changes === 1) return
    const existing = this.find(scope, key)
    if (!existing) throw new RecordNotFoundError(`Idempotency key ${scope}/${key} does not exist`)
    if (existing.state === 'completed' && existing.responseJson === responseJson) return
    throw new OptimisticConflictError(`Idempotency key ${scope}/${key} is already completed with a different response`)
  }
}

const runtimeEventFromRow = (row: RuntimeEventRow): RuntimeEventRecord => ({
  id: row.id,
  conversationId: row.conversation_id,
  runId: row.run_id,
  sequence: row.sequence,
  type: row.type,
  lane: row.lane,
  status: row.status,
  label: row.label,
  content: row.content,
  payloadJson: row.payload_json,
  createdAt: row.created_at,
  previousHash: row.previous_hash,
  eventHash: row.event_hash,
})

export class SqliteRuntimeEventRepository implements RuntimeEventRepository {
  constructor(private readonly database: Database.Database) {}

  listByConversation(conversationId: string, afterSequence = -1, limit = 10_000): RuntimeEventRecord[] {
    if (!Number.isSafeInteger(afterSequence) || afterSequence < -1) throw new RangeError('Runtime event cursor is invalid')
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50_000) throw new RangeError('Runtime event limit is invalid')
    return (this.database.prepare(`
      SELECT * FROM runtime_events
      WHERE conversation_id = ? AND sequence > ?
      ORDER BY sequence ASC LIMIT ?
    `).all(conversationId, afterSequence, limit) as RuntimeEventRow[]).map(runtimeEventFromRow)
  }

  append(record: RuntimeEventRecord): void {
    if (!Number.isSafeInteger(record.sequence) || record.sequence < 0) throw new RangeError('Runtime event sequence is invalid')
    try {
      const parsed = JSON.parse(record.payloadJson) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('Runtime event payload must be an object')
    } catch (error) {
      throw new TypeError(`Runtime event payload must be valid JSON: ${error instanceof Error ? error.message : 'invalid'}`)
    }
    try {
      const result = this.database.prepare(`
        INSERT INTO runtime_events(
          id, conversation_id, run_id, sequence, type, lane, status, label, content, payload_json,
          created_at, previous_hash, event_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.conversationId, record.runId, record.sequence, record.type, record.lane,
        record.status, record.label, record.content, record.payloadJson, record.createdAt,
        record.previousHash, record.eventHash,
      )
      if (result.changes !== 1) throw new OptimisticConflictError(`Runtime event ${record.id} was not appended`)
    } catch (error) {
      if (error instanceof OptimisticConflictError) throw error
      if ((error instanceof Error ? error.message : '').includes('UNIQUE constraint failed: runtime_events')) {
        throw new OptimisticConflictError(`Runtime event ${record.id} conflicts with the current conversation sequence`)
      }
      throw error
    }
  }
}

const nativeEventFromRow = (row: NativeEventRow): NativeEventRecord => ({
  id: row.id,
  conversationId: row.conversation_id,
  runId: row.run_id,
  source: row.source,
  sourceEventId: row.source_event_id,
  sourceSequence: row.source_sequence,
  nativeType: row.native_type,
  payloadJson: row.payload_json,
  payloadHash: row.payload_hash,
  receivedAt: row.received_at,
})

type NativeProjectionRow = {
  conversation_id: string; run_id: string; source: string; projector_version: number;
  last_source_sequence: number; updated_at: string;
}

export class SqliteNativeEventRepository implements NativeEventRepository {
  constructor(private readonly database: Database.Database) {}

  findBySourceEvent(conversationId: string, runId: string, source: string, sourceEventId: string): NativeEventRecord | undefined {
    const row = this.database.prepare(`
      SELECT * FROM native_events
      WHERE conversation_id = ? AND run_id = ? AND source = ? AND source_event_id = ?
    `).get(conversationId, runId, source, sourceEventId) as NativeEventRow | undefined
    return row && nativeEventFromRow(row)
  }

  listByConversation(conversationId: string, runId?: string, source?: string, afterSourceSequence = -1, limit = 10_000): NativeEventRecord[] {
    if (!Number.isSafeInteger(afterSourceSequence) || afterSourceSequence < -1) throw new RangeError('Native event cursor is invalid')
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50_000) throw new RangeError('Native event limit is invalid')
    const rows = this.database.prepare(`
      SELECT * FROM native_events
      WHERE conversation_id = ?
        AND (? IS NULL OR run_id = ?)
        AND (? IS NULL OR source = ?)
        AND source_sequence > ?
      ORDER BY source_sequence ASC LIMIT ?
    `).all(conversationId, runId ?? null, runId ?? null, source ?? null, source ?? null, afterSourceSequence, limit) as NativeEventRow[]
    return rows.map(nativeEventFromRow)
  }

  append(record: NativeEventRecord): void {
    if (!Number.isSafeInteger(record.sourceSequence) || record.sourceSequence < 0) throw new RangeError('Native event source sequence is invalid')
    try {
      const parsed = JSON.parse(record.payloadJson) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('Native event payload must be an object')
    } catch (error) {
      throw new TypeError(`Native event payload must be valid JSON: ${error instanceof Error ? error.message : 'invalid'}`)
    }
    try {
      const result = this.database.prepare(`
        INSERT INTO native_events(
          id, conversation_id, run_id, source, source_event_id, source_sequence,
          native_type, payload_json, payload_hash, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id, record.conversationId, record.runId, record.source, record.sourceEventId,
        record.sourceSequence, record.nativeType, record.payloadJson, record.payloadHash, record.receivedAt,
      )
      if (result.changes !== 1) throw new OptimisticConflictError(`Native event ${record.id} was not appended`)
    } catch (error) {
      if (error instanceof OptimisticConflictError) throw error
      if ((error instanceof Error ? error.message : '').includes('UNIQUE constraint failed: native_events')) {
        throw new OptimisticConflictError(`Native event ${record.sourceEventId} conflicts with the current source cursor`)
      }
      throw error
    }
  }

  appendProjection(record: NativeEventProjectionRecord): void {
    const result = this.database.prepare(`
      INSERT INTO native_event_projections(native_event_id, projection_index, runtime_event_id, projector_version, projected_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(record.nativeEventId, record.projectionIndex, record.runtimeEventId, record.projectorVersion, record.projectedAt)
    if (result.changes !== 1) throw new OptimisticConflictError(`Native event projection ${record.nativeEventId}/${record.projectionIndex} was not appended`)
  }

  getOffset(conversationId: string, runId: string, source: string, projectorVersion: number): NativeProjectionOffset | undefined {
    const row = this.database.prepare(`
      SELECT * FROM native_projection_offsets
      WHERE conversation_id = ? AND run_id = ? AND source = ? AND projector_version = ?
    `).get(conversationId, runId, source, projectorVersion) as NativeProjectionRow | undefined
    return row && {
      conversationId: row.conversation_id, runId: row.run_id, source: row.source,
      projectorVersion: row.projector_version, lastSourceSequence: row.last_source_sequence, updatedAt: row.updated_at,
    }
  }

  setOffset(record: NativeProjectionOffset): void {
    this.database.prepare(`
      INSERT INTO native_projection_offsets(conversation_id, run_id, source, projector_version, last_source_sequence, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(conversation_id, run_id, source, projector_version)
      DO UPDATE SET last_source_sequence = excluded.last_source_sequence, updated_at = excluded.updated_at
      WHERE excluded.last_source_sequence >= native_projection_offsets.last_source_sequence
    `).run(record.conversationId, record.runId, record.source, record.projectorVersion, record.lastSourceSequence, record.updatedAt)
  }
}

export class SqliteLegacyImportRepository implements LegacyImportRepository {
  constructor(private readonly database: Database.Database) {}

  hasImported(sourceKind: string, sourceId: string): boolean {
    return this.find(sourceKind, sourceId) !== undefined
  }

  find(sourceKind: string, sourceId: string): LegacyImportRecord | undefined {
    const row = this.database.prepare('SELECT * FROM legacy_imports WHERE source_kind = ? AND source_id = ?')
      .get(sourceKind, sourceId) as LegacyImportRow | undefined
    return row && {
      sourceKind: row.source_kind, sourceId: row.source_id, sourceDigest: row.source_digest,
      conversationId: row.conversation_id, resultJson: row.result_json, importedAt: row.imported_at,
    }
  }

  record(record: LegacyImportRecord): void {
    this.database.prepare(`
      INSERT INTO legacy_imports(source_kind, source_id, source_digest, conversation_id, result_json, imported_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(record.sourceKind, record.sourceId, record.sourceDigest, record.conversationId, record.resultJson, record.importedAt)
  }
}

const mcpConfigFromRow = (row: McpConfigRow): McpConfigRecord => ({
  id: row.id, ownerUserId: row.owner_user_id, name: row.name, command: row.command, argsJson: row.args_json,
  createdAt: row.created_at, updatedAt: row.updated_at,
})

export class SqliteMcpConfigRepository implements McpConfigRepository {
  constructor(private readonly database: Database.Database) {}

  list(ownerUserId?: string): McpConfigRecord[] {
    const rows = ownerUserId === undefined
      ? this.database.prepare('SELECT * FROM runtime_mcp_configs ORDER BY updated_at DESC, id DESC').all()
      : this.database.prepare('SELECT * FROM runtime_mcp_configs WHERE owner_user_id = ? ORDER BY updated_at DESC, id DESC').all(ownerUserId)
    return (rows as McpConfigRow[]).map(mcpConfigFromRow)
  }

  findById(id: string): McpConfigRecord | undefined {
    const row = this.database.prepare('SELECT * FROM runtime_mcp_configs WHERE id = ?').get(id) as McpConfigRow | undefined
    return row && mcpConfigFromRow(row)
  }

  insert(record: McpConfigRecord): void {
    this.database.prepare(`
      INSERT INTO runtime_mcp_configs(id, owner_user_id, name, command, args_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.ownerUserId, record.name, record.command, record.argsJson, record.createdAt, record.updatedAt)
  }

  delete(id: string, ownerUserId?: string): boolean {
    const result = ownerUserId === undefined
      ? this.database.prepare('DELETE FROM runtime_mcp_configs WHERE id = ?').run(id)
      : this.database.prepare('DELETE FROM runtime_mcp_configs WHERE id = ? AND owner_user_id = ?').run(id, ownerUserId)
    return result.changes === 1
  }

  appendAudit(record: McpConfigAuditRecord): void {
    this.database.prepare(`
      INSERT INTO runtime_mcp_config_events(id, config_id, action, name, command, args_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(record.id, record.configId, record.action, record.name, record.command, record.argsJson, record.createdAt)
  }
}

export class SqliteOrganizationRepository implements OrganizationRepository {
  constructor(private readonly database: Database.Database) {}

  listForUser(userId: string): OrganizationRecord[] {
    const rows = this.database.prepare(`
      SELECT o.id, o.name, o.created_at, o.updated_at
      FROM organizations o INNER JOIN organization_members m ON m.organization_id = o.id
      WHERE m.user_id = ? ORDER BY o.updated_at DESC, o.id ASC
    `).all(userId) as OrganizationRow[]
    return rows.map(organizationFromRow)
  }

  findById(id: string): OrganizationRecord | undefined {
    const row = this.database.prepare('SELECT id, name, created_at, updated_at FROM organizations WHERE id = ?').get(id) as OrganizationRow | undefined
    return row && organizationFromRow(row)
  }

  listMembers(organizationId: string): OrganizationMemberRecord[] {
    const rows = this.database.prepare(`
      SELECT organization_id, user_id, role, created_at
      FROM organization_members WHERE organization_id = ?
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at ASC, user_id ASC
    `).all(organizationId) as OrganizationMemberRow[]
    return rows.map(organizationMemberFromRow)
  }

  findMember(organizationId: string, userId: string): OrganizationMemberRecord | undefined {
    const row = this.database.prepare('SELECT organization_id, user_id, role, created_at FROM organization_members WHERE organization_id = ? AND user_id = ?')
      .get(organizationId, userId) as OrganizationMemberRow | undefined
    return row && organizationMemberFromRow(row)
  }

  userExists(userId: string): boolean {
    const hasAuthUsers = this.database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'").pluck().get() === 1
    return !hasAuthUsers || Boolean(this.database.prepare('SELECT 1 FROM user WHERE id = ?').pluck().get(userId))
  }

  insertOrganization(record: OrganizationRecord): void {
    this.database.prepare('INSERT INTO organizations(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(record.id, record.name, record.createdAt, record.updatedAt)
  }

  insertMember(record: OrganizationMemberRecord): void {
    this.database.prepare('INSERT INTO organization_members(organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
      .run(record.organizationId, record.userId, record.role, record.createdAt)
  }

  deleteMember(organizationId: string, userId: string): boolean {
    return this.database.prepare('DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?')
      .run(organizationId, userId).changes === 1
  }
}

const skillInstallationFromRow = (row: SkillInstallationRow): SkillInstallationRecord => ({
  id: row.id, ownerUserId: row.owner_user_id, version: row.version, title: row.title, summary: row.summary,
  sha256: row.sha256, content: row.content, contentUrl: row.content_url, sourceUrl: row.source_url,
  createdAt: row.created_at, updatedAt: row.updated_at,
})

export class SqliteSkillInstallationRepository implements SkillInstallationRepository {
  constructor(private readonly database: Database.Database) {}

  private scope(ownerUserId?: string) { return ownerUserId ?? '__local__' }

  list(ownerUserId?: string): SkillInstallationRecord[] {
    const rows = this.database.prepare('SELECT * FROM skill_installations WHERE owner_scope = ? ORDER BY updated_at DESC, id ASC').all(this.scope(ownerUserId))
    return (rows as SkillInstallationRow[]).map(skillInstallationFromRow)
  }

  findById(id: string, ownerUserId?: string): SkillInstallationRecord | undefined {
    const row = this.database.prepare('SELECT * FROM skill_installations WHERE owner_scope = ? AND id = ?').get(this.scope(ownerUserId), id) as SkillInstallationRow | undefined
    return row && skillInstallationFromRow(row)
  }

  insert(record: SkillInstallationRecord): void {
    this.database.prepare(`
      INSERT INTO skill_installations(id, owner_scope, owner_user_id, version, title, summary, sha256, content, content_url, source_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_scope, id) DO UPDATE SET owner_user_id = excluded.owner_user_id, version = excluded.version,
        title = excluded.title, summary = excluded.summary, sha256 = excluded.sha256, content = excluded.content,
        content_url = excluded.content_url, source_url = excluded.source_url, updated_at = excluded.updated_at
    `).run(record.id, this.scope(record.ownerUserId ?? undefined), record.ownerUserId, record.version, record.title, record.summary, record.sha256, record.content, record.contentUrl, record.sourceUrl, record.createdAt, record.updatedAt)
  }

  delete(id: string, ownerUserId?: string): boolean {
    return this.database.prepare('DELETE FROM skill_installations WHERE owner_scope = ? AND id = ?').run(this.scope(ownerUserId), id).changes === 1
  }
}

export function createSqliteRepositories(database: Database.Database): Repositories {
  return {
    conversations: new SqliteConversationRepository(database),
    turns: new SqliteTurnRepository(database),
    messages: new SqliteMessageRepository(database),
    runtimeEvents: new SqliteRuntimeEventRepository(database),
    nativeEvents: new SqliteNativeEventRepository(database),
    idempotency: new SqliteIdempotencyRepository(database),
    legacyImports: new SqliteLegacyImportRepository(database),
    runtimeLeases: new SqliteRuntimeLeaseRepository(database),
    mcpConfigs: new SqliteMcpConfigRepository(database),
    organizations: new SqliteOrganizationRepository(database),
    skillInstallations: new SqliteSkillInstallationRepository(database),
  }
}
