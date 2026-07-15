export type ConversationStatus = 'active' | 'archived' | 'deleted'
export type TurnStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ConversationRecord {
  id: string
  title: string | null
  status: ConversationStatus
  createdAt: string
  updatedAt: string
}

export interface TurnRecord {
  id: string
  conversationId: string
  clientRequestId: string
  ordinal: number
  status: TurnStatus
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface MessageRecord {
  id: string
  conversationId: string
  turnId: string | null
  sequence: number
  role: MessageRole
  contentJson: string
  createdAt: string
}

export interface ConversationRepository {
  findById(id: string): ConversationRecord | undefined
  insert(record: ConversationRecord): void
  update(record: ConversationRecord): void
}

export interface TurnRepository {
  findById(id: string): TurnRecord | undefined
  findByClientRequest(conversationId: string, clientRequestId: string): TurnRecord | undefined
  insert(record: TurnRecord): void
  update(record: TurnRecord): void
}

export interface MessageRepository {
  listByConversation(conversationId: string, afterSequence?: number, limit?: number): MessageRecord[]
  append(record: MessageRecord): void
}

export interface IdempotencyRepository {
  claim(scope: string, key: string, requestHash: string, createdAt: string): boolean
  complete(scope: string, key: string, responseJson: string, completedAt: string): void
}

export interface LegacyImportRepository {
  hasImported(sourceKind: string, sourceId: string): boolean
  record(sourceKind: string, sourceId: string, conversationId: string, importedAt: string): void
}

export interface Repositories {
  conversations: ConversationRepository
  turns: TurnRepository
  messages: MessageRepository
  idempotency: IdempotencyRepository
  legacyImports: LegacyImportRepository
}

/** Transactions are deliberately synchronous: better-sqlite3 cannot safely span an await. */
export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => T): T
}
