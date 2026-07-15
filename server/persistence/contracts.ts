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
  revision: number
  status: 'streaming' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
}

export interface MessagePage {
  items: MessageRecord[]
  nextCursor?: string
}

export interface IdempotencyRecord {
  scope: string
  key: string
  requestHash: string
  state: 'pending' | 'completed'
  responseJson: string | null
  createdAt: string
  completedAt: string | null
}

export interface LegacyImportRecord {
  sourceKind: string
  sourceId: string
  sourceDigest: string
  conversationId: string
  resultJson: string
  importedAt: string
}

export interface ConversationRepository {
  findById(id: string): ConversationRecord | undefined
  insert(record: ConversationRecord): void
  update(record: ConversationRecord, expectedUpdatedAt: string): void
}

export interface TurnRepository {
  findById(id: string): TurnRecord | undefined
  findByClientRequest(conversationId: string, clientRequestId: string): TurnRecord | undefined
  insert(record: TurnRecord): void
  update(record: TurnRecord): void
  transition(id: string, expectedStatus: TurnStatus, record: TurnRecord): void
}

export interface MessageRepository {
  listByConversation(conversationId: string, afterSequence?: number, limit?: number): MessageRecord[]
  pageByConversation(conversationId: string, cursor?: string, limit?: number): MessagePage
  append(record: MessageRecord): void
  appendAssistantDelta(id: string, expectedRevision: number, delta: string, status?: MessageRecord['status']): MessageRecord
  reviseAssistant(id: string, expectedRevision: number, contentJson: string, status: MessageRecord['status']): MessageRecord
}

export interface IdempotencyRepository {
  claim(scope: string, key: string, requestHash: string, createdAt: string): boolean
  complete(scope: string, key: string, responseJson: string, completedAt: string): void
  find(scope: string, key: string): IdempotencyRecord | undefined
}

export interface LegacyImportRepository {
  hasImported(sourceKind: string, sourceId: string): boolean
  find(sourceKind: string, sourceId: string): LegacyImportRecord | undefined
  record(record: LegacyImportRecord): void
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
