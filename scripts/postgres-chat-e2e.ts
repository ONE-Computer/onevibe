import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { createPostgresChatRepository } from '../server/persistence/postgres-chat.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required; apply reviewed migrations before running this proof')

const suffix = randomUUID().replaceAll('-', '')
const ownerUserId = `e2e-owner-${suffix}`
const otherUserId = `e2e-other-${suffix}`
const projectId = `e2e-project-${suffix}`
const conversationId = `e2e-conversation-${suffix}`
const taskId = `e2e-task-${suffix}`
const seedSql = postgres(databaseUrl, { max: 1, prepare: false })
const { repository, close } = createPostgresChatRepository(databaseUrl, { maxConnections: 1 })

const now = new Date()
const seedUser = async (id: string) => seedSql`
  INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
  VALUES (${id}, ${id}, ${`${id}@example.invalid`}, true, ${now}, ${now})
`

try {
  await seedUser(ownerUserId)
  await seedUser(otherUserId)
  await seedSql`
    INSERT INTO project (id, owner_user_id, name, context, files_json, created_at, updated_at)
    VALUES (${projectId}, ${ownerUserId}, 'Postgres chat proof', '', '[]'::jsonb, ${now}, ${now})
  `

  await repository.createConversationTask({
    conversationId, taskId, ownerUserId, projectId, title: 'Durable Postgres chat proof',
    prompt: 'Prove the owner-scoped Postgres conversation path.', provider: 'claude_sdk', mode: 'chat', createdAt: now,
  })
  assert.equal((await repository.findConversation(conversationId, ownerUserId))?.owner_user_id, ownerUserId)
  assert.equal(await repository.findConversation(conversationId, otherUserId), undefined)

  const firstTurn = await repository.beginTurn({
    conversationId, taskId, ownerUserId, turnId: `${taskId}:turn:1`, clientRequestId: 'client-request-1',
    prompt: 'Hello from the durable owner-scoped conversation.', createdAt: now,
  })
  const replayedTurn = await repository.beginTurn({
    conversationId, taskId, ownerUserId, turnId: `${taskId}:turn:duplicate`, clientRequestId: 'client-request-1',
    prompt: 'This must not duplicate the user message.', createdAt: now,
  })
  assert.equal(firstTurn.replayed, false)
  assert.equal(replayedTurn.replayed, true)
  assert.equal(replayedTurn.id, firstTurn.id)

  await repository.appendAssistantMessage({
    conversationId, taskId, ownerUserId, messageId: `${taskId}:message:assistant`, turnId: firstTurn.id,
    content: { text: 'The durable Postgres path is connected.' }, providerMessageId: 'provider-message-1', createdAt: now,
  })
  const messages = await repository.listMessages(conversationId, ownerUserId)
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant'])
  assert.equal(messages[1]?.providerMessageId, 'provider-message-1')

  await repository.appendRuntimeEvent({
    conversationId, taskId, ownerUserId, eventId: `${taskId}:event:1`, runId: firstTurn.id,
    type: 'turn_started', lane: 'activity', payload: { source: 'postgres-chat-e2e' }, previousHash: '0'.repeat(64), eventHash: '1'.repeat(64), createdAt: now,
  })
  assert.equal((await repository.listRuntimeEvents(conversationId, ownerUserId)).length, 1)
  assert.deepEqual(await repository.listMessages(conversationId, otherUserId), [])
  await assert.rejects(() => repository.beginTurn({
    conversationId, taskId, ownerUserId: otherUserId, turnId: `${taskId}:turn:foreign`, clientRequestId: 'foreign-request', prompt: 'must fail', createdAt: now,
  }), /does not exist for this owner/)

  console.log(JSON.stringify({
    provider: 'Postgres repository vertical slice', conversationId, taskId, turnReplay: replayedTurn.replayed,
    messageCount: messages.length, runtimeEventCount: (await repository.listRuntimeEvents(conversationId, ownerUserId)).length,
    ownerIsolation: true, limitation: 'isolated repository proof; the running HTTP contract still requires authenticated multi-instance acceptance',
  }, null, 2))
} finally {
  await close()
  await seedSql`DELETE FROM "user" WHERE id IN (${ownerUserId}, ${otherUserId})`
  await seedSql.end({ timeout: 5 })
}
