import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { createPostgresMetadataRepository } from '../server/persistence/postgres-metadata.js'
import type { Project, Task, TaskSchedule } from '../server/types.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const suffix = randomUUID().replaceAll('-', '')
const ownerUserId = `metadata-owner-${suffix}`
const otherUserId = `metadata-other-${suffix}`
const projectId = `project_metadata_${suffix}`
const taskId = `task_metadata_${suffix}`
const scheduleId = `schedule_metadata_${suffix}`
const createdAt = new Date()
const sql = postgres(databaseUrl, { max: 2, prepare: false })
const seedUser = (id: string) => sql`
  INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
  VALUES (${id}, ${id}, ${`${id}@example.invalid`}, true, ${createdAt}, ${createdAt})
`

const main = async () => {
  const project: Project = { id: projectId, ownerUserId, name: 'Metadata proof', context: 'Owner-scoped Postgres metadata.', files: [], createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString() }
  const task: Task = {
    id: taskId, ownerUserId, title: 'Metadata persistence proof', prompt: 'Prove restart and owner isolation.', provider: 'claude_sdk', mode: 'chat',
    skills: [], tags: [], queuedGuidance: [], projectId, references: [], attachments: [], status: 'pending', plan: [], createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString(),
  }
  const schedule: TaskSchedule = {
    id: scheduleId, ownerUserId, name: 'Metadata schedule', prompt: 'Run the metadata proof.', provider: 'claude_sdk', mode: 'chat', projectId,
    intervalMinutes: 60, enabled: true, nextRunAt: new Date(createdAt.getTime() + 3_600_000).toISOString(), createdAt: createdAt.toISOString(), updatedAt: createdAt.toISOString(),
  }
  await seedUser(ownerUserId); await seedUser(otherUserId)
  try {
    let connection = createPostgresMetadataRepository(databaseUrl, { maxConnections: 1 })
    await connection.repository.insertProject(project)
    await connection.repository.insertTask(task)
    await connection.repository.insertSchedule(schedule)
    await connection.close()

    connection = createPostgresMetadataRepository(databaseUrl, { maxConnections: 1 })
    const restored = await connection.repository.load(ownerUserId)
    assert.deepEqual(restored.projects.map((item) => item.id), [projectId])
    assert.deepEqual(restored.tasks.map((item) => item.id), [taskId])
    assert.deepEqual(restored.schedules.map((item) => item.id), [scheduleId])
    assert.deepEqual((await connection.repository.load(otherUserId)), { projects: [], tasks: [], schedules: [] })

    const updatedTask: Task = { ...restored.tasks[0]!, status: 'completed', updatedAt: new Date(createdAt.getTime() + 1_000).toISOString() }
    await connection.repository.updateTask(updatedTask, task.updatedAt)
    const afterUpdate = await connection.repository.load(ownerUserId)
    assert.equal(afterUpdate.tasks[0]?.status, 'completed')
    await assert.rejects(() => connection.repository.updateTask({ ...updatedTask, status: 'failed', updatedAt: new Date(createdAt.getTime() + 2_000).toISOString() }, task.updatedAt), /modified concurrently/)
    await connection.repository.deleteSchedule(scheduleId, ownerUserId)
    assert.deepEqual((await connection.repository.load(ownerUserId)).schedules, [])
    await connection.close()
    console.log(JSON.stringify({ repository: 'Postgres metadata', restoredProjects: restored.projects.length, restoredTasks: restored.tasks.length, updatedTaskStatus: afterUpdate.tasks[0]?.status, ownerIsolation: true, scheduleDelete: true, restartRecovery: true, limitation: 'not yet selected by the running TaskStore/server driver' }, null, 2))
  } finally {
    await sql`DELETE FROM "user" WHERE id = ${ownerUserId} OR id = ${otherUserId}`
  }
}

main().finally(() => sql.end({ timeout: 5 })).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
