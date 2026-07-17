import type { NativeEventProjectionRecord, NativeEventRecord, NativeProjectionOffset } from './contracts.js'
import type { ChatMessage, EventInput, Project, RuntimeEvent, Task, TaskSchedule } from '../types.js'
import { createPostgresChatRepository, type PostgresChatRepository, type PostgresChatMessage, type PostgresRuntimeEventRow } from './postgres-chat.js'
import { createPostgresMetadataRepository, type PostgresMetadataRepository } from './postgres-metadata.js'
import { createPostgresOperationsRepository, type PostgresOperationsRepository } from './postgres-operations.js'

export type PostgresStateConfig = { readonly maxConnections?: number; readonly connectTimeoutSeconds?: number }

const providerFor = (value: unknown, fallback: Task['provider']): Task['provider'] => value === 'demo' || value === 'claude_sdk' || value === 'codex' || value === 'agentcore' || value === 'onecomputer' || value === 'remote' ? value : fallback
const messageFromRow = (row: PostgresChatMessage, task: Task): ChatMessage => {
  const content = row.content && typeof row.content === 'object' && !Array.isArray(row.content) ? row.content as { text?: unknown; provider?: unknown; updatedAt?: unknown } : {}
  return {
    id: row.id, taskId: task.id, turnId: row.turnId ?? `legacy_turn_${row.sequence}`, role: row.role === 'tool' ? 'system' : row.role as ChatMessage['role'],
    content: typeof content.text === 'string' ? content.text : '', status: row.status as ChatMessage['status'], provider: providerFor(content.provider, task.provider),
    createdAt: row.createdAt.toISOString(), updatedAt: typeof content.updatedAt === 'string' ? content.updatedAt : row.createdAt.toISOString(),
  }
}
const eventFromRow = (row: PostgresRuntimeEventRow): RuntimeEvent => ({
  id: row.id, taskId: row.task_id, ...(row.run_id ? { runId: row.run_id } : {}), sequence: row.sequence, type: row.type as RuntimeEvent['type'], lane: row.lane as RuntimeEvent['lane'],
  ...(row.status ? { status: row.status as RuntimeEvent['status'] } : {}), ...(row.label ? { label: row.label } : {}), ...(row.content ? { content: row.content } : {}),
  payload: row.payload_json && typeof row.payload_json === 'object' && !Array.isArray(row.payload_json) ? row.payload_json as Record<string, unknown> : {},
  createdAt: row.created_at.toISOString(), previousHash: row.previous_hash, eventHash: row.event_hash,
})

export type PostgresStateSnapshot = { projects: Project[]; tasks: Task[]; schedules: TaskSchedule[]; messages: Map<string, ChatMessage[]>; events: Map<string, RuntimeEvent[]> }

export class PostgresStateCoordinator {
  readonly #chat: PostgresChatRepository
  readonly #metadata: PostgresMetadataRepository
  readonly #operations: PostgresOperationsRepository

  constructor(databaseUrl: string, config: PostgresStateConfig = {}) {
    const chat = createPostgresChatRepository(databaseUrl, config)
    const metadata = createPostgresMetadataRepository(databaseUrl, config)
    const operations = createPostgresOperationsRepository(databaseUrl, config)
    this.#chat = chat.repository
    this.#metadata = metadata.repository
    this.#operations = operations.repository
    this.#close = async () => { await chat.close(); await metadata.close(); await operations.close() }
  }

  #close: () => Promise<void>

  async close() { await this.#close() }

  async load(ownerUserId?: string): Promise<PostgresStateSnapshot> {
    const metadata = await this.#metadata.load(ownerUserId)
    const messages = new Map<string, ChatMessage[]>()
    const events = new Map<string, RuntimeEvent[]>()
    for (const task of metadata.tasks) {
      if (!task.ownerUserId) continue
      messages.set(task.id, (await this.#chat.listMessages(task.id, task.ownerUserId)).map((row) => messageFromRow(row, task)))
      events.set(task.id, (await this.#chat.listRuntimeEvents(task.id, task.ownerUserId)).map(eventFromRow))
    }
    return { ...metadata, messages, events }
  }

  async insertProject(project: Project) { await this.#metadata.insertProject(project) }
  async updateProject(project: Project, expectedUpdatedAt: string) { await this.#metadata.updateProject(project, expectedUpdatedAt) }
  async insertTask(task: Task) { await this.#metadata.insertTask(task) }
  async updateTask(task: Task, expectedUpdatedAt: string) { await this.#metadata.updateTask(task, expectedUpdatedAt) }
  async insertSchedule(schedule: TaskSchedule) { await this.#metadata.insertSchedule(schedule) }
  async updateSchedule(schedule: TaskSchedule, expectedUpdatedAt: string) { await this.#metadata.updateSchedule(schedule, expectedUpdatedAt) }
  async deleteSchedule(id: string, ownerUserId: string) { await this.#metadata.deleteSchedule(id, ownerUserId) }

  async beginTurn(task: Task, turnId: string, clientRequestId: string, prompt: string, createdAt = new Date()) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.beginTurn({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, turnId, clientRequestId, prompt, createdAt })
  }

  async createAssistantPlaceholder(task: Task, turnId: string, messageId: string, createdAt = new Date()) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.appendAssistantMessage({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, turnId, content: { text: '', provider: task.provider, updatedAt: createdAt.toISOString() }, createdAt })
  }

  async appendAssistantDelta(task: Task, messageId: string, expectedRevision: number, delta: string, status: ChatMessage['status'] = 'streaming') {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.appendAssistantDelta({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, expectedRevision, delta, status })
  }

  async reviseAssistant(task: Task, messageId: string, expectedRevision: number, content: unknown, status: ChatMessage['status']) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    return this.#chat.reviseAssistant({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, messageId, expectedRevision, content, status })
  }

  async finishTurn(task: Task, turnId: string, status: ChatMessage['status'], completedAt = new Date(), error?: unknown) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    await this.#chat.finishTurn(task.id, task.id, task.ownerUserId, turnId, status, completedAt, error)
  }

  async appendEvent(task: Task, event: { id: string; runId?: string; sequence?: number; type: EventInput['type']; lane: EventInput['lane']; status?: EventInput['status']; label?: string; content?: string; payload: Record<string, unknown>; createdAt: Date; previousHash: string; eventHash: string }) {
    if (!task.ownerUserId) throw new Error('Postgres conversations require an owner')
    const row = await this.#chat.appendRuntimeEvent({ conversationId: task.id, taskId: task.id, ownerUserId: task.ownerUserId, eventId: event.id, runId: event.runId, type: event.type, lane: event.lane, status: event.status, label: event.label, content: event.content, payload: event.payload, previousHash: event.previousHash, eventHash: event.eventHash, createdAt: event.createdAt })
    return eventFromRow(row)
  }

  async listMessages(task: Task) {
    if (!task.ownerUserId) return []
    return (await this.#chat.listMessages(task.id, task.ownerUserId)).map((row) => messageFromRow(row, task))
  }

  async listEvents(task: Task) {
    if (!task.ownerUserId) return []
    return (await this.#chat.listRuntimeEvents(task.id, task.ownerUserId)).map(eventFromRow)
  }

  async findNativeEvent(task: Task, runId: string, source: string, sourceEventId: string) {
    if (!task.ownerUserId) return undefined
    return this.#chat.findNativeEvent(task.id, task.ownerUserId, runId, source, sourceEventId)
  }

  async listNativeEvents(task: Task, runId?: string, source?: string, afterSourceSequence = -1, limit = 10_000) {
    if (!task.ownerUserId) return []
    return this.#chat.listNativeEvents(task.id, task.ownerUserId, runId, source, afterSourceSequence, limit)
  }

  async appendNativeEvent(task: Task, record: NativeEventRecord) {
    if (!task.ownerUserId) throw new Error('Postgres native events require an owner')
    if (record.conversationId !== task.id) throw new Error(`Native event ${record.id} is not bound to task conversation ${task.id}`)
    await this.#chat.appendNativeEvent(record, task.ownerUserId)
  }

  async appendNativeEventProjection(task: Task, record: NativeEventProjectionRecord) {
    if (!task.ownerUserId) throw new Error('Postgres native event projections require an owner')
    await this.#chat.appendNativeEventProjection(record, task.id, task.ownerUserId)
  }

  async getNativeProjectionOffset(task: Task, runId: string, source: string, projectorVersion: number) {
    if (!task.ownerUserId) return undefined
    return this.#chat.getNativeProjectionOffset(task.id, task.ownerUserId, runId, source, projectorVersion)
  }

  async setNativeProjectionOffset(task: Task, record: NativeProjectionOffset) {
    if (!task.ownerUserId) throw new Error('Postgres native projection offsets require an owner')
    if (record.conversationId !== task.id) throw new Error(`Native projection offset is not bound to task conversation ${task.id}`)
    await this.#chat.setNativeProjectionOffset(record, task.ownerUserId)
  }

  async claimIdempotency(scope: string, key: string, requestHash: string, createdAt: string, ownerUserId?: string) { return this.#operations.claimIdempotency(scope, key, requestHash, createdAt, ownerUserId) }
  async findIdempotency(scope: string, key: string) { return this.#operations.findIdempotency(scope, key) }
  async completeIdempotency(scope: string, key: string, responseJson: string, completedAt: string) { return this.#operations.completeIdempotency(scope, key, responseJson, completedAt) }
}
