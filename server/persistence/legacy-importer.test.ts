import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from './database.js'
import { LegacyJsonImporter } from './legacy-importer.js'
import { runMigrations } from './migrations.js'
import { createSqliteRepositories } from './repositories.js'
import { SqliteUnitOfWork } from './unit-of-work.js'

const directories: string[] = []
const now = '2026-07-16T00:00:00.000Z'

function setup(): { root: string; database: Database.Database; unitOfWork: SqliteUnitOfWork } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onevibe-importer-'))
  directories.push(directory)
  const root = path.join(directory, 'tasks')
  fs.mkdirSync(root)
  const database = openDatabase(path.join(directory, 'onevibe.sqlite'))
  runMigrations(database)
  return { root, database, unitOfWork: new SqliteUnitOfWork(database) }
}

function writeTask(root: string, sourceId: string, options: { messages?: unknown; task?: unknown; omitMessages?: boolean } = {}): void {
  const directory = path.join(root, sourceId)
  fs.mkdirSync(directory)
  const task = options.task ?? { id: sourceId, title: `Task ${sourceId}`, createdAt: now, updatedAt: now }
  fs.writeFileSync(path.join(directory, 'task.json'), `${JSON.stringify(task)}\n`)
  if (!options.omitMessages) {
    const messages = options.messages ?? [
      { id: `${sourceId}-user`, role: 'user', content: 'Build a deck', status: 'completed', createdAt: now },
      { id: `${sourceId}-assistant`, role: 'assistant', content: 'Deck complete', status: 'completed', createdAt: now },
    ]
    fs.writeFileSync(path.join(directory, 'messages.json'), `${JSON.stringify(messages)}\n`)
  }
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('LegacyJsonImporter', () => {
  it('imports valid tasks atomically, records a digest receipt, and leaves source files unchanged', async () => {
    const { root, database, unitOfWork } = setup()
    try {
      writeTask(root, 'task-1')
      const taskBefore = fs.readFileSync(path.join(root, 'task-1', 'task.json'), 'utf8')
      const messagesBefore = fs.readFileSync(path.join(root, 'task-1', 'messages.json'), 'utf8')
      const report = await new LegacyJsonImporter({ legacyRoot: root, unitOfWork, now: () => now }).importAll()
      expect(report).toMatchObject({ imported: [{ sourceId: 'task-1', conversationId: 'task-1', messageCount: 2 }], skipped: [], quarantined: [] })
      const repositories = createSqliteRepositories(database)
      expect(repositories.conversations.findById('task-1')?.title).toBe('Task task-1')
      expect(repositories.messages.listByConversation('task-1')).toHaveLength(2)
      expect(repositories.legacyImports.find('task_store_json', 'task-1')?.sourceDigest).toMatch(/^[a-f0-9]{64}$/)
      expect(fs.readFileSync(path.join(root, 'task-1', 'task.json'), 'utf8')).toBe(taskBefore)
      expect(fs.readFileSync(path.join(root, 'task-1', 'messages.json'), 'utf8')).toBe(messagesBefore)
    } finally { database.close() }
  })

  it('skips an unchanged source on rerun without duplicating records', async () => {
    const { root, database, unitOfWork } = setup()
    try {
      writeTask(root, 'task-1')
      const importer = new LegacyJsonImporter({ legacyRoot: root, unitOfWork, now: () => now })
      await importer.importAll()
      const rerun = await importer.importAll()
      expect(rerun.imported).toEqual([])
      expect(rerun.skipped).toHaveLength(1)
      expect(database.prepare('SELECT count(*) FROM conversations').pluck().get()).toBe(1)
      expect(database.prepare('SELECT count(*) FROM messages').pluck().get()).toBe(2)
    } finally { database.close() }
  })

  it('quarantines malformed JSON with an explicit report and continues importing valid siblings', async () => {
    const { root, database, unitOfWork } = setup()
    try {
      writeTask(root, 'good')
      writeTask(root, 'bad')
      fs.writeFileSync(path.join(root, 'bad', 'messages.json'), '{not json')
      const report = await new LegacyJsonImporter({ legacyRoot: root, unitOfWork }).importAll()
      expect(report.imported.map((item) => item.sourceId)).toEqual(['good'])
      expect(report.quarantined).toEqual([expect.objectContaining({ sourceId: 'bad', code: 'invalid_source', reason: 'messages.json is not valid JSON' })])
      expect(createSqliteRepositories(database).conversations.findById('bad')).toBeUndefined()
    } finally { database.close() }
  })

  it('requires explicit compatibility input to reconstruct a missing messages file', async () => {
    const { root, database, unitOfWork } = setup()
    try {
      writeTask(root, 'task-1', { omitMessages: true })
      const withoutCompatibility = await new LegacyJsonImporter({ legacyRoot: root, unitOfWork }).importAll()
      expect(withoutCompatibility.quarantined).toEqual([expect.objectContaining({ code: 'missing_messages' })])

      const withCompatibility = await new LegacyJsonImporter({
        legacyRoot: root,
        unitOfWork,
        compatibility: { messagesFor: ({ sourceId }) => [
          { id: `${sourceId}-reconstructed`, role: 'user', content: 'Explicit reconstruction', createdAt: now },
        ] },
      }).importAll()
      expect(withCompatibility.imported).toEqual([expect.objectContaining({ reconstructedMessages: true, messageCount: 1 })])
      expect(createSqliteRepositories(database).messages.listByConversation('task-1')).toHaveLength(1)
      expect(fs.existsSync(path.join(root, 'task-1', 'messages.json'))).toBe(false)
    } finally { database.close() }
  })

  it('rolls back the entire conversation and receipt when one imported message violates a constraint', async () => {
    const { root, database, unitOfWork } = setup()
    try {
      writeTask(root, 'task-1', { messages: [
        { id: 'duplicate', role: 'user', content: 'first', createdAt: now },
        { id: 'duplicate', role: 'assistant', content: 'second', createdAt: now },
      ] })
      const report = await new LegacyJsonImporter({ legacyRoot: root, unitOfWork }).importAll()
      expect(report.quarantined).toEqual([expect.objectContaining({ sourceId: 'task-1', code: 'transaction_failed' })])
      expect(database.prepare('SELECT count(*) FROM conversations').pluck().get()).toBe(0)
      expect(database.prepare('SELECT count(*) FROM messages').pluck().get()).toBe(0)
      expect(database.prepare('SELECT count(*) FROM legacy_imports').pluck().get()).toBe(0)
    } finally { database.close() }
  })

  it('quarantines a previously imported source if its contents change', async () => {
    const { root, database, unitOfWork } = setup()
    try {
      writeTask(root, 'task-1')
      const importer = new LegacyJsonImporter({ legacyRoot: root, unitOfWork })
      await importer.importAll()
      const messagesPath = path.join(root, 'task-1', 'messages.json')
      const changed = JSON.parse(fs.readFileSync(messagesPath, 'utf8')) as Array<Record<string, unknown>>
      changed[0]!.content = 'changed after import'
      fs.writeFileSync(messagesPath, JSON.stringify(changed))
      const report = await importer.importAll()
      expect(report.quarantined).toEqual([expect.objectContaining({ sourceId: 'task-1', code: 'changed_source' })])
      expect(createSqliteRepositories(database).messages.listByConversation('task-1')[0]?.contentJson).toBe('{"text":"Build a deck"}')
    } finally { database.close() }
  })
})
