import postgres, { type Sql, type TransactionSql } from 'postgres'
import { RecordNotFoundError, OptimisticConflictError } from './errors.js'

type ChatSql = Sql<Record<string, never>>
type ChatTransaction = TransactionSql<Record<string, never>>

export type PostgresChatConfig = {
  readonly maxConnections?: number
  readonly connectTimeoutSeconds?: number
}

export type CreateConversationTaskInput = {
  conversationId: string
  taskId: string
  ownerUserId: string
  projectId: string
  title: string
  prompt: string
  provider: string
  mode: string
  createdAt?: Date
}

export type BeginTurnInput = {
  conversationId: string
  taskId: string
  ownerUserId: string
  turnId: string
  clientRequestId: string
  prompt: string
  createdAt?: Date
}

export type PostgresChatTurn = {
  id: string
  taskId: string
  clientRequestId: string
  ordinal: number
  status: string
  replayed: boolean
}

export type PostgresChatMessage = {
  id: string
  taskId: string
  turnId: string | null
  sequence: number
  role: string
  content: unknown
  providerMessageId: string | null
  revision: number
  status: string
  createdAt: Date
}

export type AppendAssistantMessageInput = {
  conversationId: string
  taskId: string
  ownerUserId: string
  messageId: string
  turnId: string
  content: unknown
  providerMessageId?: string
  createdAt?: Date
}

export type AppendAssistantDeltaInput = {
  conversationId: string
  taskId: string
  ownerUserId: string
  messageId: string
  expectedRevision: number
  delta: string
  status?: string
}

export type ReviseAssistantInput = AppendAssistantDeltaInput & { content: unknown; status: string }

export type AppendRuntimeEventInput = {
  conversationId: string
  taskId: string
  ownerUserId: string
  eventId: string
  runId?: string
  type: string
  lane: string
  status?: string
  label?: string
  content?: string
  payload: Record<string, unknown>
  previousHash: string
  eventHash: string
  createdAt?: Date
}

type ConversationRow = { id: string; owner_user_id: string; title: string | null; status: string; created_at: Date; updated_at: Date }
type TurnRow = { id: string; task_id: string; client_request_id: string; ordinal: number; status: string }
type MessageRow = { id: string; task_id: string; turn_id: string | null; sequence: number; role: string; content_json: unknown; provider_message_id: string | null; revision: number; status: string; created_at: Date }
export type PostgresRuntimeEventRow = { id: string; task_id: string; run_id: string | null; sequence: number; type: string; lane: string; status: string | null; label: string | null; content: string | null; payload_json: unknown; created_at: Date; previous_hash: string; event_hash: string }

const turnFromRow = (row: TurnRow, replayed: boolean): PostgresChatTurn => ({
  id: row.id,
  taskId: row.task_id,
  clientRequestId: row.client_request_id,
  ordinal: row.ordinal,
  status: row.status,
  replayed,
})

const requireOwnerConversation = async (sql: ChatSql | ChatTransaction, conversationId: string, ownerUserId: string): Promise<ConversationRow> => {
  const rows = await sql<ConversationRow[]>`
    SELECT id, owner_user_id, title, status, created_at, updated_at
    FROM conversation
    WHERE id = ${conversationId} AND owner_user_id = ${ownerUserId}
    FOR UPDATE
  `
  const conversation = rows[0]
  if (!conversation) throw new RecordNotFoundError(`Conversation ${conversationId} does not exist for this owner`)
  return conversation
}

const requireOwnerTask = async (sql: ChatSql | ChatTransaction, taskId: string, conversationId: string, ownerUserId: string) => {
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM task
    WHERE id = ${taskId} AND conversation_id = ${conversationId} AND owner_user_id = ${ownerUserId}
    FOR UPDATE
  `
  if (!rows[0]) throw new RecordNotFoundError(`Task ${taskId} does not belong to this owner conversation`)
}

const messageFromRow = (row: MessageRow): PostgresChatMessage => ({
  id: row.id,
  taskId: row.task_id,
  turnId: row.turn_id,
  sequence: row.sequence,
  role: row.role,
  content: row.content_json,
  providerMessageId: row.provider_message_id,
  revision: row.revision,
  status: row.status,
  createdAt: row.created_at,
})

export class PostgresChatRepository {
  readonly #sql: ChatSql

  constructor(sql: ChatSql) {
    this.#sql = sql
  }

  async createConversationTask(input: CreateConversationTaskInput): Promise<void> {
    const now = input.createdAt ?? new Date()
    await this.#sql.begin(async (tx) => {
      const project = await tx<{ id: string }[]>`
        SELECT id FROM project WHERE id = ${input.projectId} AND owner_user_id = ${input.ownerUserId} FOR UPDATE
      `
      if (!project[0]) throw new RecordNotFoundError(`Project ${input.projectId} does not exist for this owner`)
      await tx`
        INSERT INTO conversation (id, owner_user_id, title, status, created_at, updated_at)
        VALUES (${input.conversationId}, ${input.ownerUserId}, ${input.title}, 'active', ${now}, ${now})
      `
      await tx`
        INSERT INTO task (
          id, owner_user_id, conversation_id, project_id, title, prompt, provider, mode, status,
          skills_json, tags_json, queued_guidance_json, references_json, attachments_json, plan_json,
          created_at, updated_at
        ) VALUES (
          ${input.taskId}, ${input.ownerUserId}, ${input.conversationId}, ${input.projectId}, ${input.title},
          ${input.prompt}, ${input.provider}, ${input.mode}, 'pending', '[]'::jsonb, '[]'::jsonb,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${now}, ${now}
        )
      `
    })
  }

  async findConversation(conversationId: string, ownerUserId: string): Promise<ConversationRow | undefined> {
    const rows = await this.#sql<ConversationRow[]>`
      SELECT id, owner_user_id, title, status, created_at, updated_at
      FROM conversation
      WHERE id = ${conversationId} AND owner_user_id = ${ownerUserId}
    `
    return rows[0]
  }

  async beginTurn(input: BeginTurnInput): Promise<PostgresChatTurn> {
    const now = input.createdAt ?? new Date()
    return this.#sql.begin(async (tx) => {
      await requireOwnerConversation(tx, input.conversationId, input.ownerUserId)
      await requireOwnerTask(tx, input.taskId, input.conversationId, input.ownerUserId)
      const existing = await tx<TurnRow[]>`
        SELECT id, task_id, client_request_id, ordinal, status
        FROM turn WHERE task_id = ${input.taskId} AND client_request_id = ${input.clientRequestId}
      `
      if (existing[0]) return turnFromRow(existing[0], true)

      const ordinalRows = await tx<{ next_ordinal: number }[]>`
        SELECT COALESCE(MAX(ordinal) + 1, 0)::int AS next_ordinal FROM turn WHERE task_id = ${input.taskId}
      `
      const ordinal = ordinalRows[0]?.next_ordinal ?? 0
      const turns = await tx<TurnRow[]>`
        INSERT INTO turn (id, task_id, client_request_id, ordinal, status, created_at, started_at)
        VALUES (${input.turnId}, ${input.taskId}, ${input.clientRequestId}, ${ordinal}, 'running', ${now}, ${now})
        RETURNING id, task_id, client_request_id, ordinal, status
      `
      const turn = turns[0]
      if (!turn) throw new OptimisticConflictError(`Turn ${input.turnId} was not created`)
      const sequenceRows = await tx<{ next_sequence: number }[]>`
        SELECT COALESCE(MAX(sequence) + 1, 0)::int AS next_sequence FROM message WHERE task_id = ${input.taskId}
      `
      const sequence = sequenceRows[0]?.next_sequence ?? 0
      await tx`
        INSERT INTO message (id, task_id, turn_id, sequence, role, content_json, revision, status, created_at)
        VALUES (${`${input.turnId}:user`}, ${input.taskId}, ${input.turnId}, ${sequence}, 'user', ${JSON.stringify({ text: input.prompt })}::jsonb, 0, 'completed', ${now})
      `
      return turnFromRow(turn, false)
    })
  }

  async appendAssistantMessage(input: AppendAssistantMessageInput): Promise<PostgresChatMessage> {
    const now = input.createdAt ?? new Date()
    return this.#sql.begin(async (tx) => {
      await requireOwnerConversation(tx, input.conversationId, input.ownerUserId)
      await requireOwnerTask(tx, input.taskId, input.conversationId, input.ownerUserId)
      const sequenceRows = await tx<{ next_sequence: number }[]>`
        SELECT COALESCE(MAX(sequence) + 1, 0)::int AS next_sequence FROM message WHERE task_id = ${input.taskId}
      `
      const sequence = sequenceRows[0]?.next_sequence ?? 0
      const rows = await tx<MessageRow[]>`
        INSERT INTO message (id, task_id, turn_id, sequence, role, content_json, provider_message_id, revision, status, created_at)
        VALUES (${input.messageId}, ${input.taskId}, ${input.turnId}, ${sequence}, 'assistant', ${JSON.stringify(input.content)}::jsonb, ${input.providerMessageId ?? null}, 0, 'completed', ${now})
        RETURNING id, task_id, turn_id, sequence, role, content_json, provider_message_id, revision, status, created_at
      `
      const row = rows[0]
      if (!row) throw new OptimisticConflictError(`Assistant message ${input.messageId} was not appended`)
      return messageFromRow(row)
    })
  }

  async appendAssistantDelta(input: AppendAssistantDeltaInput): Promise<PostgresChatMessage> {
    return this.#sql.begin(async (tx) => {
      await requireOwnerConversation(tx, input.conversationId, input.ownerUserId)
      await requireOwnerTask(tx, input.taskId, input.conversationId, input.ownerUserId)
      const rows = await tx<MessageRow[]>`
        UPDATE message
        SET content_json = CASE
          WHEN jsonb_typeof(content_json) = 'object' THEN jsonb_set(content_json, '{text}', to_jsonb(COALESCE(content_json->>'text', '') || ${input.delta}))
          ELSE jsonb_build_object('text', ${input.delta}::text)
        END,
            status = ${input.status ?? 'streaming'}, revision = revision + 1
        WHERE id = ${input.messageId} AND task_id = ${input.taskId} AND role = 'assistant' AND revision = ${input.expectedRevision}
        RETURNING id, task_id, turn_id, sequence, role, content_json, provider_message_id, revision, status, created_at
      `
      const row = rows[0]
      if (!row) {
        const existing = await tx<{ id: string }[]>`SELECT id FROM message WHERE id = ${input.messageId} AND task_id = ${input.taskId}`
        if (!existing[0]) throw new RecordNotFoundError(`Message ${input.messageId} does not exist`)
        throw new OptimisticConflictError(`Assistant message ${input.messageId} revision conflict`)
      }
      return messageFromRow(row)
    })
  }

  async reviseAssistant(input: ReviseAssistantInput): Promise<PostgresChatMessage> {
    return this.#sql.begin(async (tx) => {
      await requireOwnerConversation(tx, input.conversationId, input.ownerUserId)
      await requireOwnerTask(tx, input.taskId, input.conversationId, input.ownerUserId)
      const rows = await tx<MessageRow[]>`
        UPDATE message SET content_json = ${JSON.stringify(input.content)}::jsonb, status = ${input.status}, revision = revision + 1
        WHERE id = ${input.messageId} AND task_id = ${input.taskId} AND role = 'assistant' AND revision = ${input.expectedRevision}
        RETURNING id, task_id, turn_id, sequence, role, content_json, provider_message_id, revision, status, created_at
      `
      const row = rows[0]
      if (!row) {
        const existing = await tx<{ id: string }[]>`SELECT id FROM message WHERE id = ${input.messageId} AND task_id = ${input.taskId}`
        if (!existing[0]) throw new RecordNotFoundError(`Message ${input.messageId} does not exist`)
        throw new OptimisticConflictError(`Assistant message ${input.messageId} revision conflict`)
      }
      return messageFromRow(row)
    })
  }

  async finishTurn(conversationId: string, taskId: string, ownerUserId: string, turnId: string, status: string, completedAt: Date, error?: unknown): Promise<void> {
    await this.#sql.begin(async (tx) => {
      await requireOwnerConversation(tx, conversationId, ownerUserId)
      await requireOwnerTask(tx, taskId, conversationId, ownerUserId)
      const result = await tx`
        UPDATE turn SET status = ${status}, completed_at = ${completedAt}, error_json = ${error === undefined ? null : JSON.stringify(error)}::jsonb
        WHERE id = ${turnId} AND task_id = ${taskId}
      `
      if (result.count !== 1) throw new RecordNotFoundError(`Turn ${turnId} does not exist`)
      await tx`UPDATE message SET status = ${status} WHERE task_id = ${taskId} AND turn_id = ${turnId} AND role = 'assistant'`
    })
  }

  async listMessages(conversationId: string, ownerUserId: string): Promise<PostgresChatMessage[]> {
    const rows = await this.#sql<MessageRow[]>`
      SELECT m.id, m.task_id, m.turn_id, m.sequence, m.role, m.content_json, m.provider_message_id, m.revision, m.status, m.created_at
      FROM message m
      INNER JOIN task t ON t.id = m.task_id
      INNER JOIN conversation c ON c.id = t.conversation_id
      WHERE c.id = ${conversationId} AND c.owner_user_id = ${ownerUserId}
      ORDER BY m.sequence ASC
    `
    return rows.map(messageFromRow)
  }

  async appendRuntimeEvent(input: AppendRuntimeEventInput): Promise<PostgresRuntimeEventRow> {
    const now = input.createdAt ?? new Date()
    return this.#sql.begin(async (tx) => {
      await requireOwnerConversation(tx, input.conversationId, input.ownerUserId)
      await requireOwnerTask(tx, input.taskId, input.conversationId, input.ownerUserId)
      const sequenceRows = await tx<{ next_sequence: number }[]>`
        SELECT COALESCE(MAX(sequence) + 1, 0)::int AS next_sequence FROM runtime_event WHERE task_id = ${input.taskId}
      `
      const sequence = sequenceRows[0]?.next_sequence ?? 0
      const rows = await tx<PostgresRuntimeEventRow[]>`
        INSERT INTO runtime_event (id, task_id, run_id, sequence, type, lane, status, label, content, payload_json, created_at, previous_hash, event_hash)
        VALUES (${input.eventId}, ${input.taskId}, ${input.runId ?? null}, ${sequence}, ${input.type}, ${input.lane}, ${input.status ?? null}, ${input.label ?? null}, ${input.content ?? null}, ${JSON.stringify(input.payload)}::jsonb, ${now}, ${input.previousHash}, ${input.eventHash})
        RETURNING id, task_id, run_id, sequence, type, lane, status, label, content, payload_json, created_at, previous_hash, event_hash
      `
      const row = rows[0]
      if (!row) throw new OptimisticConflictError(`Runtime event ${input.eventId} was not appended`)
      return row
    })
  }

  async listRuntimeEvents(conversationId: string, ownerUserId: string, afterSequence = -1): Promise<PostgresRuntimeEventRow[]> {
    const rows = await this.#sql<PostgresRuntimeEventRow[]>`
      SELECT e.id, e.task_id, e.run_id, e.sequence, e.type, e.lane, e.status, e.label, e.content, e.payload_json, e.created_at, e.previous_hash, e.event_hash
      FROM runtime_event e
      INNER JOIN task t ON t.id = e.task_id
      INNER JOIN conversation c ON c.id = t.conversation_id
      WHERE c.id = ${conversationId} AND c.owner_user_id = ${ownerUserId} AND e.sequence > ${afterSequence}
      ORDER BY e.sequence ASC
    `
    return rows
  }
}

export const createPostgresChatRepository = (databaseUrl: string, config: PostgresChatConfig = {}) => {
  const sql = postgres(databaseUrl, { max: config.maxConnections ?? 4, connect_timeout: config.connectTimeoutSeconds ?? 5, prepare: false })
  return { repository: new PostgresChatRepository(sql as ChatSql), close: () => sql.end({ timeout: 5 }) }
}
