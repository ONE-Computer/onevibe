import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { PostgresStateCoordinator } from '../server/persistence/postgres-state.js'
import type { Project, Task } from '../server/types.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const suffix = randomUUID().replaceAll('-', '')
const ownerUserId = `state-owner-${suffix}`
const projectId = `project_state_${suffix}`
const taskId = `task_state_${suffix}`
const now = new Date()
const sql = postgres(databaseUrl, { max: 2, prepare: false })
const project: Project = { id: projectId, ownerUserId, name: 'Coordinator proof', context: '', files: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }
const task: Task = { id: taskId, ownerUserId, title: 'Coordinator task', prompt: 'Prove the composed state boundary.', provider: 'claude_sdk', mode: 'chat', skills: [], tags: [], queuedGuidance: [], projectId, references: [], attachments: [], status: 'pending', plan: [], createdAt: now.toISOString(), updatedAt: now.toISOString() }

const main = async () => {
  await sql`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES (${ownerUserId}, ${ownerUserId}, ${`${ownerUserId}@example.invalid`}, true, ${now}, ${now})`
  let coordinator = new PostgresStateCoordinator(databaseUrl, { maxConnections: 1 })
  try {
    await coordinator.insertProject(project)
    await coordinator.insertTask(task)
    await coordinator.close()
    coordinator = new PostgresStateCoordinator(databaseUrl, { maxConnections: 1 })
    const restored = await coordinator.load(ownerUserId)
    assert.deepEqual(restored.tasks.map((item) => item.id), [taskId])
    const turn = await coordinator.beginTurn(task, `${taskId}:turn:1`, 'client-1', 'Hello from the composed boundary.', now)
    await coordinator.createAssistantPlaceholder(task, turn.id, `${taskId}:assistant:1`, now)
    const placeholder = (await coordinator.listMessages(task)).find((message) => message.id === `${taskId}:assistant:1`)
    assert.ok(placeholder)
    await coordinator.appendAssistantDelta(task, placeholder.id, 0, 'Durable answer.', 'streaming')
    const event = await coordinator.appendEvent(task, { id: `${taskId}:event:1`, runId: turn.id, type: 'assistant_text_delta', lane: 'transcript', content: 'Durable answer.', payload: {}, createdAt: now, previousHash: 'GENESIS', eventHash: 'a'.repeat(64) })
    assert.equal(event.sequence, 0)
    await coordinator.finishTurn(task, turn.id, 'completed', new Date(now.getTime() + 1))
    const messages = await coordinator.listMessages(task)
    assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant'])
    assert.equal(messages[1]?.content, 'Durable answer.')
    assert.equal((await coordinator.listEvents(task)).length, 1)
    console.log(JSON.stringify({ repository: 'Postgres state coordinator', restoredTasks: restored.tasks.length, messageCount: messages.length, eventCount: 1, restartRecovery: true, limitation: 'coordinator is not yet wired into the running TaskStore/server driver' }, null, 2))
  } finally {
    await coordinator.close()
    await sql`DELETE FROM "user" WHERE id = ${ownerUserId}`
  }
}

main().finally(() => sql.end({ timeout: 5 })).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
