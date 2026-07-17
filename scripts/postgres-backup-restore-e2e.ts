/**
 * Local Postgres backup/restore acceptance proof.
 *
 * The source database must already contain the reviewed Drizzle migration
 * ledger. pg_dump/pg_restore receive connection material through PG* env vars,
 * never through command-line arguments or retained output.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import postgres from 'postgres'

const execFileAsync = promisify(execFile)
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')
if (process.env.ONEVIBE_BACKUP_E2E_ALLOW_MUTATION !== 'true') throw new Error('Set ONEVIBE_BACKUP_E2E_ALLOW_MUTATION=true only for a disposable local Postgres backup/restore proof')

const parsed = new URL(databaseUrl)
const sourceDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
if (!sourceDatabase || !/^[a-zA-Z0-9_-]+$/.test(sourceDatabase)) throw new Error('DATABASE_URL must contain a simple database name for this local backup proof')

const pgEnvironment = (database: string): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || '5432',
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: database,
  ...(parsed.searchParams.get('sslmode') ? { PGSSLMODE: parsed.searchParams.get('sslmode')! } : {}),
})

const dockerContainer = process.env.PG_DUMP_DOCKER_CONTAINER?.trim()
const dockerUser = decodeURIComponent(parsed.username)
const runDocker = async (tool: string, args: string[]) => {
  if (!dockerContainer) throw new Error('PG_DUMP_DOCKER_CONTAINER is not configured')
  try {
    return await execFileAsync('docker', ['exec', dockerContainer, tool, ...args], { maxBuffer: 50 * 1024 * 1024, encoding: 'buffer' })
  } catch {
    throw new Error(`${tool} failed inside the configured PostgreSQL container`)
  }
}

const runPgTool = async (tool: string, args: string[], env: NodeJS.ProcessEnv) => {
  try {
    await execFileAsync(process.env[tool === 'pg_dump' ? 'PG_DUMP_BIN' : 'PG_RESTORE_BIN'] || tool, args, { env, maxBuffer: 2 * 1024 * 1024 })
  } catch {
    throw new Error(`${tool} failed; inspect the local PostgreSQL client/server compatibility and migration state`)
  }
}

const main = async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const restoreDatabase = `onevibe_restore_${suffix}`
  const fixtureUser = `backup-proof-user-${suffix}`
  const fixtureEmail = `${fixtureUser}@example.invalid`
  const fixtureProject = `project_backup_${suffix}`
  const fixtureConversation = `conversation_backup_${suffix}`
  const fixtureTask = `task_backup_${suffix}`
  const fixtureNow = new Date()
  const fixtureBytes = Buffer.from('backup-restore-workspace-bytes')
  const fixtureProjectBytes = Buffer.from('backup-restore-project-bytes')
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'onevibe-postgres-backup-'))
  const archivePath = path.join(tempRoot, 'onevibe.dump')
  const admin = postgres(databaseUrl, { max: 1, prepare: false })
  let restored: ReturnType<typeof postgres> | undefined
  let restoreCreated = false
  const containerArchivePath = `/tmp/onevibe-backup-${suffix}.dump`
  const fingerprint = async (client: ReturnType<typeof postgres>) => {
    const rows = await client<{ taskCount: number; eventCount: number; workspaceCount: number; projectFileCount: number; workspaceDigest: string; projectDigest: string }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM task) AS "taskCount",
        (SELECT COUNT(*)::int FROM runtime_event) AS "eventCount",
        (SELECT COUNT(*)::int FROM workspace_file) AS "workspaceCount",
        (SELECT COUNT(*)::int FROM project_file) AS "projectFileCount",
        (SELECT md5(COALESCE(string_agg(sha256, ',' ORDER BY task_id, path), '')) FROM workspace_file) AS "workspaceDigest",
        (SELECT md5(COALESCE(string_agg(sha256, ',' ORDER BY project_id, path), '')) FROM project_file) AS "projectDigest"
    `
    if (!rows[0]) throw new Error('Unable to calculate Postgres backup fingerprint')
    return rows[0]
  }
  try {
    await admin`
      INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
      VALUES (${fixtureUser}, 'Backup Proof', ${fixtureEmail}, false, ${fixtureNow}, ${fixtureNow})
    `
    await admin`
      INSERT INTO project (id, owner_user_id, name, context, files_json, created_at, updated_at)
      VALUES (${fixtureProject}, ${fixtureUser}, 'Backup proof project', 'temporary proof fixture', '[]'::jsonb, ${fixtureNow}, ${fixtureNow})
    `
    await admin`
      INSERT INTO conversation (id, owner_user_id, title, status, created_at, updated_at)
      VALUES (${fixtureConversation}, ${fixtureUser}, 'Backup proof task', 'active', ${fixtureNow}, ${fixtureNow})
    `
    await admin`
      INSERT INTO task (id, owner_user_id, conversation_id, project_id, title, prompt, provider, mode, status, created_at, updated_at)
      VALUES (${fixtureTask}, ${fixtureUser}, ${fixtureConversation}, ${fixtureProject}, 'Backup proof task', 'Temporary backup proof fixture', 'demo', 'document', 'completed', ${fixtureNow}, ${fixtureNow})
    `
    await admin`
      INSERT INTO workspace_file (task_id, path, content, size, sha256, updated_at)
      VALUES (${fixtureTask}, 'README.md', ${fixtureBytes}, ${fixtureBytes.byteLength}, ${createHash('sha256').update(fixtureBytes).digest('hex')}, ${fixtureNow})
    `
    await admin`
      INSERT INTO project_file (project_id, path, content, size, sha256, updated_at)
      VALUES (${fixtureProject}, 'knowledge.md', ${fixtureProjectBytes}, ${fixtureProjectBytes.byteLength}, ${createHash('sha256').update(fixtureProjectBytes).digest('hex')}, ${fixtureNow})
    `
    await admin`
      INSERT INTO runtime_event (id, task_id, sequence, type, lane, label, payload_json, created_at, previous_hash, event_hash)
      VALUES (${`${fixtureTask}:event:0`}, ${fixtureTask}, 0, 'activity_delta', 'control', 'Backup proof event', '{"fixture":true}'::jsonb, ${fixtureNow}, 'GENESIS', 'backup-proof-event-hash')
    `
    const sourceFingerprint = await fingerprint(admin)
    if (dockerContainer) {
      const dump = await runDocker('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '-U', dockerUser, '-d', sourceDatabase])
      await writeFile(archivePath, dump.stdout as Buffer)
    } else {
      await runPgTool('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', archivePath], pgEnvironment(sourceDatabase))
    }
    await admin.unsafe(`CREATE DATABASE "${restoreDatabase}"`)
    restoreCreated = true
    const restoreUrl = new URL(databaseUrl)
    restoreUrl.pathname = `/${restoreDatabase}`
    restored = postgres(restoreUrl.toString(), { max: 1, prepare: false })
    if (dockerContainer) {
      await execFileAsync('docker', ['cp', archivePath, `${dockerContainer}:${containerArchivePath}`], { maxBuffer: 2 * 1024 * 1024 })
      await runDocker('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '-U', dockerUser, '--dbname', restoreDatabase, containerArchivePath])
    } else {
      await runPgTool('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', restoreDatabase, archivePath], pgEnvironment(restoreDatabase))
    }

    const tables = await restored<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('task', 'runtime_event', 'workspace_file')
      ORDER BY table_name
    `
    assert.deepEqual(tables.map((row) => row.table_name), ['runtime_event', 'task', 'workspace_file'])
    const migrationRows = await restored<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`
    assert.equal(migrationRows[0]?.count, 14, 'restored database must contain all reviewed migration entries')
    const restoredFingerprint = await fingerprint(restored)
    assert.deepEqual(restoredFingerprint, sourceFingerprint)
    const restoredBytes = await restored<{ content: Buffer }[]>`SELECT content FROM workspace_file WHERE task_id = ${fixtureTask} AND path = 'README.md'`
    const restoredProjectBytes = await restored<{ content: Buffer }[]>`SELECT content FROM project_file WHERE project_id = ${fixtureProject} AND path = 'knowledge.md'`
    assert.deepEqual(restoredBytes[0]?.content, fixtureBytes)
    assert.deepEqual(restoredProjectBytes[0]?.content, fixtureProjectBytes)
    console.log(JSON.stringify({ backup: true, restore: true, reviewedMigrations: migrationRows[0]?.count, requiredTables: tables.map((row) => row.table_name), representativeRows: true, workspaceBytes: fixtureBytes.byteLength, projectFileBytes: fixtureProjectBytes.byteLength, hashesMatch: true, credentialsInArgv: false, limitation: 'local database backup/restore proof; object storage retention, managed secret delivery, PITR, and deployment rollback remain operator work' }, null, 2))
  } finally {
    await restored?.end({ timeout: 5 })
    await admin`DELETE FROM "user" WHERE id = ${fixtureUser}`
    if (dockerContainer) await runDocker('rm', ['-f', containerArchivePath]).catch(() => undefined)
    if (restoreCreated) await admin.unsafe(`DROP DATABASE "${restoreDatabase}"`)
    await admin.end({ timeout: 5 })
    await rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Postgres backup/restore proof failed'); process.exitCode = 1 })
