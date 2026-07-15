import type Database from 'better-sqlite3'
import type {
  RuntimeLeaseErrorCategory,
  RuntimeLeaseFence,
  RuntimeLeaseRecord,
  RuntimeLeaseRepository,
  RuntimeLeaseStatus,
} from './contracts.js'
import {
  ActiveRuntimeLeaseConflictError,
  InvalidRuntimeLeaseTransitionError,
  OptimisticConflictError,
  RecordNotFoundError,
  RuntimeLeaseAllocationConflictError,
  RuntimeLeaseGenerationConflictError,
  RuntimeLeaseProviderIdentityConflictError,
} from './errors.js'

type RuntimeLeaseRow = {
  id: string
  conversation_id: string
  generation: number
  provider_name: string
  provider_sandbox_id: string | null
  status: RuntimeLeaseStatus
  allocation_operation_id: string
  allocation_idempotency_key: string
  created_at: string
  updated_at: string
  ready_at: string | null
  release_requested_at: string | null
  released_at: string | null
  last_error_code: string | null
  last_error_category: RuntimeLeaseErrorCategory | null
  last_error_retryable: 0 | 1 | null
  last_error_at: string | null
}

const activeStatuses = new Set<RuntimeLeaseStatus>(['allocating', 'ready', 'releasing', 'unknown'])
const transitions: Readonly<Record<RuntimeLeaseStatus, ReadonlySet<RuntimeLeaseStatus>>> = {
  allocating: new Set(['ready', 'releasing', 'failed', 'unknown']),
  ready: new Set(['releasing', 'failed', 'unknown']),
  releasing: new Set(['released', 'failed', 'unknown']),
  unknown: new Set(['ready', 'releasing', 'released', 'failed']),
  released: new Set(),
  failed: new Set(),
}

const fromRow = (row: RuntimeLeaseRow): RuntimeLeaseRecord => ({
  id: row.id,
  conversationId: row.conversation_id,
  generation: row.generation,
  providerName: row.provider_name,
  providerSandboxId: row.provider_sandbox_id,
  status: row.status,
  allocationOperationId: row.allocation_operation_id,
  allocationIdempotencyKey: row.allocation_idempotency_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  readyAt: row.ready_at,
  releaseRequestedAt: row.release_requested_at,
  releasedAt: row.released_at,
  lastError: row.last_error_code === null ? null : {
    code: row.last_error_code,
    category: row.last_error_category!,
    retryable: row.last_error_retryable === 1,
    occurredAt: row.last_error_at!,
  },
})

const noControlCharacters = (value: string): boolean => [...value].every((character) => {
  const codePoint = character.codePointAt(0)!
  return codePoint > 31 && codePoint !== 127
})

function validateSafeIdentifiers(record: RuntimeLeaseRecord): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(record.providerName)) {
    throw new TypeError('Runtime lease providerName must be a bounded provider identifier')
  }
  for (const [name, value, maximum] of [
    ['allocationOperationId', record.allocationOperationId, 255],
    ['allocationIdempotencyKey', record.allocationIdempotencyKey, 255],
  ] as const) {
    if (!value || value.length > maximum || !noControlCharacters(value)) throw new TypeError(`Runtime lease ${name} is invalid`)
  }
  if (record.providerSandboxId !== null && (!record.providerSandboxId || record.providerSandboxId.length > 512 || !noControlCharacters(record.providerSandboxId))) {
    throw new TypeError('Runtime lease providerSandboxId is invalid')
  }
  if (record.lastError && !/^[A-Za-z0-9_.:-]{1,128}$/.test(record.lastError.code)) {
    throw new TypeError('Runtime lease error code must be bounded metadata, not a provider message or body')
  }
}

function validateLifecycleShape(record: RuntimeLeaseRecord): void {
  if (record.status === 'ready' && (record.providerSandboxId === null || record.readyAt === null)) {
    throw new InvalidRuntimeLeaseTransitionError('A ready runtime lease requires provider identity and readyAt')
  }
  if ((record.status === 'releasing' || record.status === 'released')
    && (record.providerSandboxId === null || record.releaseRequestedAt === null)) {
    throw new InvalidRuntimeLeaseTransitionError(`${record.status} runtime lease requires provider identity and releaseRequestedAt`)
  }
  if (record.status === 'released' && record.releasedAt === null) {
    throw new InvalidRuntimeLeaseTransitionError('A released runtime lease requires releasedAt')
  }
  if (record.status === 'failed' && record.lastError === null) {
    throw new InvalidRuntimeLeaseTransitionError('A failed runtime lease requires bounded error metadata')
  }
}

const values = (record: RuntimeLeaseRecord): readonly unknown[] => [
  record.id,
  record.conversationId,
  record.generation,
  record.providerName,
  record.providerSandboxId,
  record.status,
  record.allocationOperationId,
  record.allocationIdempotencyKey,
  record.createdAt,
  record.updatedAt,
  record.readyAt,
  record.releaseRequestedAt,
  record.releasedAt,
  record.lastError?.code ?? null,
  record.lastError?.category ?? null,
  record.lastError === null ? null : Number(record.lastError.retryable),
  record.lastError?.occurredAt ?? null,
]

export class SqliteRuntimeLeaseRepository implements RuntimeLeaseRepository {
  constructor(private readonly database: Database.Database) {}

  findById(id: string): RuntimeLeaseRecord | undefined {
    const row = this.database.prepare('SELECT * FROM runtime_leases WHERE id = ?').get(id) as RuntimeLeaseRow | undefined
    return row && fromRow(row)
  }

  findActiveByConversation(conversationId: string): RuntimeLeaseRecord | undefined {
    const row = this.database.prepare(`
      SELECT * FROM runtime_leases
      WHERE conversation_id = ? AND status IN ('allocating', 'ready', 'releasing', 'unknown')
    `).get(conversationId) as RuntimeLeaseRow | undefined
    return row && fromRow(row)
  }

  findByProviderSandboxId(providerName: string, providerSandboxId: string): RuntimeLeaseRecord | undefined {
    const row = this.database.prepare('SELECT * FROM runtime_leases WHERE provider_name = ? AND provider_sandbox_id = ?')
      .get(providerName, providerSandboxId) as RuntimeLeaseRow | undefined
    return row && fromRow(row)
  }

  listByConversation(conversationId: string): RuntimeLeaseRecord[] {
    return (this.database.prepare('SELECT * FROM runtime_leases WHERE conversation_id = ? ORDER BY generation ASC')
      .all(conversationId) as RuntimeLeaseRow[]).map(fromRow)
  }

  insert(record: RuntimeLeaseRecord, expectedPreviousGeneration: number): void {
    validateSafeIdentifiers(record)
    if (record.status !== 'allocating' || record.providerSandboxId !== null || record.readyAt !== null || record.releaseRequestedAt !== null || record.releasedAt !== null || record.lastError !== null) {
      throw new InvalidRuntimeLeaseTransitionError('A new runtime lease must begin in a clean allocating state')
    }
    if (!Number.isSafeInteger(expectedPreviousGeneration) || expectedPreviousGeneration < 0 || record.generation !== expectedPreviousGeneration + 1) {
      throw new RuntimeLeaseGenerationConflictError('Runtime lease generation does not follow the expected fence')
    }

    try {
      const result = this.database.prepare(`
        INSERT INTO runtime_leases(
          id, conversation_id, generation, provider_name, provider_sandbox_id, status,
          allocation_operation_id, allocation_idempotency_key, created_at, updated_at,
          ready_at, release_requested_at, released_at, last_error_code, last_error_category,
          last_error_retryable, last_error_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE ? = COALESCE((SELECT MAX(generation) FROM runtime_leases WHERE conversation_id = ?), 0)
      `).run(...values(record), expectedPreviousGeneration, record.conversationId)
      if (result.changes === 0) throw new RuntimeLeaseGenerationConflictError('Runtime lease generation fence is stale')
    } catch (error) {
      if (error instanceof RuntimeLeaseGenerationConflictError) throw error
      if (this.findActiveByConversation(record.conversationId)) {
        throw new ActiveRuntimeLeaseConflictError(`Conversation ${record.conversationId} already owns an active runtime lease`)
      }
      const message = error instanceof Error ? error.message : ''
      if (message.includes('allocation_operation_id') || message.includes('allocation_idempotency_key')) {
        throw new RuntimeLeaseAllocationConflictError('Runtime lease allocation operation or idempotency key already exists')
      }
      throw error
    }
  }

  transition(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord): void {
    const current = this.findById(id)
    if (!current) throw new RecordNotFoundError(`Runtime lease ${id} does not exist`)
    if (current.generation !== expected.generation) {
      throw new RuntimeLeaseGenerationConflictError(`Runtime lease ${id} generation fence is stale`)
    }
    if (current.status !== expected.status || current.updatedAt !== expected.updatedAt) {
      throw new OptimisticConflictError(`Runtime lease ${id} state fence is stale`)
    }
    if (next.id !== id || next.conversationId !== current.conversationId || next.generation !== current.generation
      || next.providerName !== current.providerName || next.allocationOperationId !== current.allocationOperationId
      || next.allocationIdempotencyKey !== current.allocationIdempotencyKey || next.createdAt !== current.createdAt) {
      throw new InvalidRuntimeLeaseTransitionError('Runtime lease identity and allocation fields are immutable')
    }
    if (!transitions[expected.status].has(next.status)) {
      throw new InvalidRuntimeLeaseTransitionError(`Runtime lease cannot transition from ${expected.status} to ${next.status}`)
    }
    if (current.providerSandboxId !== null && next.providerSandboxId !== current.providerSandboxId) {
      throw new InvalidRuntimeLeaseTransitionError('Provider sandbox identity cannot be cleared or replaced')
    }
    validateSafeIdentifiers(next)
    validateLifecycleShape(next)
    if (next.updatedAt <= current.updatedAt) throw new InvalidRuntimeLeaseTransitionError('Runtime lease updatedAt must advance')

    let result: Database.RunResult
    try {
      result = this.database.prepare(`
        UPDATE runtime_leases SET
          provider_sandbox_id = ?, status = ?, updated_at = ?, ready_at = ?, release_requested_at = ?, released_at = ?,
          last_error_code = ?, last_error_category = ?, last_error_retryable = ?, last_error_at = ?
        WHERE id = ? AND generation = ? AND status = ? AND updated_at = ?
      `).run(
        next.providerSandboxId, next.status, next.updatedAt, next.readyAt, next.releaseRequestedAt, next.releasedAt,
        next.lastError?.code ?? null, next.lastError?.category ?? null,
        next.lastError === null ? null : Number(next.lastError.retryable), next.lastError?.occurredAt ?? null,
        id, expected.generation, expected.status, expected.updatedAt,
      )
    } catch (error) {
      if ((error instanceof Error ? error.message : '').includes('provider_name, runtime_leases.provider_sandbox_id')) {
        throw new RuntimeLeaseProviderIdentityConflictError('Provider sandbox identity is already bound to another runtime lease')
      }
      throw error
    }
    if (result.changes === 1) return
    const latest = this.findById(id)
    if (!latest) throw new RecordNotFoundError(`Runtime lease ${id} does not exist`)
    if (latest.generation !== expected.generation) throw new RuntimeLeaseGenerationConflictError(`Runtime lease ${id} generation fence is stale`)
    throw new OptimisticConflictError(`Runtime lease ${id} state fence is stale`)
  }
}

export function isActiveRuntimeLeaseStatus(status: RuntimeLeaseStatus): boolean {
  return activeStatuses.has(status)
}
