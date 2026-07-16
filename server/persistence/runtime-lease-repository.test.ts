import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationRecord, RuntimeLeaseRecord } from './contracts.js'
import { openDatabase } from './database.js'
import {
  ActiveRuntimeLeaseConflictError,
  InvalidRuntimeLeaseTransitionError,
  OptimisticConflictError,
  RuntimeLeaseAllocationConflictError,
  RuntimeLeaseGenerationConflictError,
  RuntimeLeaseProviderIdentityConflictError,
} from './errors.js'
import { migrations, runMigrations } from './migrations.js'
import { createSqliteRepositories } from './repositories.js'
import { SqliteUnitOfWork } from './unit-of-work.js'

const directories: string[] = []
const t0 = '2026-07-16T00:00:00.000Z'
const t1 = '2026-07-16T00:00:01.000Z'
const t2 = '2026-07-16T00:00:02.000Z'
const t3 = '2026-07-16T00:00:03.000Z'

const conversation = (id = 'conversation-1'): ConversationRecord => ({
  id, title: 'Lease test', status: 'active', createdAt: t0, updatedAt: t0,
})

const allocatingLease = (overrides: Partial<RuntimeLeaseRecord> = {}): RuntimeLeaseRecord => ({
  id: 'lease-1',
  conversationId: 'conversation-1',
  generation: 1,
  providerName: 'onecomputer',
  providerSandboxId: null,
  status: 'allocating',
  allocationOperationId: 'allocation-operation-1',
  allocationIdempotencyKey: 'allocation-request-1',
  createdAt: t0,
  updatedAt: t0,
  readyAt: null,
  releaseRequestedAt: null,
  releasedAt: null,
  lastError: null,
  ...overrides,
})

function setup(): { database: Database.Database; filename: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onevibe-runtime-lease-'))
  directories.push(directory)
  const filename = path.join(directory, 'onevibe.sqlite')
  const database = openDatabase(filename)
  runMigrations(database)
  createSqliteRepositories(database).conversations.insert(conversation())
  return { database, filename }
}

const readyLease = (lease: RuntimeLeaseRecord): RuntimeLeaseRecord => ({
  ...lease, providerSandboxId: 'sandbox-provider-1', status: 'ready', updatedAt: t1, readyAt: t1,
})

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('runtime lease persistence', () => {
  it('applies the checksum-versioned v3 lease schema and indexes', () => {
    const { database } = setup()
    try {
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all()).toEqual([1, 2, 3, 4])
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runtime_leases'").pluck().get()).toBe('runtime_leases')
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'runtime_leases_one_active_per_conversation_idx'").pluck().get())
        .toBe('runtime_leases_one_active_per_conversation_idx')
    } finally { database.close() }
  })

  it('upgrades an existing v2 database without rewriting prior migration history', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onevibe-runtime-lease-upgrade-'))
    directories.push(directory)
    const database = openDatabase(path.join(directory, 'onevibe.sqlite'))
    try {
      runMigrations(database, migrations.slice(0, 2))
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'runtime_leases'").pluck().get()).toBeUndefined()
      runMigrations(database)
      expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').pluck().all()).toEqual([1, 2, 3, 4])
    } finally { database.close() }
  })

  it('enforces one fail-closed active lease per conversation', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      repository.insert(allocatingLease(), 0)
      expect(repository.findActiveByConversation('conversation-1')?.id).toBe('lease-1')
      expect(() => repository.insert(allocatingLease({
        id: 'lease-2', generation: 2, allocationOperationId: 'allocation-operation-2', allocationIdempotencyKey: 'allocation-request-2',
      }), 1)).toThrow(ActiveRuntimeLeaseConflictError)

      const unknown = { ...allocatingLease(), status: 'unknown' as const, updatedAt: t1 }
      repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, unknown)
      expect(repository.findActiveByConversation('conversation-1')?.status).toBe('unknown')
    } finally { database.close() }
  })

  it('uses generation and state fences for compare-and-swap transitions', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      const allocating = allocatingLease()
      repository.insert(allocating, 0)
      const ready = readyLease(allocating)
      repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, ready)
      expect(repository.findById('lease-1')).toEqual(ready)
      expect(() => repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, ready))
        .toThrow(OptimisticConflictError)
      expect(() => repository.transition('lease-1', { generation: 2, status: 'ready', updatedAt: t1 }, {
        ...ready, status: 'releasing', updatedAt: t2, releaseRequestedAt: t2,
      })).toThrow(RuntimeLeaseGenerationConflictError)
      expect(() => repository.transition('lease-1', { generation: 1, status: 'ready', updatedAt: t1 }, {
        ...ready, status: 'released', updatedAt: t2, releaseRequestedAt: t2, releasedAt: t2,
      })).toThrow(InvalidRuntimeLeaseTransitionError)
    } finally { database.close() }
  })

  it('looks up leases by conversation and provider sandbox identity', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      const allocating = allocatingLease()
      repository.insert(allocating, 0)
      repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, readyLease(allocating))
      expect(repository.findByProviderSandboxId('onecomputer', 'sandbox-provider-1')?.id).toBe('lease-1')
      expect(repository.findByProviderSandboxId('other-provider', 'sandbox-provider-1')).toBeUndefined()
      expect(repository.listByConversation('conversation-1').map((lease) => lease.generation)).toEqual([1])
    } finally { database.close() }
  })

  it('allows a new fenced generation only after the prior lease becomes terminal', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      const first = allocatingLease()
      repository.insert(first, 0)
      repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, {
        ...first,
        status: 'failed',
        updatedAt: t1,
        lastError: { code: 'CAPACITY_EXHAUSTED', category: 'capacity', retryable: true, occurredAt: t1 },
      })
      expect(repository.findActiveByConversation('conversation-1')).toBeUndefined()
      expect(() => repository.insert(allocatingLease({
        id: 'lease-3', generation: 3, allocationOperationId: 'allocation-operation-3', allocationIdempotencyKey: 'allocation-request-3',
      }), 2)).toThrow(RuntimeLeaseGenerationConflictError)
      repository.insert(allocatingLease({
        id: 'lease-2', generation: 2, allocationOperationId: 'allocation-operation-2', allocationIdempotencyKey: 'allocation-request-2',
        createdAt: t2, updatedAt: t2,
      }), 1)
      expect(repository.listByConversation('conversation-1')).toHaveLength(2)
    } finally { database.close() }
  })

  it('persists the ready, releasing, and released lifecycle with terminal ownership release', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      const allocating = allocatingLease()
      repository.insert(allocating, 0)
      const ready = readyLease(allocating)
      repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, ready)
      const releasing = { ...ready, status: 'releasing' as const, updatedAt: t2, releaseRequestedAt: t2 }
      repository.transition('lease-1', { generation: 1, status: 'ready', updatedAt: t1 }, releasing)
      const released = { ...releasing, status: 'released' as const, updatedAt: t3, releasedAt: t3 }
      repository.transition('lease-1', { generation: 1, status: 'releasing', updatedAt: t2 }, released)
      expect(repository.findActiveByConversation('conversation-1')).toBeUndefined()
      expect(repository.findById('lease-1')).toEqual(released)
    } finally { database.close() }
  })

  it('prevents a provider sandbox identity from being bound to two leases', () => {
    const { database } = setup()
    try {
      const repositories = createSqliteRepositories(database)
      repositories.conversations.insert(conversation('conversation-2'))
      const first = allocatingLease()
      const second = allocatingLease({
        id: 'lease-2', conversationId: 'conversation-2', allocationOperationId: 'allocation-operation-2',
        allocationIdempotencyKey: 'allocation-request-2',
      })
      repositories.runtimeLeases.insert(first, 0)
      repositories.runtimeLeases.insert(second, 0)
      repositories.runtimeLeases.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, readyLease(first))
      expect(() => repositories.runtimeLeases.transition('lease-2', {
        generation: 1, status: 'allocating', updatedAt: t0,
      }, readyLease(second))).toThrow(RuntimeLeaseProviderIdentityConflictError)
      expect(repositories.runtimeLeases.findById('lease-2')?.status).toBe('allocating')
    } finally { database.close() }
  })

  it('persists allocation operation idempotency and rejects reuse', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      const first = allocatingLease()
      repository.insert(first, 0)
      repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, {
        ...first, status: 'failed', updatedAt: t1,
        lastError: { code: 'PROVIDER_TIMEOUT', category: 'transient', retryable: true, occurredAt: t1 },
      })
      expect(() => repository.insert(allocatingLease({
        id: 'lease-2', generation: 2, allocationOperationId: 'allocation-operation-2', createdAt: t2, updatedAt: t2,
      }), 1)).toThrow(RuntimeLeaseAllocationConflictError)
      expect(repository.findById('lease-1')?.lastError).toEqual({
        code: 'PROVIDER_TIMEOUT', category: 'transient', retryable: true, occurredAt: t1,
      })
    } finally { database.close() }
  })

  it('rolls lease changes back with the synchronous UnitOfWork', () => {
    const { database } = setup()
    try {
      const unitOfWork = new SqliteUnitOfWork(database)
      expect(() => unitOfWork.run((repositories) => {
        repositories.runtimeLeases.insert(allocatingLease(), 0)
        throw new Error('abort allocation')
      })).toThrow('abort allocation')
      expect(createSqliteRepositories(database).runtimeLeases.findById('lease-1')).toBeUndefined()
    } finally { database.close() }
  })

  it('survives database reopen with provider identity and fencing metadata intact', () => {
    const opened = setup()
    const repository = createSqliteRepositories(opened.database).runtimeLeases
    const allocating = allocatingLease()
    repository.insert(allocating, 0)
    const ready = readyLease(allocating)
    repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, ready)
    opened.database.close()

    const reopened = openDatabase(opened.filename, { fileMustExist: true })
    try {
      runMigrations(reopened)
      const persisted = createSqliteRepositories(reopened).runtimeLeases.findByProviderSandboxId('onecomputer', 'sandbox-provider-1')
      expect(persisted).toEqual(ready)
    } finally { reopened.close() }
  })

  it('stores bounded error metadata and rejects provider body-like error text', () => {
    const { database } = setup()
    try {
      const repository = createSqliteRepositories(database).runtimeLeases
      const first = allocatingLease()
      repository.insert(first, 0)
      expect(() => repository.transition('lease-1', { generation: 1, status: 'allocating', updatedAt: t0 }, {
        ...first, status: 'failed', updatedAt: t3,
        lastError: { code: 'HTTP 500: {"token":"secret"}', category: 'provider', retryable: false, occurredAt: t3 },
      })).toThrow(TypeError)
      expect(repository.findById('lease-1')?.status).toBe('allocating')
    } finally { database.close() }
  })
})
