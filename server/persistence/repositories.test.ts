import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationRecord, MessageRecord, NativeEventRecord, OrganizationMemberRecord, OrganizationRecord, RuntimeEventRecord, TurnRecord } from './contracts.js'
import { openDatabase } from './database.js'
import { IdempotencyConflictError, InvalidCursorError, OptimisticConflictError } from './errors.js'
import { runMigrations } from './migrations.js'
import { createSqliteRepositories } from './repositories.js'
import { SqliteUnitOfWork } from './unit-of-work.js'

const directories: string[] = []
const t0 = '2026-07-16T00:00:00.000Z'
const t1 = '2026-07-16T00:00:01.000Z'
const hash = (character: string) => character.repeat(64)

const conversation = (id = 'conversation-1'): ConversationRecord => ({ id, title: 'ONEVibe', status: 'active', createdAt: t0, updatedAt: t0 })
const turn = (id = 'turn-1'): TurnRecord => ({
  id, conversationId: 'conversation-1', clientRequestId: `request-${id}`, ordinal: Number(id.split('-').at(-1)) - 1,
  status: 'queued', createdAt: t0, startedAt: null, completedAt: null,
})
const message = (sequence: number, overrides: Partial<MessageRecord> = {}): MessageRecord => ({
  id: `message-${sequence}`, conversationId: 'conversation-1', turnId: null, sequence, role: 'user',
  contentJson: JSON.stringify({ text: `message ${sequence}` }), revision: 0, status: 'completed', createdAt: t0, ...overrides,
})
const runtimeEvent = (sequence: number, overrides: Partial<RuntimeEventRecord> = {}): RuntimeEventRecord => ({
  id: `conversation-1:event:${sequence}`, conversationId: 'conversation-1', runId: 'turn-1', sequence,
  type: 'activity_delta', lane: 'control', status: null, label: `Event ${sequence}`, content: null,
  payloadJson: JSON.stringify({ sequence }), createdAt: t0, previousHash: sequence === 0 ? 'GENESIS' : hash('a'),
  eventHash: hash(String.fromCharCode(97 + sequence)), ...overrides,
})
const nativeEvent = (sequence: number, overrides: Partial<NativeEventRecord> = {}): NativeEventRecord => ({
  id: `conversation-1:native:${sequence}`,
  conversationId: 'conversation-1', runId: 'turn-1', source: 'claude_agent_sdk', sourceEventId: `sdk-${sequence}`,
  sourceSequence: sequence, nativeType: 'assistant', payloadJson: JSON.stringify({ sequence }), payloadHash: hash(String.fromCharCode(97 + sequence)),
  receivedAt: t0, ...overrides,
})

function databaseAt(filename?: string): { database: Database.Database; filename: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onevibe-repositories-'))
  directories.push(directory)
  const resolved = filename ?? path.join(directory, 'onevibe.sqlite')
  const database = openDatabase(resolved)
  runMigrations(database)
  return { database, filename: resolved }
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('SQLite repositories', () => {
  it('supports conversation, turn, and message CRUD with optimistic updates', () => {
    const { database } = databaseAt()
    try {
      const repositories = createSqliteRepositories(database)
      repositories.conversations.insert(conversation())
      repositories.turns.insert(turn())
      repositories.messages.append(message(0, { turnId: 'turn-1' }))
      expect(repositories.conversations.findById('conversation-1')?.title).toBe('ONEVibe')
      expect(repositories.turns.findByClientRequest('conversation-1', 'request-turn-1')?.id).toBe('turn-1')
      expect(repositories.messages.listByConversation('conversation-1')).toHaveLength(1)

      repositories.conversations.update({ ...conversation(), title: 'Renamed', updatedAt: t1 }, t0)
      expect(repositories.conversations.findById('conversation-1')?.title).toBe('Renamed')
      expect(() => repositories.conversations.update({ ...conversation(), title: 'Stale', updatedAt: t1 }, t0))
        .toThrow(OptimisticConflictError)
    } finally { database.close() }
  })

  it('atomically begins and finishes a turn through UnitOfWork', () => {
    const { database } = databaseAt()
    try {
      const unitOfWork = new SqliteUnitOfWork(database)
      unitOfWork.run((repositories) => {
        repositories.conversations.insert(conversation())
        repositories.turns.insert(turn())
      })
      unitOfWork.run((repositories) => {
        const queued = repositories.turns.findById('turn-1')!
        repositories.turns.transition('turn-1', 'queued', { ...queued, status: 'running', startedAt: t1 })
        repositories.messages.append(message(0, { turnId: 'turn-1' }))
      })
      const completedAt = '2026-07-16T00:00:02.000Z'
      unitOfWork.run((repositories) => {
        const running = repositories.turns.findById('turn-1')!
        repositories.messages.append(message(1, { turnId: 'turn-1', role: 'assistant' }))
        repositories.turns.transition('turn-1', 'running', { ...running, status: 'completed', completedAt })
      })
      expect(createSqliteRepositories(database).turns.findById('turn-1')?.status).toBe('completed')
      expect(createSqliteRepositories(database).messages.listByConversation('conversation-1')).toHaveLength(2)
    } finally { database.close() }
  })

  it('keeps organization membership behind the repository boundary', () => {
    const { database } = databaseAt()
    try {
      const repositories = createSqliteRepositories(database)
      const organization: OrganizationRecord = { id: 'org_test', name: 'Test org', createdAt: t0, updatedAt: t0 }
      const owner: OrganizationMemberRecord = { organizationId: organization.id, userId: 'user-owner', role: 'owner', createdAt: t0 }
      const member: OrganizationMemberRecord = { organizationId: organization.id, userId: 'user-member', role: 'member', createdAt: t1 }
      repositories.organizations.insertOrganization(organization)
      repositories.organizations.insertMember(owner)
      repositories.organizations.insertMember(member)
      expect(repositories.organizations.listAll()).toEqual([organization])
      expect(repositories.organizations.listForUser(owner.userId)).toEqual([organization])
      expect(repositories.organizations.findById(organization.id)).toEqual(organization)
      expect(repositories.organizations.findMember(organization.id, member.userId)).toEqual(member)
      expect(repositories.organizations.listMembers(organization.id)).toEqual([owner, member])
      expect(repositories.organizations.deleteMember(organization.id, member.userId)).toBe(true)
      expect(repositories.organizations.findMember(organization.id, member.userId)).toBeUndefined()
    } finally { database.close() }
  })

  it('revises assistant streaming content with revision conflict detection', () => {
    const { database } = databaseAt()
    try {
      const repositories = createSqliteRepositories(database)
      repositories.conversations.insert(conversation())
      repositories.messages.append(message(0, { role: 'assistant', status: 'streaming', contentJson: '{"text":""}' }))
      const delta = repositories.messages.appendAssistantDelta('message-0', 0, 'del')
      expect(delta).toMatchObject({ revision: 1, status: 'streaming', contentJson: '{"text":"del"}' })
      const revised = repositories.messages.appendAssistantDelta('message-0', 1, 'ta')
      expect(revised).toMatchObject({ revision: 2, status: 'streaming', contentJson: '{"text":"delta"}' })
      const completed = repositories.messages.reviseAssistant('message-0', 2, JSON.stringify({ text: 'done' }), 'completed')
      expect(completed).toMatchObject({ revision: 3, status: 'completed' })
      expect(() => repositories.messages.reviseAssistant('message-0', 2, '{}', 'completed')).toThrow(OptimisticConflictError)
    } finally { database.close() }
  })

  it('treats same-hash idempotency claims as replays and rejects different hashes', () => {
    const { database } = databaseAt()
    try {
      const repository = createSqliteRepositories(database).idempotency
      expect(repository.claim('turn', 'request-1', hash('a'), t0)).toBe(true)
      expect(repository.claim('turn', 'request-1', hash('a'), t0)).toBe(false)
      expect(() => repository.claim('turn', 'request-1', hash('b'), t0)).toThrow(IdempotencyConflictError)
      repository.complete('turn', 'request-1', '{"turnId":"turn-1"}', t1)
      repository.complete('turn', 'request-1', '{"turnId":"turn-1"}', t1)
      expect(repository.find('turn', 'request-1')?.state).toBe('completed')
    } finally { database.close() }
  })

  it('paginates messages with stable conversation-bound cursors', () => {
    const { database } = databaseAt()
    try {
      const repositories = createSqliteRepositories(database)
      repositories.conversations.insert(conversation())
      for (let sequence = 0; sequence < 5; sequence += 1) repositories.messages.append(message(sequence))
      expect(() => repositories.messages.append(message(7))).toThrow(OptimisticConflictError)
      const first = repositories.messages.pageByConversation('conversation-1', undefined, 2)
      const second = repositories.messages.pageByConversation('conversation-1', first.nextCursor, 2)
      const third = repositories.messages.pageByConversation('conversation-1', second.nextCursor, 2)
      expect(first.items.map((item) => item.sequence)).toEqual([0, 1])
      expect(second.items.map((item) => item.sequence)).toEqual([2, 3])
      expect(third.items.map((item) => item.sequence)).toEqual([4])
      expect(third.nextCursor).toBeUndefined()
      expect(() => repositories.messages.pageByConversation('another', first.nextCursor, 2)).toThrow(InvalidCursorError)
    } finally { database.close() }
  })

  it('appends and resumes the durable runtime event ledger by sequence', () => {
    const { database } = databaseAt()
    try {
      const repositories = createSqliteRepositories(database)
      repositories.conversations.insert(conversation())
      repositories.runtimeEvents.append(runtimeEvent(0))
      repositories.runtimeEvents.append(runtimeEvent(1, { previousHash: hash('a'), eventHash: hash('b') }))
      expect(repositories.runtimeEvents.listByConversation('conversation-1').map((event) => event.sequence)).toEqual([0, 1])
      expect(repositories.runtimeEvents.listByConversation('conversation-1', 0).map((event) => event.sequence)).toEqual([1])
      expect(() => repositories.runtimeEvents.append(runtimeEvent(1, { id: 'duplicate' }))).toThrow(OptimisticConflictError)
    } finally { database.close() }
  })

  it('persists native envelopes, projection links, and monotonic source offsets idempotently', () => {
    const { database } = databaseAt()
    try {
      const repositories = createSqliteRepositories(database)
      repositories.conversations.insert(conversation())
      repositories.nativeEvents.append(nativeEvent(0))
      repositories.runtimeEvents.append(runtimeEvent(0))
      repositories.nativeEvents.appendProjection({ nativeEventId: 'conversation-1:native:0', projectionIndex: 0, runtimeEventId: 'conversation-1:event:0', projectorVersion: 1, projectedAt: t1 })
      repositories.nativeEvents.setOffset({ conversationId: 'conversation-1', runId: 'turn-1', source: 'claude_agent_sdk', projectorVersion: 1, lastSourceSequence: 0, updatedAt: t1 })
      expect(repositories.nativeEvents.findBySourceEvent('conversation-1', 'turn-1', 'claude_agent_sdk', 'sdk-0')).toMatchObject({ sourceSequence: 0 })
      expect(repositories.nativeEvents.listByConversation('conversation-1', 'turn-1', 'claude_agent_sdk').map((event) => event.sourceSequence)).toEqual([0])
      expect(repositories.nativeEvents.getOffset('conversation-1', 'turn-1', 'claude_agent_sdk', 1)).toMatchObject({ lastSourceSequence: 0 })
      expect(() => repositories.nativeEvents.append(nativeEvent(0, { id: 'duplicate', sourceEventId: 'other' }))).toThrow(OptimisticConflictError)
      repositories.nativeEvents.setOffset({ conversationId: 'conversation-1', runId: 'turn-1', source: 'claude_agent_sdk', projectorVersion: 1, lastSourceSequence: -1, updatedAt: t0 })
      expect(repositories.nativeEvents.getOffset('conversation-1', 'turn-1', 'claude_agent_sdk', 1)?.lastSourceSequence).toBe(0)
    } finally { database.close() }
  })

  it('persists repository data across database reopen', () => {
    const opened = databaseAt()
    createSqliteRepositories(opened.database).conversations.insert(conversation())
    opened.database.close()
    const reopened = openDatabase(opened.filename, { fileMustExist: true })
    try {
      runMigrations(reopened)
      expect(createSqliteRepositories(reopened).conversations.findById('conversation-1')).toEqual(conversation())
    } finally { reopened.close() }
  })
})
