import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { TaskStore } from '../server/store.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const runImport = (dataRoot: string, ownerUserId: string) => new Promise<string>((resolve, reject) => {
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'scripts/postgres-import.ts', '--data-root', dataRoot, '--owner-user-id', ownerUserId], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''; let errorOutput = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { errorOutput += String(chunk) })
  child.on('error', reject)
  child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`Postgres import failed (${code}): ${errorOutput || output}`)))
})

const main = async () => {
  const suffix = randomUUID().replaceAll('-', '')
  const ownerUserId = `postgres-import-owner-${suffix}`
  const sourceRoot = await mkdtemp(path.join(tmpdir(), 'onevibe-postgres-import-'))
  const sql = postgres(databaseUrl!, { max: 2, prepare: false })
  try {
    const now = new Date()
    await sql`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (${ownerUserId}, ${ownerUserId}, ${`${ownerUserId}@example.invalid`}, true, ${now}, ${now})`
    const source = new TaskStore(sourceRoot)
    await source.initialize()
    const organization = await source.createOrganization('Import organization', ownerUserId)
    const project = await source.createProject('Import project', 'Durable import fixture', ownerUserId, organization.id)
    const projectWithFile = await source.addProjectFile(project.id, { name: 'import.md', mimeType: 'text/markdown', bytes: Buffer.from('Imported project context v1.') })
    const projectFile = projectWithFile.files[0]!
    const before = await source.readProjectFile(project.id, projectFile.path)
    await source.updateProjectFile(project.id, projectFile.path, 'Imported project context v2.', before.contentHash)
    const attachment = { name: 'private.txt', path: 'inputs/01-private.txt', size: Buffer.byteLength('private input'), mimeType: 'text/plain' }
    const task = await source.createTask('Import durable bytes', 'demo', 'document', project.id, undefined, [], [attachment], [], ownerUserId)
    assert.equal(task.organizationId, organization.id)
    await source.writeWorkspaceFile(task.id, 'README.md', '# Imported workspace\n')
    await source.writeWorkspaceBytes(task.id, 'data.bin', Buffer.from([0, 1, 2, 255]))
    const version = await source.createWorkspaceVersion(task.id, 'Import snapshot')
    assert.ok(version)
    await source.writeWorkspaceFile(task.id, attachment.path, 'private input')
    await source.beginTurn(task.id, 'Import native trace', 'demo')
    await source.ingestNativeEvent(task.id, {
      source: 'claude_agent_sdk', sourceEventId: 'sdk-import-0', sourceSequence: 0, nativeType: 'tool_use',
      // The durable native envelope must belong to an imported turn.
      // Using the real turn id also exercises the foreign-key/projection path.
      payload: { tool: 'workspace_read', path: 'README.md' },
      projections: [{ type: 'tool_call_started', lane: 'activity', label: 'Read workspace file', content: 'README.md', payload: { path: 'README.md' } }],
    })
    await source.close()

    const output = await runImport(sourceRoot, ownerUserId)
    assert.match(output, /"workspaceFiles":\s*3/)
    const imported = new TaskStore(path.join(sourceRoot, 'postgres-read-cache'), { driver: 'postgres', databaseUrl: databaseUrl! })
    try {
      await imported.initialize()
      assert.equal(imported.getProject(project.id, ownerUserId).organizationId, organization.id)
      assert.equal(imported.getTask(task.id, ownerUserId).organizationId, organization.id)
      assert.equal(await imported.readWorkspaceFile(task.id, 'README.md'), '# Imported workspace\n')
      assert.deepEqual([...await imported.readWorkspaceBytes(task.id, 'data.bin')], [0, 1, 2, 255])
    assert.equal((await imported.listWorkspaceVersions(task.id)).length, 1)
      assert.equal(await imported.readWorkspaceFile(task.id, attachment.path), 'private input')
      assert.equal((await imported.readProjectFile(project.id, projectFile.path, ownerUserId)).content, 'Imported project context v2.')
      assert.equal(imported.listProjectFileVersions(project.id, projectFile.path, ownerUserId).length, 1)
      assert.equal((await imported.listNativeEvents(task.id)).length, 1)
      const importedProjections = await imported.listNativeProjectionRecords(task.id)
      assert.equal(importedProjections.length, 1)
      assert.equal(importedProjections[0]?.projectionIndex, 0)
      assert.equal(importedProjections[0]?.projectorVersion, 1)
      const importedOffsets = await imported.listNativeProjectionOffsets(task.id)
      assert.equal(importedOffsets.length, 1)
      assert.equal(importedOffsets[0]?.lastSourceSequence, 0)
      console.log(JSON.stringify({ import: true, workspaceBytes: true, workspaceVersionBytes: true, projectFileBytes: true, projectRevisionBytes: true, nativeProjectionLinks: true, nativeProjectionOffsets: true, privateInputPreserved: true }))
    } finally {
      await imported.close()
    }
  } finally {
    await sql`DELETE FROM "user" WHERE id = ${ownerUserId}`
    await sql.end({ timeout: 5 })
    await rm(sourceRoot, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })
