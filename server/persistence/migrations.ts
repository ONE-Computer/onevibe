import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { v1Sql } from './migrations/v1.js'
import { v2Sql } from './migrations/v2.js'

export interface Migration {
  version: number
  name: string
  sql: string
  checksum: string
}

export class MigrationIntegrityError extends Error {
  override readonly name = 'MigrationIntegrityError'
}

export class UnsupportedSchemaVersionError extends Error {
  override readonly name = 'UnsupportedSchemaVersionError'
}

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex')
}

export const migrations: readonly Migration[] = Object.freeze([
  { version: 1, name: 'base_conversation_schema', sql: v1Sql, checksum: migrationChecksum(v1Sql) },
  { version: 2, name: 'message_revisions_and_import_receipts', sql: v2Sql, checksum: migrationChecksum(v2Sql) },
])

interface AppliedMigration {
  version: number
  name: string
  checksum: string
}

function validateManifest(manifest: readonly Migration[]): void {
  let previous = 0
  for (const migration of manifest) {
    if (!Number.isSafeInteger(migration.version) || migration.version !== previous + 1) {
      throw new MigrationIntegrityError(`Migration versions must be contiguous; expected ${previous + 1}`)
    }
    if (migration.checksum !== migrationChecksum(migration.sql)) {
      throw new MigrationIntegrityError(`Migration ${migration.version} manifest checksum does not match its SQL`)
    }
    previous = migration.version
  }
}

function assertDatabaseIntegrity(database: Database.Database): void {
  const rows = database.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (rows.length !== 1 || rows[0]?.integrity_check !== 'ok') {
    throw new MigrationIntegrityError(`SQLite integrity check failed: ${rows.map((row) => row.integrity_check).join(', ')}`)
  }
}

export function runMigrations(database: Database.Database, manifest: readonly Migration[] = migrations): void {
  validateManifest(manifest)
  assertDatabaseIntegrity(database)

  const hasLedger = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").pluck().get() === 1
  const applied = hasLedger
    ? database.prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version').all() as AppliedMigration[]
    : []
  const supportedVersion = manifest.at(-1)?.version ?? 0
  const currentVersion = applied.at(-1)?.version ?? 0
  if (currentVersion > supportedVersion) {
    throw new UnsupportedSchemaVersionError(`Database schema version ${currentVersion} is newer than supported version ${supportedVersion}`)
  }

  for (const row of applied) {
    const expected = manifest.find((migration) => migration.version === row.version)
    if (!expected || expected.name !== row.name || expected.checksum !== row.checksum) {
      throw new MigrationIntegrityError(`Applied migration ${row.version} does not match the migration manifest`)
    }
  }

  const applyPending = database.transaction(() => {
    for (const migration of manifest) {
      if (migration.version <= currentVersion) continue
      database.exec(migration.sql)
      database.prepare('INSERT INTO schema_migrations(version, name, checksum, applied_at) VALUES (?, ?, ?, ?)')
        .run(migration.version, migration.name, migration.checksum, new Date().toISOString())
    }
  })
  applyPending.immediate()
  assertDatabaseIntegrity(database)
}
