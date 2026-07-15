import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ConversationRecord, MessageRecord, UnitOfWork } from './contracts.js'
import { LegacyImportValidationError } from './errors.js'

type JsonObject = Record<string, unknown>

export interface LegacyCompatibilityRequest {
  sourceId: string
  sourceDirectory: string
  task: Readonly<JsonObject>
}

export interface LegacyCompatibilityInput {
  messagesFor(request: LegacyCompatibilityRequest): unknown | Promise<unknown>
}

export interface LegacyImportOptions {
  legacyRoot: string
  unitOfWork: UnitOfWork
  compatibility?: LegacyCompatibilityInput
  now?: () => string
}

export interface LegacyImportSuccess {
  sourceId: string
  conversationId: string
  sourceDigest: string
  messageCount: number
  reconstructedMessages: boolean
}

export interface LegacyImportQuarantine {
  sourceId: string
  sourceDirectory: string
  code: 'invalid_source' | 'missing_messages' | 'changed_source' | 'transaction_failed'
  reason: string
}

export interface LegacyImportReport {
  imported: LegacyImportSuccess[]
  skipped: LegacyImportSuccess[]
  quarantined: LegacyImportQuarantine[]
}

const isObject = (value: unknown): value is JsonObject => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new LegacyImportValidationError(`${field} must be a non-empty string`)
  return value
}
const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined
  return requiredString(value, field)
}
const parseJson = (source: string, filename: string): unknown => {
  try { return JSON.parse(source) as unknown } catch { throw new LegacyImportValidationError(`${filename} is not valid JSON`) }
}

interface ValidatedLegacy {
  conversation: ConversationRecord
  messages: MessageRecord[]
}

function validateLegacy(taskValue: unknown, messagesValue: unknown): ValidatedLegacy {
  if (!isObject(taskValue)) throw new LegacyImportValidationError('task.json must contain an object')
  const id = requiredString(taskValue.id, 'task.id')
  const createdAt = requiredString(taskValue.createdAt, 'task.createdAt')
  const updatedAt = optionalString(taskValue.updatedAt, 'task.updatedAt') ?? createdAt
  const title = typeof taskValue.title === 'string' && taskValue.title.trim() ? taskValue.title : null
  if (!Array.isArray(messagesValue)) throw new LegacyImportValidationError('messages.json must contain an array')

  const messages = messagesValue.map((value, sequence): MessageRecord => {
    if (!isObject(value)) throw new LegacyImportValidationError(`messages[${sequence}] must be an object`)
    const role = value.role
    if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') {
      throw new LegacyImportValidationError(`messages[${sequence}].role is unsupported`)
    }
    const content = requiredString(value.content, `messages[${sequence}].content`)
    const legacyStatus = value.status ?? 'completed'
    if (legacyStatus !== 'streaming' && legacyStatus !== 'completed' && legacyStatus !== 'failed' && legacyStatus !== 'cancelled') {
      throw new LegacyImportValidationError(`messages[${sequence}].status is unsupported`)
    }
    return {
      id: requiredString(value.id, `messages[${sequence}].id`),
      conversationId: id,
      turnId: null,
      sequence,
      role,
      contentJson: JSON.stringify({ text: content }),
      revision: 0,
      status: legacyStatus,
      createdAt: requiredString(value.createdAt, `messages[${sequence}].createdAt`),
    }
  })

  return {
    conversation: { id, title, status: 'active', createdAt, updatedAt },
    messages,
  }
}

const digestSources = (taskSource: string, messagesSource: string): string => createHash('sha256')
  .update('task.json\0').update(taskSource).update('\0messages.json\0').update(messagesSource).digest('hex')

const errorReason = (error: unknown): string => error instanceof Error ? error.message : String(error)

export class LegacyJsonImporter {
  readonly #legacyRoot: string
  readonly #unitOfWork: UnitOfWork
  readonly #compatibility?: LegacyCompatibilityInput
  readonly #now: () => string

  constructor(options: LegacyImportOptions) {
    if (!path.isAbsolute(options.legacyRoot)) throw new TypeError('legacyRoot must be an explicit absolute path')
    this.#legacyRoot = path.resolve(options.legacyRoot)
    this.#unitOfWork = options.unitOfWork
    this.#compatibility = options.compatibility
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  async importAll(): Promise<LegacyImportReport> {
    const report: LegacyImportReport = { imported: [], skipped: [], quarantined: [] }
    const entries = (await readdir(this.#legacyRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) await this.#importDirectory(entry.name, report)
    return report
  }

  async #importDirectory(sourceId: string, report: LegacyImportReport): Promise<void> {
    const sourceDirectory = path.join(this.#legacyRoot, sourceId)
    const taskPath = path.join(sourceDirectory, 'task.json')
    const messagesPath = path.join(sourceDirectory, 'messages.json')
    let taskSource: string
    let messagesSource: string
    let taskValue: unknown
    let messagesValue: unknown
    let reconstructedMessages = false

    try {
      taskSource = await readFile(taskPath, 'utf8')
      taskValue = parseJson(taskSource, 'task.json')
      try {
        messagesSource = await readFile(messagesPath, 'utf8')
        messagesValue = parseJson(messagesSource, 'messages.json')
      } catch (error) {
        const missing = isObject(error) && 'code' in error && error.code === 'ENOENT'
        if (!missing) throw error
        if (!this.#compatibility) {
          report.quarantined.push({ sourceId, sourceDirectory, code: 'missing_messages', reason: 'messages.json is missing and no compatibility input was provided' })
          return
        }
        if (!isObject(taskValue)) throw new LegacyImportValidationError('task.json must contain an object')
        messagesValue = await this.#compatibility.messagesFor({ sourceId, sourceDirectory, task: taskValue })
        messagesSource = JSON.stringify(messagesValue)
        reconstructedMessages = true
      }
    } catch (error) {
      report.quarantined.push({ sourceId, sourceDirectory, code: 'invalid_source', reason: errorReason(error) })
      return
    }

    let validated: ValidatedLegacy
    try {
      validated = validateLegacy(taskValue, messagesValue)
    } catch (error) {
      report.quarantined.push({ sourceId, sourceDirectory, code: 'invalid_source', reason: errorReason(error) })
      return
    }

    const sourceDigest = digestSources(taskSource, messagesSource)
    const success: LegacyImportSuccess = {
      sourceId,
      conversationId: validated.conversation.id,
      sourceDigest,
      messageCount: validated.messages.length,
      reconstructedMessages,
    }

    try {
      const outcome = this.#unitOfWork.run((repositories) => {
        const previous = repositories.legacyImports.find('task_store_json', sourceId)
        if (previous) {
          if (previous.sourceDigest !== sourceDigest) throw new LegacyImportValidationError('Legacy source changed after it was imported')
          return 'skipped' as const
        }
        repositories.conversations.insert(validated.conversation)
        for (const message of validated.messages) repositories.messages.append(message)
        repositories.legacyImports.record({
          sourceKind: 'task_store_json', sourceId, sourceDigest, conversationId: validated.conversation.id,
          resultJson: JSON.stringify({ status: 'imported', messageCount: validated.messages.length, reconstructedMessages }),
          importedAt: this.#now(),
        })
        return 'imported' as const
      })
      report[outcome].push(success)
    } catch (error) {
      report.quarantined.push({
        sourceId,
        sourceDirectory,
        code: error instanceof LegacyImportValidationError ? 'changed_source' : 'transaction_failed',
        reason: errorReason(error),
      })
    }
  }
}
