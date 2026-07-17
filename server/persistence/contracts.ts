export type ConversationStatus = 'active' | 'archived' | 'deleted'
export type TurnStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type RuntimeLeaseStatus = 'allocating' | 'ready' | 'releasing' | 'released' | 'failed' | 'unknown'
export type RuntimeLeaseErrorCategory = 'provider' | 'transient' | 'configuration' | 'capacity' | 'security' | 'unknown'

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

export interface RuntimeLeaseErrorMetadata {
  code: string
  category: RuntimeLeaseErrorCategory
  retryable: boolean
  occurredAt: string
}

export interface RuntimeLeaseRecord {
  id: string
  conversationId: string
  generation: number
  providerName: string
  providerSandboxId: string | null
  status: RuntimeLeaseStatus
  allocationOperationId: string
  allocationIdempotencyKey: string
  createdAt: string
  updatedAt: string
  readyAt: string | null
  releaseRequestedAt: string | null
  releasedAt: string | null
  lastError: RuntimeLeaseErrorMetadata | null
}

export interface RuntimeLeaseFence {
  generation: number
  status: RuntimeLeaseStatus
  updatedAt: string
}

export interface McpConfigRecord {
  id: string
  ownerUserId: string | null
  name: string
  command: string
  argsJson: string
  createdAt: string
  updatedAt: string
}

export interface McpConfigAuditRecord {
  id: string
  configId: string
  action: 'created' | 'deleted'
  name: string
  command: string
  argsJson: string
  createdAt: string
}

export type OrganizationRole = 'owner' | 'member'

export interface OrganizationRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface OrganizationMemberRecord {
  organizationId: string
  userId: string
  role: OrganizationRole
  createdAt: string
}

export interface OrganizationRepository {
  listAll(): OrganizationRecord[]
  listForUser(userId: string): OrganizationRecord[]
  findById(id: string): OrganizationRecord | undefined
  listMembers(organizationId: string): OrganizationMemberRecord[]
  findMember(organizationId: string, userId: string): OrganizationMemberRecord | undefined
  userExists(userId: string): boolean
  insertOrganization(record: OrganizationRecord): void
  insertMember(record: OrganizationMemberRecord): void
  deleteMember(organizationId: string, userId: string): boolean
}

export interface SkillInstallationRecord {
  id: string
  ownerUserId: string | null
  version: number
  title: string
  summary: string
  sha256: string
  content: string
  contentUrl: string
  sourceUrl: string
  createdAt: string
  updatedAt: string
}

export interface SkillInstallationRepository {
  list(ownerUserId?: string): SkillInstallationRecord[]
  findById(id: string, ownerUserId?: string): SkillInstallationRecord | undefined
  insert(record: SkillInstallationRecord): void
  delete(id: string, ownerUserId?: string): boolean
}

export interface McpConfigRepository {
  list(ownerUserId?: string): McpConfigRecord[]
  findById(id: string): McpConfigRecord | undefined
  insert(record: McpConfigRecord): void
  delete(id: string, ownerUserId?: string): boolean
  appendAudit(record: McpConfigAuditRecord): void
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

export interface RuntimeEventRecord {
  id: string
  conversationId: string
  runId: string | null
  sequence: number
  type: string
  lane: string
  status: string | null
  label: string | null
  content: string | null
  payloadJson: string
  createdAt: string
  previousHash: string
  eventHash: string
}

export interface RuntimeEventRepository {
  listByConversation(conversationId: string, afterSequence?: number, limit?: number): RuntimeEventRecord[]
  append(record: RuntimeEventRecord): void
}

export interface NativeEventRecord {
  id: string
  conversationId: string
  runId: string
  source: string
  sourceEventId: string
  sourceSequence: number
  nativeType: string
  payloadJson: string
  payloadHash: string
  receivedAt: string
}

export interface NativeEventProjectionRecord {
  nativeEventId: string
  projectionIndex: number
  runtimeEventId: string
  projectorVersion: number
  projectedAt: string
}

export interface NativeProjectionOffset {
  conversationId: string
  runId: string
  source: string
  projectorVersion: number
  lastSourceSequence: number
  updatedAt: string
}

export interface NativeEventRepository {
  findBySourceEvent(conversationId: string, runId: string, source: string, sourceEventId: string): NativeEventRecord | undefined
  listByConversation(conversationId: string, runId?: string, source?: string, afterSourceSequence?: number, limit?: number): NativeEventRecord[]
  listProjections(conversationId: string): NativeEventProjectionRecord[]
  listOffsets(conversationId: string): NativeProjectionOffset[]
  append(record: NativeEventRecord): void
  appendProjection(record: NativeEventProjectionRecord): void
  getOffset(conversationId: string, runId: string, source: string, projectorVersion: number): NativeProjectionOffset | undefined
  setOffset(record: NativeProjectionOffset): void
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

export interface RuntimeLeaseRepository {
  findById(id: string): RuntimeLeaseRecord | undefined
  findActiveByConversation(conversationId: string): RuntimeLeaseRecord | undefined
  findByProviderSandboxId(providerName: string, providerSandboxId: string): RuntimeLeaseRecord | undefined
  listByConversation(conversationId: string): RuntimeLeaseRecord[]
  insert(record: RuntimeLeaseRecord, expectedPreviousGeneration: number): void
  transition(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord): void
}

export interface Repositories {
  conversations: ConversationRepository
  turns: TurnRepository
  messages: MessageRepository
  runtimeEvents: RuntimeEventRepository
  nativeEvents: NativeEventRepository
  idempotency: IdempotencyRepository
  legacyImports: LegacyImportRepository
  runtimeLeases: RuntimeLeaseRepository
  mcpConfigs: McpConfigRepository
  organizations: OrganizationRepository
  skillInstallations: SkillInstallationRepository
}

/** Transactions are deliberately synchronous: better-sqlite3 cannot safely span an await. */
export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => T): T
}
