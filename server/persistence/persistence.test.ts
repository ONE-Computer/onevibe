import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.js'
import {
  MigrationIntegrityError,
  migrationChecksum,
  migrations,
  runMigrations,
  UnsupportedSchemaVersionError,
  type Migration,
} from './migrations.js'
import { runInTransaction } from './unit-of-work.js'

const temporaryDirectories: string[] = []
const now = '2026-07-16T00:00:00.000Z'

function createDatabase(): Database.Database {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onevibe-persistence-'))
  temporaryDirectories.push(directory)
  return openDatabase(path.join(directory, 'onevibe.sqlite'))
}

function insertConversation(database: Database.Database, id = 'conversation-1'): void {
  database.prepare('INSERT INTO conversations(id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, 'Test conversation', 'active', now, now)
}

function insertTurn(
  database: Database.Database,
  values: { id: string; clientRequestId: string; ordinal: number; status?: string; conversationId?: string },
): void {
  database.prepare(`
    INSERT INTO turns(id, conversation_id, client_request_id, ordinal, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(values.id, values.conversationId ?? 'conversation-1', values.clientRequestId, values.ordinal, values.status ?? 'queued', now)
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('SQLite persistence foundation', () => {
  it('migrates a fresh database with explicit durability pragmas and the v1 schema', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all()
      expect(tables).toEqual(expect.arrayContaining([
        'conversations', 'idempotency_keys', 'legacy_imports', 'messages', 'runtime_events', 'schema_migrations', 'turns',
      ]))
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1)
      expect(database.pragma('journal_mode', { simple: true })).toBe('wal')
      expect(database.pragma('busy_timeout', { simple: true })).toBe(5_000)
      expect(database.pragma('synchronous', { simple: true })).toBe(2)
      expect(database.prepare('SELECT version FROM schema_migrations').pluck().all()).toEqual([1, 2, 3, 4])
    } finally {
      database.close()
    }
  })

  it('reruns migrations idempotently without changing the ledger', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      const first = database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
      runMigrations(database)
      expect(database.prepare('SELECT * FROM schema_migrations ORDER BY version').all()).toEqual(first)
    } finally {
      database.close()
    }
  })

  it('rejects changed migration content whose checksum differs from the applied ledger', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      const changedSql = `${migrations[0]!.sql}\n-- changed after release`
      const changed: Migration = { ...migrations[0]!, sql: changedSql, checksum: migrationChecksum(changedSql) }
      expect(() => runMigrations(database, [changed, migrations[1]!, migrations[2]!, migrations[3]!])).toThrow(MigrationIntegrityError)
    } finally {
      database.close()
    }
  })

  it('rejects a database schema newer than the supported manifest', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      database.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
        .run(5, 'future', 'a'.repeat(64), now)
      expect(() => runMigrations(database)).toThrow(UnsupportedSchemaVersionError)
    } finally {
      database.close()
    }
  })

  it('enforces foreign keys', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      expect(() => insertTurn(database, {
        id: 'orphan', conversationId: 'missing', clientRequestId: 'request-1', ordinal: 0,
      })).toThrow(/FOREIGN KEY constraint failed/)
    } finally {
      database.close()
    }
  })

  it('rolls back all writes when a transaction fails', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      expect(() => runInTransaction(database, () => {
        insertConversation(database)
        insertTurn(database, { id: 'turn-1', clientRequestId: 'request-1', ordinal: 0 })
        throw new Error('abort')
      })).toThrow('abort')
      expect(database.prepare('SELECT count(*) FROM conversations').pluck().get()).toBe(0)
      expect(database.prepare('SELECT count(*) FROM turns').pluck().get()).toBe(0)
    } finally {
      database.close()
    }
  })

  it('allows only one queued or running turn per conversation', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      insertConversation(database)
      insertTurn(database, { id: 'turn-1', clientRequestId: 'request-1', ordinal: 0, status: 'running' })
      expect(() => insertTurn(database, {
        id: 'turn-2', clientRequestId: 'request-2', ordinal: 1, status: 'queued',
      })).toThrow(/UNIQUE constraint failed: turns\.conversation_id/)
      insertTurn(database, { id: 'turn-3', clientRequestId: 'request-3', ordinal: 2, status: 'completed' })
    } finally {
      database.close()
    }
  })

  it('rejects a duplicate client request within a conversation', () => {
    const database = createDatabase()
    try {
      runMigrations(database)
      insertConversation(database)
      insertTurn(database, { id: 'turn-1', clientRequestId: 'request-1', ordinal: 0, status: 'completed' })
      expect(() => insertTurn(database, {
        id: 'turn-2', clientRequestId: 'request-1', ordinal: 1, status: 'completed',
      })).toThrow(/UNIQUE constraint failed: turns\.conversation_id, turns\.client_request_id/)
    } finally {
      database.close()
    }
  })
})
