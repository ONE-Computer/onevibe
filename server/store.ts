import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type Database from 'better-sqlite3'
import type { ChatMessage, ConversationSummary, EventInput, Organization, OrganizationMember, PresentationDescriptor, Project, RuntimeEvent, RuntimeMcpConfig, SkillInstallation, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill, TaskSnapshot, WorkspaceFile, WorkspaceVersion, WorkspaceVersionComparison } from './types.js'
import { nativeEventIdFor, normalizeNativeEvent, type NativeEventInput } from './native-events.js'
import { atomicWriteJson, LegacyJsonImporter, openDatabase, runMigrations, SqliteUnitOfWork, IdempotencyConflictError, OptimisticConflictError, PostgresStateCoordinator, type FollowUpAttachmentRecord, type FollowUpOperationRecord, type MessageRecord, type NativeEventRecord, type PostgresChatMessage, type RuntimeEventRecord, type RuntimeLeaseFence, type RuntimeLeaseRecord, type Repositories, type SkillInstallationRecord, type TenantThemeConfigRecord, type UnitOfWork } from './persistence/index.js'
import { isInternalWorkspacePath, isPrivateWorkspacePath, normalizeWorkspacePath, portableArtifactKind } from './artifact-path.js'
import type { McpConfig } from './runtime-adapter.js'

const DEFAULT_DATA_ROOT = path.resolve(process.env.ONEVIBE_DATA_DIR ?? '.onevibe')

export type TaskStoreOptions = {
  readonly driver?: 'sqlite' | 'postgres'
  readonly databaseUrl?: string
}

const assertWithin = (root: string, candidate: string) => {
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes configured workspace root')
}

const durableFollowUpAttachments = (operationId: string, taskId: string, ownerUserId: string | null, idempotencyKey: string, attachmentsJson: string, now: string): FollowUpAttachmentRecord[] => {
  let parsed: unknown
  try { parsed = JSON.parse(attachmentsJson) } catch { throw new Error('Follow-up attachment payload is not valid JSON') }
  if (!Array.isArray(parsed)) throw new Error('Follow-up attachment payload must be an array')
  if (parsed.length > 4) throw new RangeError('A follow-up may include at most four attachments')
  const prefix = `inputs/request-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}`
  let total = 0
  return parsed.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error('Follow-up attachment payload is invalid')
    const value = raw as Record<string, unknown>
    const rawName = typeof value.name === 'string' ? value.name : ''
    const name = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    const mimeType = typeof value.mimeType === 'string' && value.mimeType ? value.mimeType.slice(0, 160) : 'application/octet-stream'
    const dataBase64 = typeof value.dataBase64 === 'string' ? value.dataBase64 : ''
    const content = Buffer.from(dataBase64, 'base64')
    if (!name || name === '.' || name === '..' || !content.length || content.byteLength > 256 * 1024) throw new RangeError('Each attachment must be between 1 byte and 256 KiB with a safe filename')
    total += content.byteLength
    if (total > 1_000_000) throw new RangeError('Follow-up attachments exceed the 1 MiB turn limit')
    const sha256 = createHash('sha256').update(content).digest('hex')
    return {
      id: `follow_up_attachment_${createHash('sha256').update(`${operationId}:${index}:${sha256}`).digest('hex').slice(0, 32)}`,
      operationId, taskId, ownerUserId, path: `${prefix}-${String(index + 1).padStart(2, '0')}-${name}`,
      name, mimeType, size: content.byteLength, sha256, content, state: 'reserved', createdAt: now, updatedAt: now,
    }
  })
}

const isEditableProjectFile = (file: { name: string; mimeType: string }) => /^(?:text\/|application\/(?:json|yaml|xml))/.test(file.mimeType) || /\.(?:md|txt|json|ya?ml|csv|xml)$/i.test(file.name)
const projectVersionPath = (root: string, filePath: string, versionId: string) => path.join(root, '.history', filePath.replace(/[^a-zA-Z0-9._-]/g, '_'), `${versionId}.txt`)

const panelFor = (input: EventInput): PresentationDescriptor | undefined => {
  const supplied = input.payload.presentation
  if (supplied && typeof supplied === 'object' && 'panel' in supplied) return supplied as PresentationDescriptor
  if (input.type === 'tool_call_started' || input.type === 'tool_call_progress' || input.type === 'tool_call_completed') return { panel: 'terminal' }
  if (input.type === 'approval_requested' || input.type === 'approval_resolved') return { panel: 'approval' }
  if (input.type !== 'artifact_created' && input.type !== 'artifact_updated') return undefined
  const uri = typeof input.payload.uri === 'string' ? input.payload.uri : undefined
  const artifactPath = typeof input.content === 'string' ? input.content : undefined
  if (input.payload.kind === 'visual_frame') return { panel: 'screenshot', uri, artifactPath }
  if (input.type === 'artifact_updated') return { panel: 'diff', uri, artifactPath }
  if (input.payload.kind === 'slide_deck' || artifactPath?.toLowerCase().endsWith('.pptx')) return { panel: 'slide', uri, artifactPath }
  if (uri && (uri.includes('/preview') || input.payload.kind === 'website')) return { panel: 'preview', uri, artifactPath }
  return { panel: 'file', artifactPath }
}

const planFor = (mode: TaskMode, prompt: string): Task['plan'] => {
  if (mode === 'chat') return []
  const middle: Record<TaskMode, [string, string, string]> = {
    chat: ['Respond conversationally', 'Continue the conversation', 'Preserve the conversation record'],
    general: ['Prepare the governed workspace', 'Create the requested artifact', 'Validate output and policy decisions'],
    website: ['Generate and select a design concept', 'Build the responsive website', 'Run build, browser, and accessibility checks'],
    slides: ['Draft the slide-by-slide outline', 'Render the deck and speaker notes', 'Validate layout and export formats'],
    document: ['Outline the document and audience', 'Draft the portable document', 'Review structure and delivery'],
    research: ['Define sources and evidence criteria', 'Collect and synthesize findings', 'Verify citations and uncertainty'],
    data: ['Define data and decision question', 'Build the visual narrative', 'Review data limitations and export'],
    design: ['Generate visual directions', 'Develop the selected design system', 'Review consistency and accessibility'],
    app: ['Define the application architecture', 'Build the interactive application', 'Run type, build, and interaction checks'],
    game: ['Define mechanics and art direction', 'Build the playable experience', 'Play-test controls and completion paths'],
  }
  const focus = prompt.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
  const shortFocus = focus.length > 72 ? `${focus.slice(0, 69)}…` : focus
  return [
    { id: 'scope', title: `Frame ${shortFocus} and security boundaries`, status: 'pending' },
    { id: 'workspace', title: `${middle[mode][0]} for this outcome`, status: 'pending' },
    { id: 'build', title: middle[mode][1], status: 'pending' },
    { id: 'verify', title: middle[mode][2], status: 'pending' },
    { id: 'deliver', title: `Deliver ${mode === 'slides' ? 'deck' : mode === 'document' ? 'document' : 'source'}, preview, and evidence`, status: 'pending' },
  ]
}

const runtimePlanIds = ['scope', 'workspace', 'build', 'verify', 'deliver'] as const
export type RuntimePlanTitle = { id: (typeof runtimePlanIds)[number]; title: string }

const restartReconciliationStatuses = new Set<Task['status']>([
  'pending', 'running', 'waiting_for_user_input', 'waiting_for_approval',
])

const NATIVE_PROJECTOR_VERSION = 1

export const normalizeRuntimePlanTitles = (value: unknown): RuntimePlanTitle[] | undefined => {
  if (!Array.isArray(value) || value.length !== runtimePlanIds.length) return undefined
  const steps = value.map((item): RuntimePlanTitle | undefined => {
    if (!item || typeof item !== 'object') return undefined
    const candidate = item as Record<string, unknown>
    if (!runtimePlanIds.includes(candidate.id as RuntimePlanTitle['id']) || typeof candidate.title !== 'string') return undefined
    const title = candidate.title.trim().replace(/\s+/g, ' ')
    return title.length >= 4 && title.length <= 140 ? { id: candidate.id as RuntimePlanTitle['id'], title } : undefined
  })
  if (steps.some((step) => step === undefined)) return undefined
  const normalized = steps as RuntimePlanTitle[]
  return runtimePlanIds.every((id, index) => normalized[index]?.id === id) ? normalized : undefined
}

const runtimeEventRecordFor = (repositories: Repositories, taskId: string, runId: string | undefined, input: EventInput): RuntimeEventRecord => {
  const existing = repositories.runtimeEvents.listByConversation(taskId)
  const previousHash = existing.at(-1)?.eventHash ?? 'GENESIS'
  const payload = { ...input.payload }
  const unsigned = {
    taskId,
    ...(runId ? { runId } : {}),
    sequence: existing.length,
    type: input.type,
    lane: input.lane,
    status: input.status,
    label: input.label,
    content: input.content,
    payload,
    createdAt: new Date().toISOString(),
    previousHash,
  }
  const eventHash = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')
  return {
    id: `${taskId}:event:${existing.length}`,
    conversationId: taskId,
    runId: runId ?? null,
    sequence: existing.length,
    type: input.type,
    lane: input.lane,
    status: input.status ?? null,
    label: input.label ?? null,
    content: input.content ?? null,
    payloadJson: JSON.stringify(payload),
    createdAt: unsigned.createdAt,
    previousHash,
    eventHash,
  }
}

const runtimeEventInputFor = (existing: RuntimeEvent[], taskId: string, runId: string | undefined, input: EventInput): EventInput & { id: string; runId?: string; sequence: number; createdAt: string; previousHash: string; eventHash: string } => {
  const previousHash = existing.at(-1)?.eventHash ?? 'GENESIS'
  const sequence = existing.length
  const createdAt = new Date().toISOString()
  const payload = { ...input.payload }
  const unsigned = {
    taskId,
    ...(runId ? { runId } : {}),
    sequence,
    type: input.type,
    lane: input.lane,
    status: input.status,
    label: input.label,
    content: input.content,
    payload,
    createdAt,
    previousHash,
  }
  return {
    ...input,
    ...(runId ? { runId } : {}),
    id: `${taskId}:event:${sequence}`,
    sequence,
    createdAt,
    previousHash,
    eventHash: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),
  }
}

export class TaskStore {
  private tasks = new Map<string, Task>()
  private events = new Map<string, RuntimeEvent[]>()
  private messages = new Map<string, ChatMessage[]>()
  private projects = new Map<string, Project>()
  private schedules = new Map<string, TaskSchedule>()
  private activeTurns = new Map<string, string>()
  private emitter = new EventEmitter()
  private tasksRoot: string
  private workspacesRoot: string
  private runtimeRoot: string
  private versionsRoot: string
  private projectsRoot: string
  private projectsFile: string
  private schedulesFile: string
  private database?: Database.Database
  private unitOfWork?: UnitOfWork
  private postgresState?: PostgresStateCoordinator
  private postgresMessageRevisions = new Map<string, number>()
  private initialized = false

  constructor(dataRoot = DEFAULT_DATA_ROOT, options: TaskStoreOptions = {}) {
    const resolvedRoot = path.resolve(dataRoot)
    this.tasksRoot = path.join(resolvedRoot, 'tasks')
    this.workspacesRoot = path.join(resolvedRoot, 'workspaces')
    this.runtimeRoot = path.join(resolvedRoot, 'runtime')
    this.versionsRoot = path.join(resolvedRoot, 'versions')
    this.projectsRoot = path.join(resolvedRoot, 'projects')
    this.projectsFile = path.join(resolvedRoot, 'projects.json')
    this.schedulesFile = path.join(resolvedRoot, 'schedules.json')
    if (options.driver === 'postgres') {
      const databaseUrl = options.databaseUrl?.trim()
      if (!databaseUrl) throw new Error('Postgres TaskStore requires DATABASE_URL')
      this.postgresState = new PostgresStateCoordinator(databaseUrl)
    }
  }

  async initialize() {
    await mkdir(this.tasksRoot, { recursive: true })
    await mkdir(this.workspacesRoot, { recursive: true })
    await mkdir(this.runtimeRoot, { recursive: true })
    await mkdir(this.versionsRoot, { recursive: true })
    await mkdir(this.projectsRoot, { recursive: true })
    if (this.postgresState) {
      const state = await this.postgresState.load()
      for (const project of state.projects) this.projects.set(project.id, project)
      for (const task of state.tasks) {
        task.mode ??= 'general'
        task.skills ??= []
        task.tags ??= []
        task.queuedGuidance = (task.queuedGuidance ?? []).map((guidance) => ({ ...guidance, attachmentPaths: guidance.attachmentPaths ?? [] }))
        task.projectId ??= 'project_onevibe'
        task.references ??= []
        task.attachments ??= []
        this.tasks.set(task.id, task)
        this.events.set(task.id, state.events.get(task.id) ?? [])
        this.messages.set(task.id, state.messages.get(task.id) ?? [])
      }
      for (const task of this.tasks.values()) await this.hydratePostgresWorkspaceCache(task)
      for (const project of this.projects.values()) await this.hydratePostgresProjectCache(project)
      this.schedules = new Map(state.schedules.map((schedule) => [schedule.id, schedule]))
      this.postgresMessageRevisions = state.messageRevisions
      await this.reconcileRestartedTasks()
      this.initialized = true
      return
    }
    this.database = openDatabase(path.join(path.dirname(this.tasksRoot), 'onevibe.sqlite'))
    runMigrations(this.database)
    this.unitOfWork = new SqliteUnitOfWork(this.database)
    await this.importLegacyConversationState()
    try {
      const stored = JSON.parse(await readFile(this.projectsFile, 'utf8')) as Project[]
      for (const project of stored) this.projects.set(project.id, project)
    } catch { /* first local run */ }
    if (!this.projects.size) {
      const now = new Date().toISOString()
      this.projects.set('project_onevibe', { id: 'project_onevibe', name: 'ONEVibe product', context: 'Governed agent workspace powered by ONEComputer and OpenVTC. Keep approvals outside the browser and preserve evidence.', files: [], createdAt: now, updatedAt: now })
      await this.persistProjects()
    }
    try {
      const stored = JSON.parse(await readFile(this.schedulesFile, 'utf8')) as TaskSchedule[]
      for (const schedule of stored) this.schedules.set(schedule.id, schedule)
    } catch { /* first local run */ }
    await this.importLegacyEvents()
    const entries = await readdir(this.tasksRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const task = JSON.parse(await readFile(path.join(this.tasksRoot, entry.name, 'task.json'), 'utf8')) as Task
        task.mode ??= 'general'
        task.skills ??= []
        task.tags ??= []
        task.queuedGuidance ??= []
        task.queuedGuidance = task.queuedGuidance.map((guidance) => ({ ...guidance, attachmentPaths: guidance.attachmentPaths ?? [] }))
        task.projectId ??= 'project_onevibe'
        task.references ??= []
        task.attachments ??= []
        const storedEvents = this.readEventsFromDatabase(task.id)
        this.tasks.set(task.id, task)
        this.events.set(task.id, storedEvents)
        const storedMessages = this.readMessages(task)
        this.messages.set(task.id, storedMessages)
      } catch {
        // Ignore incomplete local-demo records. Production storage must fail closed.
      }
    }
    for (const [id, project] of this.projects) {
      project.files ??= []
      project.fileVersions ??= {}
      this.projects.set(id, project)
    }
    await this.reconcileRestartedTasks()
    this.initialized = true
  }

  async readiness() {
    if (!this.initialized) return { ready: false, driver: this.postgresState ? 'postgres' as const : 'sqlite' as const, detail: 'TaskStore is still initializing.' }
    if (this.postgresState) return { driver: 'postgres' as const, ...(await this.postgresState.readiness()) }
    return { ready: Boolean(this.database && this.unitOfWork), driver: 'sqlite' as const, detail: 'SQLite TaskStore is initialized.' }
  }

  async createTask(prompt: string, provider: Task['provider'], mode: TaskMode = 'general', projectId = 'project_onevibe', scheduleId?: string, references: string[] = [], attachments: TaskAttachment[] = [], skills: TaskSkill[] = [], ownerUserId?: string): Promise<Task> {
    this.getProject(projectId, ownerUserId)
    const now = new Date().toISOString()
    const id = `task_${randomUUID().replaceAll('-', '').slice(0, 14)}`
    const task: Task = {
      id,
      ...(ownerUserId ? { ownerUserId } : {}),
      title: prompt.length > 56 ? `${prompt.slice(0, 53).trim()}…` : prompt,
      prompt,
      provider,
      mode,
      skills,
      tags: [],
      queuedGuidance: [],
      projectId,
      scheduleId,
      references,
      attachments,
      status: 'pending',
      plan: planFor(mode, prompt),
      createdAt: now,
      updatedAt: now,
    }
    if (this.postgresState) {
      await this.postgresState.insertTask(task)
      this.tasks.set(id, task)
      this.events.set(id, [])
      this.messages.set(id, [])
      return task
    }
    this.tasks.set(id, task)
    this.events.set(id, [])
    this.messages.set(id, [])
    this.requireUnitOfWork().run((repositories) => repositories.conversations.insert({
      id, title: task.title, status: 'active', createdAt: now, updatedAt: now,
    }))
    await this.persist(task)
    return task
  }

  listTasks(ownerUserId?: string) {
    return [...this.tasks.values()].filter((task) => ownerUserId === undefined || task.ownerUserId === ownerUserId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  listConversations(options: { cursor?: string; limit?: number; projectId?: string; query?: string; ownerUserId?: string } = {}) {
    const limit = options.limit ?? 50
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Conversation page limit must be between 1 and 100')
    let after: { updatedAt: string; id: string } | undefined
    if (options.cursor) {
      try {
        const value = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8')) as Partial<{ v: number; updatedAt: string; id: string }>
        if (value.v !== 1 || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)) || typeof value.id !== 'string' || !value.id) throw new Error('invalid')
        after = { updatedAt: value.updatedAt, id: value.id }
      } catch {
        throw new RangeError('Conversation cursor is invalid')
      }
    }
    const query = options.query?.trim().toLocaleLowerCase()
    if (query && (query.length < 2 || query.length > 200)) throw new RangeError('Conversation search must be between 2 and 200 characters')
    const summaries = [...this.tasks.values()].filter((task) => {
      if (options.ownerUserId !== undefined && task.ownerUserId !== options.ownerUserId) return false
      if (options.projectId && task.projectId !== options.projectId) return false
      if (!query) return true
      return task.title.toLocaleLowerCase().includes(query) || (this.messages.get(task.id) ?? []).some((message) => message.content.toLocaleLowerCase().includes(query))
    }).map((task): ConversationSummary => {
      const messages = (this.messages.get(task.id) ?? []).filter((message) => message.role !== 'system')
      const last = messages.at(-1)
      const updatedAt = last && last.updatedAt > task.updatedAt ? last.updatedAt : task.updatedAt
      return {
        id: task.id, title: task.title, status: task.status, provider: task.provider, mode: task.mode, projectId: task.projectId,
        ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
        ...(task.forkedFromMessageId ? { forkedFromMessageId: task.forkedFromMessageId } : {}),
        messageCount: messages.length,
        ...(last ? { lastMessage: { role: last.role, preview: last.content.replace(/\s+/g, ' ').trim().slice(0, 180) || (last.status === 'cancelled' ? 'Run cancelled before a response.' : last.status === 'failed' ? 'Run failed before a response.' : 'Response pending…'), status: last.status, createdAt: last.createdAt } } : {}),
        createdAt: task.createdAt, updatedAt,
      }
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .filter((item) => !after || item.updatedAt < after.updatedAt || (item.updatedAt === after.updatedAt && item.id < after.id))
    const page = summaries.slice(0, limit)
    const tail = page.at(-1)
    return {
      conversations: page,
      ...(summaries.length > page.length && tail ? { nextCursor: Buffer.from(JSON.stringify({ v: 1, updatedAt: tail.updatedAt, id: tail.id })).toString('base64url') } : {}),
    }
  }

  async findActiveRuntimeLease(conversationId: string, ownerUserId?: string) {
    const task = this.getTask(conversationId, ownerUserId)
    if (this.postgresState) {
      if (!task.ownerUserId) throw new Error('Postgres runtime leases require an owner')
      return this.postgresState.findActiveRuntimeLease(conversationId, task.ownerUserId)
    }
    return this.requireUnitOfWork().run((repositories) => repositories.runtimeLeases.findActiveByConversation(conversationId))
  }

  async listRuntimeLeases(conversationId: string, ownerUserId?: string) {
    const task = this.getTask(conversationId, ownerUserId)
    if (this.postgresState) {
      if (!task.ownerUserId) throw new Error('Postgres runtime leases require an owner')
      return this.postgresState.listRuntimeLeases(conversationId, task.ownerUserId)
    }
    return this.requireUnitOfWork().run((repositories) => repositories.runtimeLeases.listByConversation(conversationId))
  }

  async insertRuntimeLease(record: RuntimeLeaseRecord, expectedPreviousGeneration: number, ownerUserId?: string) {
    const task = this.getTask(record.conversationId, ownerUserId)
    if (this.postgresState) {
      if (!task.ownerUserId) throw new Error('Postgres runtime leases require an owner')
      await this.postgresState.insertRuntimeLease(record, expectedPreviousGeneration, task.ownerUserId)
      return
    }
    this.requireUnitOfWork().run((repositories) => repositories.runtimeLeases.insert(record, expectedPreviousGeneration))
  }

  async transitionRuntimeLease(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord, ownerUserId?: string) {
    const task = this.getTask(next.conversationId, ownerUserId)
    if (this.postgresState) {
      if (!task.ownerUserId) throw new Error('Postgres runtime leases require an owner')
      await this.postgresState.transitionRuntimeLease(id, expected, next, task.ownerUserId)
      return
    }
    this.requireUnitOfWork().run((repositories) => repositories.runtimeLeases.transition(id, expected, next))
  }

  databaseHandle(): Database.Database {
    if (!this.database) throw new Error('TaskStore is not initialized')
    return this.database
  }

  authDatabaseHandle() {
    return this.postgresState ? this.postgresState.databaseHandle() : this.databaseHandle()
  }

  authDatabaseDriver(): 'sqlite' | 'postgres' { return this.postgresState ? 'postgres' : 'sqlite' }

  async close() {
    this.initialized = false
    if (this.postgresState) {
      await this.postgresState.close()
      return
    }
    this.database?.close()
    this.database = undefined
    this.unitOfWork = undefined
  }

  /** Refresh the process-local read projection from the Postgres source of truth. */
  async refreshPostgresState(ownerUserId?: string) {
    if (!this.postgresState) return
    const state = await this.postgresState.load(ownerUserId)
    for (const project of state.projects) this.projects.set(project.id, project)
    for (const task of state.tasks) {
      task.mode ??= 'general'
      task.skills ??= []
      task.tags ??= []
      task.queuedGuidance = (task.queuedGuidance ?? []).map((guidance) => ({ ...guidance, attachmentPaths: guidance.attachmentPaths ?? [] }))
      task.projectId ??= 'project_onevibe'
      task.references ??= []
      task.attachments ??= []
      this.tasks.set(task.id, task)
      this.events.set(task.id, state.events.get(task.id) ?? [])
      this.messages.set(task.id, state.messages.get(task.id) ?? [])
    }
    for (const schedule of state.schedules) this.schedules.set(schedule.id, schedule)
    for (const [messageId, revision] of state.messageRevisions) this.postgresMessageRevisions.set(messageId, revision)
  }

  async listMcpConfigs(ownerUserId?: string): Promise<RuntimeMcpConfig[]> {
    if (this.postgresState) {
      if (!ownerUserId) throw new Error('Postgres MCP config reads require an owner')
      const records = await this.postgresState.listMcpConfigs(ownerUserId)
      return records.map((record) => ({
        id: record.id, name: record.name, command: record.command,
        ...(record.ownerUserId ? { ownerUserId: record.ownerUserId } : {}),
        args: this.parseMcpArgs(record.argsJson), createdAt: record.createdAt, updatedAt: record.updatedAt,
      }))
    }
    return this.requireUnitOfWork().run((repositories) => repositories.mcpConfigs.list(ownerUserId).map((record) => {
      let args: unknown
      try { args = JSON.parse(record.argsJson) } catch { args = [] }
      return {
        id: record.id, name: record.name, command: record.command,
        ...(record.ownerUserId ? { ownerUserId: record.ownerUserId } : {}),
        args: Array.isArray(args) && args.every((arg) => typeof arg === 'string') ? args as string[] : [],
        createdAt: record.createdAt, updatedAt: record.updatedAt,
      }
    }))
  }

  async createMcpConfig(input: { name: string; command: string; args: string[] }, ownerUserId?: string): Promise<RuntimeMcpConfig> {
    const now = new Date().toISOString()
    const record = { id: `mcp_${randomUUID().replaceAll('-', '').slice(0, 20)}`, ownerUserId: ownerUserId ?? null, name: input.name, command: input.command, argsJson: JSON.stringify(input.args), createdAt: now, updatedAt: now }
    if (this.postgresState) {
      if (!ownerUserId) throw new Error('Postgres MCP config writes require an owner')
      await this.postgresState.createMcpConfig(record, ownerUserId)
      return { ...input, id: record.id, ownerUserId, createdAt: now, updatedAt: now }
    }
    this.requireUnitOfWork().run((repositories) => {
      repositories.mcpConfigs.insert(record)
      repositories.mcpConfigs.appendAudit({ id: `${record.id}:created`, configId: record.id, action: 'created', name: record.name, command: record.command, argsJson: record.argsJson, createdAt: now })
    })
    return { ...input, id: record.id, createdAt: now, updatedAt: now }
  }

  async deleteMcpConfig(id: string, ownerUserId?: string): Promise<boolean> {
    if (this.postgresState) {
      if (!ownerUserId) throw new Error('Postgres MCP config writes require an owner')
      return this.postgresState.deleteMcpConfig(id, ownerUserId)
    }
    return this.requireUnitOfWork().run((repositories) => {
      const current = repositories.mcpConfigs.findById(id)
      if (!current || (ownerUserId !== undefined && current.ownerUserId !== ownerUserId) || !repositories.mcpConfigs.delete(id, ownerUserId)) return false
      repositories.mcpConfigs.appendAudit({ id: `${id}:deleted:${randomUUID()}`, configId: id, action: 'deleted', name: current.name, command: current.command, argsJson: current.argsJson, createdAt: new Date().toISOString() })
      return true
    })
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    if (this.postgresState) return (await this.postgresState.listOrganizationsForUser(userId)).map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt }))
    return this.requireUnitOfWork().run((repositories) => repositories.organizations.listForUser(userId).map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt })))
  }

  listOrganizationsForImport(): Array<{ organization: Organization; members: OrganizationMember[] }> {
    return this.requireUnitOfWork().run((repositories) => repositories.organizations.listAll().map((organization) => ({
      organization: { id: organization.id, name: organization.name, createdAt: organization.createdAt, updatedAt: organization.updatedAt },
      members: repositories.organizations.listMembers(organization.id).map((member) => ({ organizationId: member.organizationId, userId: member.userId, role: member.role, createdAt: member.createdAt })),
    })))
  }

  async createOrganization(name: string, ownerUserId: string): Promise<Organization> {
    if (!ownerUserId) throw new Error('Organization owner is required')
    const now = new Date().toISOString()
    const organization = { id: `org_${randomUUID().replaceAll('-', '').slice(0, 16)}`, name, createdAt: now, updatedAt: now }
    if (this.postgresState) {
      await this.postgresState.createOrganization(organization, ownerUserId)
      return organization
    }
    this.requireUnitOfWork().run((repositories) => {
      repositories.organizations.insertOrganization(organization)
      repositories.organizations.insertMember({ organizationId: organization.id, userId: ownerUserId, role: 'owner', createdAt: now })
    })
    return organization
  }

  async listOrganizationMembers(organizationId: string, userId: string): Promise<OrganizationMember[]> {
    if (this.postgresState) return (await this.postgresState.listOrganizationMembers(organizationId, userId)).map((row) => ({ organizationId: row.organizationId, userId: row.userId, role: row.role, createdAt: row.createdAt }))
    return this.requireUnitOfWork().run((repositories) => {
      if (!repositories.organizations.findMember(organizationId, userId)) throw new Error('Organization not found')
      return repositories.organizations.listMembers(organizationId).map((row) => ({ organizationId: row.organizationId, userId: row.userId, role: row.role, createdAt: row.createdAt }))
    })
  }

  async addOrganizationMember(organizationId: string, userId: string, actorUserId: string): Promise<OrganizationMember> {
    if (!userId) throw new Error('Organization member user is required')
    const member = { organizationId, userId, role: 'member' as const, createdAt: new Date().toISOString() }
    if (this.postgresState) return this.postgresState.addOrganizationMember(organizationId, userId, actorUserId)
    return this.requireUnitOfWork().run((repositories) => {
      const organization = repositories.organizations.findById(organizationId)
      const actor = repositories.organizations.findMember(organizationId, actorUserId)
      if (!organization) throw new Error('Organization not found')
      if (actor?.role !== 'owner') throw new Error('Organization owner access required')
      if (!repositories.organizations.userExists(userId)) throw new Error('User not found')
      try { repositories.organizations.insertMember(member) } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed: organization_members/.test(error.message)) throw new Error('Organization member already exists')
        throw error
      }
      return member
    })
  }

  async removeOrganizationMember(organizationId: string, userId: string, actorUserId: string): Promise<{ organizationId: string; userId: string; removed: true }> {
    if (this.postgresState) return this.postgresState.removeOrganizationMember(organizationId, userId, actorUserId)
    return this.requireUnitOfWork().run((repositories) => {
      const organization = repositories.organizations.findById(organizationId)
      const actor = repositories.organizations.findMember(organizationId, actorUserId)
      if (!organization) throw new Error('Organization not found')
      if (actor?.role !== 'owner') throw new Error('Organization owner access required')
      if (userId === actorUserId) throw new Error('Organization owner cannot remove themselves')
      if (!repositories.organizations.deleteMember(organizationId, userId)) throw new Error('Organization member not found')
      return { organizationId, userId, removed: true as const }
    })
  }

  async listTenantThemes(ownerUserId: string): Promise<TenantThemeConfigRecord[]> {
    if (!this.postgresState) return []
    if (!ownerUserId) throw new Error('Tenant theme reads require an owner')
    return this.postgresState.listTenantThemesForUser(ownerUserId)
  }

  async summarizeTenantThemeAudit(ownerUserId: string): Promise<import('./persistence/contracts.js').TenantThemeAuditSummary> {
    if (!this.postgresState) return { tenantCount: 0, eventCount: 0, latestOperation: null, latestAt: null }
    if (!ownerUserId) throw new Error('Tenant theme diagnostics require an owner')
    return this.postgresState.summarizeTenantThemeAuditForUser(ownerUserId)
  }

  async getTenantTheme(tenantId: string, ownerUserId: string): Promise<TenantThemeConfigRecord> {
    if (!this.postgresState) throw new Error('Tenant theme persistence requires Postgres')
    if (!ownerUserId) throw new Error('Tenant theme reads require an owner')
    return this.postgresState.getTenantTheme(tenantId, ownerUserId)
  }

  async putTenantTheme(tenantId: string, organizationId: string | undefined, configJson: string, ownerUserId: string, expectedVersion: number): Promise<TenantThemeConfigRecord> {
    if (!this.postgresState) throw new Error('Tenant theme persistence requires Postgres')
    if (!ownerUserId) throw new Error('Tenant theme writes require an owner')
    return this.postgresState.putTenantTheme(tenantId, organizationId, configJson, ownerUserId, expectedVersion)
  }

  async resetTenantTheme(tenantId: string, baseConfigJson: string, ownerUserId: string, expectedVersion: number): Promise<TenantThemeConfigRecord> {
    if (!this.postgresState) throw new Error('Tenant theme persistence requires Postgres')
    if (!ownerUserId) throw new Error('Tenant theme writes require an owner')
    return this.postgresState.resetTenantTheme(tenantId, baseConfigJson, ownerUserId, expectedVersion)
  }

  async runtimeMcpConfigs(ownerUserId?: string): Promise<McpConfig[]> {
    return (await this.listMcpConfigs(ownerUserId)).map((config) => ({ ...config, env: {} }))
  }

  async listSkillInstallationRecords(ownerUserId?: string): Promise<SkillInstallationRecord[]> {
    if (this.postgresState) {
      if (!ownerUserId) throw new Error('Postgres skill reads require an owner')
      return this.postgresState.listSkillInstallations(ownerUserId)
    }
    return this.requireUnitOfWork().run((repositories) => repositories.skillInstallations.list(ownerUserId))
  }

  async listSkillInstallations(ownerUserId?: string): Promise<SkillInstallation[]> {
    return (await this.listSkillInstallationRecords(ownerUserId)).map(({ id, version, title, summary, sha256, contentUrl }) => ({
      id, version, title, summary, sha256, contentUrl, source: 'marketplace' as const, installed: true,
    }))
  }

  async installSkillInstallation(input: Omit<SkillInstallationRecord, 'ownerUserId' | 'createdAt' | 'updatedAt'>, ownerUserId?: string): Promise<SkillInstallation> {
    const now = new Date().toISOString()
    const record: SkillInstallationRecord = { ...input, ownerUserId: ownerUserId ?? null, createdAt: now, updatedAt: now }
    if (this.postgresState) {
      if (!ownerUserId) throw new Error('Postgres skill writes require an owner')
      await this.postgresState.installSkillInstallation(record, ownerUserId)
      return { id: record.id, version: record.version, title: record.title, summary: record.summary, sha256: record.sha256, contentUrl: record.contentUrl, source: 'marketplace', installed: true }
    }
    this.requireUnitOfWork().run((repositories) => repositories.skillInstallations.insert(record))
    return { id: record.id, version: record.version, title: record.title, summary: record.summary, sha256: record.sha256, contentUrl: record.contentUrl, source: 'marketplace', installed: true }
  }

  async removeSkillInstallation(id: string, ownerUserId?: string): Promise<boolean> {
    if (this.listTasks(ownerUserId).some((task) => ['pending', 'running', 'waiting_for_approval', 'waiting_for_user_input'].includes(task.status) && task.skills.includes(id))) {
      throw new Error('Skill cannot be removed while an active task depends on it')
    }
    if (this.postgresState) {
      if (!ownerUserId) throw new Error('Postgres skill writes require an owner')
      return this.postgresState.removeSkillInstallation(id, ownerUserId)
    }
    return this.requireUnitOfWork().run((repositories) => repositories.skillInstallations.delete(id, ownerUserId))
  }

  private parseMcpArgs(argsJson: string): string[] {
    try {
      const args = JSON.parse(argsJson) as unknown
      return Array.isArray(args) && args.every((arg) => typeof arg === 'string') ? args : []
    } catch { return [] }
  }

  async listLibrary(ownerUserId?: string) {
    const completed = this.listTasks(ownerUserId).filter((task) => task.status === 'completed' && !task.libraryHiddenAt)
    return Promise.all(completed.map(async (task) => ({
      task,
      files: (await this.listWorkspaceFiles(task.id)).filter((file) => !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/') && !isInternalWorkspacePath(file.path)),
    })))
  }

  async hideLibraryItem(taskId: string, ownerUserId?: string) {
    const task = this.getTask(taskId, ownerUserId)
    if (task.status !== 'completed') throw new Error('Only completed tasks can be removed from the Library')
    if (task.libraryHiddenAt) return task
    const hiddenAt = new Date().toISOString()
    await this.updateTask(taskId, { libraryHiddenAt: hiddenAt })
    await this.appendEvent(taskId, {
      type: 'activity_delta', lane: 'control', label: 'Library item hidden',
      content: 'The artifact was removed from the Library view. The originating conversation, workspace, and evidence remain available.',
      payload: { libraryHiddenAt: hiddenAt, reversibleBy: 'server_task_metadata', destructiveDelete: false },
    })
    return this.getTask(taskId)
  }

  listProjects(ownerUserId?: string) { return [...this.projects.values()].filter((project) => ownerUserId === undefined || project.ownerUserId === ownerUserId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }

  getProject(id: string, ownerUserId?: string) {
    const project = this.projects.get(id)
    if (!project || (ownerUserId !== undefined && project.ownerUserId !== ownerUserId)) throw new Error('Project not found')
    return project
  }

  async createProject(name: string, context = '', ownerUserId?: string): Promise<Project> {
    const now = new Date().toISOString()
    const project = { id: `project_${randomUUID().replaceAll('-', '').slice(0, 12)}`, ...(ownerUserId ? { ownerUserId } : {}), name, context, files: [], createdAt: now, updatedAt: now }
    if (this.postgresState) {
      await this.postgresState.insertProject(project)
      this.projects.set(project.id, project)
      return project
    }
    this.projects.set(project.id, project)
    await this.persistProjects()
    return project
  }

  async updateProjectContext(projectId: string, context: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const updated = { ...project, context, updatedAt: new Date().toISOString() }
    if (this.postgresState) {
      await this.postgresState.updateProject(updated, project.updatedAt)
      this.projects.set(projectId, updated)
      return updated
    }
    this.projects.set(projectId, updated)
    await this.persistProjects()
    return updated
  }

  async addProjectFile(projectId: string, input: { name: string; mimeType: string; bytes: Buffer }, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    if (project.files.length >= 12) throw new Error('A project can contain at most 12 knowledge files')
    const name = path.basename(input.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    if (!name || name === '.' || name === '..') throw new Error('Invalid project file name')
    const duplicate = project.files.some((file) => file.name === name)
    if (duplicate) throw new Error('A project file with that name already exists')
    const relativePath = `knowledge/${String(project.files.length + 1).padStart(2, '0')}-${name}`
    const target = path.join(this.projectsRoot, projectId, relativePath)
    assertWithin(path.join(this.projectsRoot, projectId), target)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, input.bytes)
    const file = { name, path: relativePath, size: input.bytes.byteLength, mimeType: input.mimeType, createdAt: new Date().toISOString() }
    const updated = { ...project, files: [...project.files, file], updatedAt: new Date().toISOString() }
    if (this.postgresState) {
      if (!project.ownerUserId) throw new Error('Postgres project files require an owner')
      await this.postgresState.putProjectFileAndMetadata(project, project.updatedAt, relativePath, input.bytes, createHash('sha256').update(input.bytes).digest('hex'), updated)
      this.projects.set(projectId, updated)
      return updated
    }
    this.projects.set(projectId, updated)
    await this.persistProjects()
    return updated
  }

  async removeProjectFile(projectId: string, filePath: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const file = project.files.find((candidate) => candidate.path === filePath)
    if (!file) throw new Error('Project knowledge file not found')
    const root = path.join(this.projectsRoot, projectId)
    const target = path.join(root, file.path)
    assertWithin(root, target)
    await rm(target, { force: true })
    await rm(path.dirname(projectVersionPath(root, file.path, 'placeholder')), { recursive: true, force: true })
    const fileVersions = { ...(project.fileVersions ?? {}) }
    delete fileVersions[file.path]
    const updated = { ...project, files: project.files.filter((candidate) => candidate.path !== file.path), fileVersions, updatedAt: new Date().toISOString() }
    if (this.postgresState) {
      if (!project.ownerUserId) throw new Error('Postgres project files require an owner')
      await this.postgresState.deleteProjectFileAndMetadata(project, project.updatedAt, file.path, updated)
      this.projects.set(projectId, updated)
      return updated
    }
    this.projects.set(projectId, updated)
    await this.persistProjects()
    return updated
  }

  async readProjectFile(projectId: string, filePath: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const file = project.files.find((candidate) => candidate.path === filePath)
    if (!file) throw new Error('Project knowledge file not found')
    if (!isEditableProjectFile(file)) throw new Error('Only text-like project knowledge files can be edited')
    const stored = await this.readProjectFileBytes(projectId, filePath, ownerUserId)
    return { path: file.path, content: stored.content.toString('utf8'), contentHash: stored.contentHash }
  }

  async readProjectFileBytes(projectId: string, filePath: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const file = project.files.find((candidate) => candidate.path === filePath)
    if (!file) throw new Error('Project knowledge file not found')
    if (this.postgresState) {
      if (!project.ownerUserId) throw new Error('Postgres project files require an owner')
      const stored = await this.postgresState.readProjectFile(project, project.ownerUserId, file.path)
      return { path: file.path, content: stored.content, size: stored.size, mimeType: file.mimeType, contentHash: stored.sha256 }
    }
    const root = path.join(this.projectsRoot, projectId)
    const target = path.join(root, file.path)
    assertWithin(root, target)
    const content = await readFile(target)
    return { path: file.path, content, size: content.byteLength, mimeType: file.mimeType, contentHash: createHash('sha256').update(content).digest('hex') }
  }

  async updateProjectFile(projectId: string, filePath: string, content: string, expectedHash: string, ownerUserId?: string) {
    const current = await this.readProjectFile(projectId, filePath, ownerUserId)
    if (current.contentHash !== expectedHash) throw new Error('Project knowledge changed; reload before saving')
    const project = this.getProject(projectId, ownerUserId)
    const file = project.files.find((candidate) => candidate.path === filePath)
    if (!file) throw new Error('Project knowledge file not found')
    const root = path.join(this.projectsRoot, projectId)
    const target = path.join(root, filePath)
    assertWithin(root, target)
    const versionId = `rev_${randomUUID().replaceAll('-', '').slice(0, 14)}`
    const versionTarget = projectVersionPath(root, filePath, versionId)
    assertWithin(root, versionTarget)
    await mkdir(path.dirname(versionTarget), { recursive: true })
    await writeFile(versionTarget, current.content, 'utf8')
    await writeFile(target, content, 'utf8')
    const updatedAt = new Date().toISOString()
    const version = { id: versionId, path: filePath, createdAt: updatedAt, size: Buffer.byteLength(current.content), contentHash: current.contentHash }
    const previousVersions = project.fileVersions?.[filePath] ?? []
    const retainedVersions = [version, ...previousVersions].slice(0, 10)
    await Promise.all(previousVersions.slice(9).map((old) => rm(projectVersionPath(root, filePath, old.id), { force: true })))
    const updated = { ...project, files: project.files.map((candidate) => candidate.path === filePath ? { ...candidate, size: Buffer.byteLength(content) } : candidate), fileVersions: { ...(project.fileVersions ?? {}), [filePath]: retainedVersions }, updatedAt }
    if (this.postgresState) {
      if (!project.ownerUserId) throw new Error('Postgres project files require an owner')
      await this.postgresState.updateProjectFileAndMetadata(project, project.updatedAt, filePath, Buffer.from(content, 'utf8'), createHash('sha256').update(content).digest('hex'), updated)
      this.projects.set(projectId, updated)
      return { project: updated, path: filePath, content, contentHash: createHash('sha256').update(content).digest('hex') }
    }
    this.projects.set(projectId, updated)
    await this.persistProjects()
    return { project: updated, path: filePath, content, contentHash: createHash('sha256').update(content).digest('hex') }
  }

  listProjectFileVersions(projectId: string, filePath: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const file = project.files.find((candidate) => candidate.path === filePath)
    if (!file) throw new Error('Project knowledge file not found')
    if (!isEditableProjectFile(file)) throw new Error('Only text-like project knowledge files have revisions')
    return project.fileVersions?.[filePath] ?? []
  }

  async restoreProjectFileVersion(projectId: string, filePath: string, versionId: string, expectedHash: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const version = this.listProjectFileVersions(projectId, filePath, ownerUserId).find((candidate) => candidate.id === versionId)
    if (!version) throw new Error('Project knowledge revision not found')
    if (this.postgresState) {
      if (!project.ownerUserId) throw new Error('Postgres project files require an owner')
      const stored = await this.postgresState.readProjectFileVersion(project, project.ownerUserId, filePath, version.id)
      return this.updateProjectFile(projectId, filePath, stored.content.toString('utf8'), expectedHash, ownerUserId)
    }
    const root = path.join(this.projectsRoot, project.id)
    const source = projectVersionPath(root, filePath, version.id)
    assertWithin(root, source)
    const content = await readFile(source, 'utf8')
    return this.updateProjectFile(projectId, filePath, content, expectedHash, ownerUserId)
  }

  async readProjectFileVersionBytes(projectId: string, filePath: string, versionId: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const version = this.listProjectFileVersions(projectId, filePath, ownerUserId).find((candidate) => candidate.id === versionId)
    if (!version) throw new Error('Project knowledge revision not found')
    if (this.postgresState) {
      if (!project.ownerUserId) throw new Error('Postgres project files require an owner')
      const stored = await this.postgresState.readProjectFileVersion(project, project.ownerUserId, filePath, versionId)
      return { ...stored, contentHash: stored.sha256 }
    }
    const root = path.join(this.projectsRoot, project.id)
    const source = projectVersionPath(root, filePath, version.id)
    assertWithin(root, source)
    const content = await readFile(source)
    return { path: filePath, content, size: content.byteLength, sha256: createHash('sha256').update(content).digest('hex'), contentHash: createHash('sha256').update(content).digest('hex') }
  }

  async projectContextFiles(projectId: string, ownerUserId?: string) {
    const project = this.getProject(projectId, ownerUserId)
    const chunks: string[] = []
    let remaining = 12_000
    for (const file of project.files) {
      if (remaining <= 0 || !/^(?:text\/|application\/(?:json|yaml|xml))/.test(file.mimeType) && !/\.(?:md|txt|json|ya?ml|csv|xml)$/i.test(file.name)) continue
      const target = path.join(this.projectsRoot, project.id, file.path)
      assertWithin(path.join(this.projectsRoot, project.id), target)
      const raw = this.postgresState && project.ownerUserId
        ? (await this.postgresState.readProjectFile(project, project.ownerUserId, file.path).catch(() => undefined))?.content.toString('utf8') ?? ''
        : await readFile(target, 'utf8').catch(() => '')
      const content = raw.slice(0, Math.min(4_000, remaining))
      if (!content) continue
      chunks.push(`--- ${file.name} (untrusted project knowledge) ---\n${content}`)
      remaining -= content.length
    }
    return chunks
  }

  listSchedules(ownerUserId?: string) { return [...this.schedules.values()].filter((schedule) => ownerUserId === undefined || schedule.ownerUserId === ownerUserId).sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)) }

  async createSchedule(input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>, ownerUserId?: string): Promise<TaskSchedule> {
    this.getProject(input.projectId, ownerUserId)
    const now = new Date().toISOString()
    const schedule: TaskSchedule = { id: `schedule_${randomUUID().replaceAll('-', '').slice(0, 12)}`, ...(ownerUserId ? { ownerUserId } : {}), ...input, enabled: true, nextRunAt: new Date(Date.now() + input.intervalMinutes * 60_000).toISOString(), createdAt: now, updatedAt: now }
    if (this.postgresState) {
      await this.postgresState.insertSchedule(schedule)
      this.schedules.set(schedule.id, schedule)
      return schedule
    }
    this.schedules.set(schedule.id, schedule)
    await this.persistSchedules()
    return schedule
  }

  async setScheduleEnabled(id: string, enabled: boolean, ownerUserId?: string) {
    const current = this.schedules.get(id)
    if (!current || (ownerUserId !== undefined && current.ownerUserId !== ownerUserId)) throw new Error('Schedule not found')
    const updated = { ...current, enabled, updatedAt: new Date().toISOString(), ...(enabled && current.nextRunAt < new Date().toISOString() ? { nextRunAt: new Date().toISOString() } : {}) }
    if (this.postgresState) {
      await this.postgresState.updateSchedule(updated, current.updatedAt)
      this.schedules.set(id, updated)
      return updated
    }
    this.schedules.set(id, updated)
    await this.persistSchedules()
    return updated
  }

  async deleteSchedule(id: string, ownerUserId?: string) {
    const current = this.schedules.get(id)
    if (!current || (ownerUserId !== undefined && current.ownerUserId !== ownerUserId)) throw new Error('Schedule not found')
    if (this.postgresState) {
      await this.postgresState.deleteSchedule(id, current.ownerUserId!)
      this.schedules.delete(id)
      return { id, deleted: true as const }
    }
    this.schedules.delete(id)
    await this.persistSchedules()
    return { id, deleted: true as const }
  }

  async claimScheduleNow(id: string, now = new Date(), ownerUserId?: string) {
    const schedule = this.schedules.get(id)
    if (!schedule || (ownerUserId !== undefined && schedule.ownerUserId !== ownerUserId)) throw new Error('Schedule not found')
    if (!schedule.enabled) throw new Error('Schedule is paused')
    const updated = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: new Date(now.getTime() + schedule.intervalMinutes * 60_000).toISOString(), updatedAt: now.toISOString() }
    if (this.postgresState) {
      await this.postgresState.updateSchedule(updated, schedule.updatedAt)
      this.schedules.set(id, updated)
      return updated
    }
    this.schedules.set(id, updated)
    await this.persistSchedules()
    return updated
  }

  async claimDueSchedules(now = new Date()) {
    const due = this.listSchedules().filter((schedule) => schedule.enabled && schedule.nextRunAt <= now.toISOString())
    for (const schedule of due) {
      const updated = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: new Date(now.getTime() + schedule.intervalMinutes * 60_000).toISOString(), updatedAt: now.toISOString() }
      if (this.postgresState) {
        await this.postgresState.updateSchedule(updated, schedule.updatedAt)
        this.schedules.set(schedule.id, updated)
        continue
      }
      this.schedules.set(schedule.id, updated)
    }
    if (due.length && !this.postgresState) await this.persistSchedules()
    return due
  }

  getTask(id: string, ownerUserId?: string) {
    const task = this.tasks.get(id)
    if (!task || (ownerUserId !== undefined && task.ownerUserId !== ownerUserId)) throw new Error('Task not found')
    return task
  }

  assertTaskOwner(id: string, ownerUserId: string) {
    return this.getTask(id, ownerUserId)
  }

  findTaskByApproval(approvalId: string, ownerUserId?: string) {
    const task = this.listTasks(ownerUserId).find((candidate) => candidate.approval?.id === approvalId)
    if (!task) throw new Error('Approval not found')
    return task
  }

  findTaskByShare(shareId: string) {
    const task = [...this.tasks.values()].find((candidate) => candidate.share?.id === shareId)
    if (!task) throw new Error('Share not found')
    return task
  }

  async reconcileExpiredApprovals(ownerUserId?: string, now = Date.now()) {
    const expired: string[] = []
    for (const candidate of this.listTasks(ownerUserId)) {
      const approval = candidate.approval
      if (!approval || approval.state !== 'pending' || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) > now) continue
      // Re-read after prior awaits so concurrent review requests cannot append
      // duplicate expiry evidence for the same approval.
      const task = this.getTask(candidate.id)
      const current = task.approval
      if (!current || current.state !== 'pending' || current.id !== approval.id || Date.parse(current.expiresAt) > now) continue
      await this.updateTask(task.id, { approval: { ...current, state: 'expired' } })
      await this.appendEvent(task.id, {
        type: 'approval_resolved', lane: 'approval', status: task.status, label: 'External wallet request expired',
        content: `The ${current.action.replaceAll('_', ' ')} approval window closed without a wallet decision.`,
        payload: { approvalId: current.id, action: current.action, state: 'expired', intentHash: current.intentHash, evidenceHash: current.evidenceHash, authority: 'server_expiry_reconciliation', walletDecision: false },
      })
      expired.push(task.id)
    }
    return expired
  }

  async updateTask(id: string, patch: Partial<Task>) {
    const current = this.getTask(id)
    const updated = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() }
    if (this.postgresState) {
      await this.postgresState.updateTask(updated, current.updatedAt)
      this.tasks.set(id, updated)
      return updated
    }
    this.tasks.set(id, updated)
    await this.persist(updated)
    return updated
  }

  async moveTaskToProject(taskId: string, projectId: string, ownerUserId?: string) {
    const task = this.getTask(taskId, ownerUserId)
    const destination = this.getProject(projectId, ownerUserId)
    if (task.projectId === destination.id) return task
    const origin = this.getProject(task.projectId, ownerUserId)
    await this.updateTask(taskId, { projectId: destination.id })
    await this.appendEvent(taskId, {
      type: 'activity_delta', lane: 'control', label: 'Task moved to project',
      content: `Moved from ${origin.name} to ${destination.name}. Future continuations use the destination project context.`,
      payload: { fromProjectId: origin.id, fromProjectName: origin.name, toProjectId: destination.id, toProjectName: destination.name, continuationContextChanged: true },
    })
    return this.getTask(taskId)
  }

  async updateTaskTags(taskId: string, tags: string[], ownerUserId?: string) {
    const task = this.getTask(taskId, ownerUserId)
    const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase()))]
    if (normalized.length > 8 || normalized.some((tag) => !/^[a-z0-9][a-z0-9-]{0,31}$/.test(tag))) throw new Error('Task tags must be 1–32 lowercase letters, numbers, or hyphens')
    if (normalized.join('|') === task.tags.join('|')) return task
    await this.updateTask(taskId, { tags: normalized })
    await this.appendEvent(taskId, {
      type: 'activity_delta', lane: 'control', label: 'Task tags updated',
      content: `${normalized.length} reusable library tag${normalized.length === 1 ? '' : 's'} recorded.`, payload: { tags: normalized },
    })
    return this.getTask(taskId)
  }

  async queueGuidance(taskId: string, prompt: string, attachmentPaths: string[] = [], guidanceId?: string, operationId?: string, operationKey?: string) {
    const task = this.getTask(taskId)
    const existingGuidance = guidanceId ? task.queuedGuidance.find((candidate) => candidate.id === guidanceId) : undefined
    if (existingGuidance) {
      if (existingGuidance.prompt !== prompt || existingGuidance.attachmentPaths.join('|') !== attachmentPaths.join('|')) throw new OptimisticConflictError(`Guidance ${guidanceId} conflicts with the existing queued request`)
      return existingGuidance
    }
    if (task.queuedGuidance.length >= 8) throw new Error('Task already has the maximum of 8 queued guidance messages')
    const guidance = { id: guidanceId ?? `guidance_${randomUUID().replaceAll('-', '').slice(0, 12)}`, prompt, attachmentPaths, ...(operationId ? { operationId } : {}), ...(operationKey ? { operationKey } : {}), createdAt: new Date().toISOString() }
    await this.updateTask(taskId, { queuedGuidance: [...task.queuedGuidance, guidance] })
    await this.appendEvent(taskId, {
      type: 'guidance_queued', lane: 'control', label: 'Guidance queued for next turn',
      content: 'The current provider turn is non-interruptible; this guidance will resume the same task immediately after it reaches a terminal state.',
      payload: { guidanceId: guidance.id, promptLength: prompt.length, attachmentCount: attachmentPaths.length, appliesAfterRun: task.activeRunId, ...(operationId ? { operationId } : {}) },
    })
    return guidance
  }

  async takeQueuedGuidance(taskId: string) {
    const task = this.getTask(taskId)
    const [guidance, ...remaining] = task.queuedGuidance
    if (!guidance) return undefined
    await this.updateTask(taskId, { queuedGuidance: remaining })
    return guidance
  }

  async cancelQueuedGuidance(taskId: string, guidanceId: string) {
    const task = this.getTask(taskId)
    const guidance = task.queuedGuidance.find((candidate) => candidate.id === guidanceId)
    if (!guidance) throw new Error('Queued guidance not found')
    await Promise.all(guidance.attachmentPaths.map((filePath) => rm(this.workspacePath(taskId, filePath), { force: true })))
    await this.updateTask(taskId, { queuedGuidance: task.queuedGuidance.filter((candidate) => candidate.id !== guidanceId), attachments: task.attachments.filter((attachment) => !guidance.attachmentPaths.includes(attachment.path)) })
    await this.appendEvent(taskId, {
      type: 'guidance_cancelled', lane: 'control', label: 'Queued guidance cancelled',
      content: 'A queued follow-up was removed before it was sent to the provider.',
      payload: { guidanceId, promptLength: guidance.prompt.length, removedAttachmentCount: guidance.attachmentPaths.length, appliesAfterRun: task.activeRunId },
    })
    return this.getTask(taskId)
  }

  async setPlanStep(taskId: string, stepId: string, status: Task['plan'][number]['status']) {
    const task = this.getTask(taskId)
    const current = task.plan.find((step) => step.id === stepId)
    if (!current) throw new Error('Plan step not found')
    if (current.status === status) return task
    const now = new Date().toISOString()
    const step = {
      ...current,
      status,
      startedAt: status === 'running' ? current.startedAt ?? now : current.startedAt,
      completedAt: status === 'completed' || status === 'blocked' ? now : current.completedAt,
    }
    const updated = await this.updateTask(taskId, { plan: task.plan.map((candidate) => candidate.id === stepId ? step : candidate) })
    await this.appendEvent(taskId, {
      type: 'activity_delta', lane: 'control', label: `Plan step ${status}`,
      content: step.title, payload: { stepId, status, startedAt: step.startedAt, completedAt: step.completedAt },
    })
    return updated
  }

  async updateRuntimePlanTitles(taskId: string, proposed: unknown, source: 'claude_sdk' | 'onecomputer' = 'claude_sdk') {
    const titles = normalizeRuntimePlanTitles(proposed)
    if (!titles) throw new Error('Runtime plan must include the five canonical ordered stages with concise titles')
    const task = this.getTask(taskId)
    const titleById = new Map(titles.map((step) => [step.id, step.title]))
    const plan = task.plan.map((step) => ({ ...step, title: titleById.get(step.id as RuntimePlanTitle['id']) ?? step.title }))
    if (plan.every((step, index) => step.title === task.plan[index]?.title)) return task
    const updated = await this.updateTask(taskId, { plan })
    await this.appendEvent(taskId, {
      type: 'activity_delta', lane: 'control', label: 'Task plan refined by runtime',
      content: 'The runtime refined the human-readable plan titles while preserving the ordered, durable execution stages.',
      payload: { source, stages: titles },
    })
    return updated
  }

  async appendEvent(taskId: string, input: EventInput) {
    const runId = this.getTask(taskId).activeRunId
    if (this.postgresState) {
      const presentation = panelFor(input)
      const projectedInput = { ...input, payload: { ...input.payload, ...(presentation ? { presentation } : {}) } }
      const event = await this.postgresState.appendEvent(this.getTask(taskId), { ...projectedInput, runId, createdAt: new Date() })
      this.events.set(taskId, [...(this.events.get(taskId) ?? []).filter((candidate) => candidate.id !== event.id), event].sort((a, b) => a.sequence - b.sequence))
      if (input.type === 'assistant_text_delta' && input.content) await this.appendAssistantDelta(taskId, input.content)
      if (input.type === 'run_completed') await this.finishTurn(taskId, 'completed')
      if (input.type === 'run_failed') await this.finishTurn(taskId, 'failed')
      if (input.type === 'run_cancelled') await this.finishTurn(taskId, 'cancelled')
      this.emitter.emit(taskId, event)
      return event
    }
    let event: RuntimeEvent | undefined
    for (let attempt = 0; attempt < 4 && !event; attempt += 1) {
      try {
        event = this.requireUnitOfWork().run((repositories) => {
          const presentation = panelFor(input)
          const record = runtimeEventRecordFor(repositories, taskId, runId, {
            ...input,
            payload: { ...input.payload, ...(presentation ? { presentation } : {}) },
          })
          repositories.runtimeEvents.append(record)
          return this.runtimeEventFromRecord(record)
        })
      } catch (error) {
        if (!(error instanceof OptimisticConflictError) || attempt === 3) throw error
      }
    }
    if (!event) throw new Error('Runtime event append did not produce an event')
    this.events.set(taskId, this.readEventsFromDatabase(taskId))
    if (input.type === 'assistant_text_delta' && input.content) await this.appendAssistantDelta(taskId, input.content)
    if (input.type === 'run_completed') await this.finishTurn(taskId, 'completed')
    if (input.type === 'run_failed') await this.finishTurn(taskId, 'failed')
    if (input.type === 'run_cancelled') await this.finishTurn(taskId, 'cancelled')
    this.emitter.emit(taskId, event)
    return event
  }

  /**
   * Persist a provider-native envelope and all of its typed projections in
   * one SQLite transaction. Replaying the same source cursor is a no-op.
   */
  async ingestNativeEvent(taskId: string, input: NativeEventInput) {
    const task = this.getTask(taskId)
    const runId = task.activeRunId
    if (!runId) throw new Error('Native events require an active durable turn')
    const normalized = normalizeNativeEvent(input)
    if (this.postgresState) {
      const nativeEventId = nativeEventIdFor(taskId, runId, normalized)
      const existing = this.events.get(taskId) ?? []
      const projected: Array<{
        runtimeEventId: string
        projectionIndex: number
        projectorVersion: number
        projectedAt: Date
        runId?: string
        sequence: number
        type: EventInput['type']
        lane: EventInput['lane']
        status?: EventInput['status']
        label?: string
        content?: string
        payload: Record<string, unknown>
        previousHash: string
        eventHash: string
        createdAt: Date
      }> = []
      for (const [projectionIndex, projection] of normalized.projections.entries()) {
        const presentation = panelFor(projection)
        const derived = runtimeEventInputFor([...existing, ...projected.map((item) => ({ id: item.runtimeEventId, taskId, runId: item.runId, sequence: item.sequence, type: item.type, lane: item.lane, status: item.status, label: item.label, content: item.content, payload: item.payload, createdAt: item.createdAt.toISOString(), previousHash: item.previousHash, eventHash: item.eventHash }))], taskId, runId, {
          ...projection,
          payload: {
            ...projection.payload,
            ...(presentation ? { presentation } : {}),
            nativeEventId,
            nativeSource: normalized.source,
            nativeType: normalized.nativeType,
            nativeSourceEventId: normalized.sourceEventId,
          },
        })
        projected.push({
          runtimeEventId: derived.id, projectionIndex, projectorVersion: NATIVE_PROJECTOR_VERSION,
          projectedAt: new Date(), runId: derived.runId, sequence: derived.sequence, type: derived.type, lane: derived.lane,
          status: derived.status, label: derived.label, content: derived.content, payload: derived.payload,
          previousHash: derived.previousHash, eventHash: derived.eventHash, createdAt: new Date(derived.createdAt),
        })
      }
      const nativeRecord: NativeEventRecord = {
        id: nativeEventId, conversationId: taskId, runId, source: normalized.source,
        sourceEventId: normalized.sourceEventId, sourceSequence: normalized.sourceSequence,
        nativeType: normalized.nativeType, payloadJson: normalized.payloadJson, payloadHash: normalized.payloadHash,
        receivedAt: new Date().toISOString(),
      }
      const offset = projected.length ? { conversationId: taskId, runId, source: normalized.source, projectorVersion: NATIVE_PROJECTOR_VERSION, lastSourceSequence: normalized.sourceSequence, updatedAt: new Date().toISOString() } : undefined
      const result = await this.postgresState.ingestNativeEvent(task, nativeRecord, projected, offset)
      if (result.replayed) return { nativeEventId: result.nativeEventId, events: [] }
      this.events.set(taskId, [...existing, ...result.events])
      for (const event of result.events) {
        if (event.type === 'assistant_text_delta' && event.content) await this.appendAssistantDelta(taskId, event.content)
        if (event.type === 'run_completed') await this.finishTurn(taskId, 'completed')
        if (event.type === 'run_failed') await this.finishTurn(taskId, 'failed')
        if (event.type === 'run_cancelled') await this.finishTurn(taskId, 'cancelled')
        this.emitter.emit(taskId, event)
      }
      return result
    }
    let result: { nativeEventId: string; events: RuntimeEvent[] } | undefined
    for (let attempt = 0; attempt < 4 && !result; attempt += 1) {
      try {
        result = this.requireUnitOfWork().run((repositories) => {
          const existing = repositories.nativeEvents.findBySourceEvent(taskId, runId, normalized.source, normalized.sourceEventId)
          if (existing) return { nativeEventId: existing.id, events: [] }

          const sourceSequence = normalized.sourceSequence
          const nativeEventId = nativeEventIdFor(taskId, runId, normalized)
          const nativeRecord: NativeEventRecord = {
            id: nativeEventId,
            conversationId: taskId,
            runId,
            source: normalized.source,
            sourceEventId: normalized.sourceEventId,
            sourceSequence,
            nativeType: normalized.nativeType,
            payloadJson: normalized.payloadJson,
            payloadHash: normalized.payloadHash,
            receivedAt: new Date().toISOString(),
          }
          repositories.nativeEvents.append(nativeRecord)
          const events: RuntimeEvent[] = []
          normalized.projections.forEach((projection, projectionIndex) => {
            const presentation = panelFor(projection)
            const record = runtimeEventRecordFor(repositories, taskId, runId, {
              ...projection,
              payload: {
                ...projection.payload,
                ...(presentation ? { presentation } : {}),
                nativeEventId,
                nativeSource: normalized.source,
                nativeType: normalized.nativeType,
                nativeSourceEventId: normalized.sourceEventId,
              },
            })
            repositories.runtimeEvents.append(record)
            repositories.nativeEvents.appendProjection({
              nativeEventId,
              projectionIndex,
              runtimeEventId: record.id,
              projectorVersion: NATIVE_PROJECTOR_VERSION,
              projectedAt: new Date().toISOString(),
            })
            events.push(this.runtimeEventFromRecord(record))
          })
          if (normalized.projections.length > 0) repositories.nativeEvents.setOffset({
            conversationId: taskId,
            runId,
            source: normalized.source,
            projectorVersion: NATIVE_PROJECTOR_VERSION,
            lastSourceSequence: sourceSequence,
            updatedAt: new Date().toISOString(),
          })
          return { nativeEventId, events }
        })
      } catch (error) {
        if (!(error instanceof OptimisticConflictError) || attempt === 3) throw error
      }
    }
    if (!result) throw new Error('Native event ingestion did not produce a result')
    this.events.set(taskId, this.readEventsFromDatabase(taskId))
    for (const event of result.events) {
      if (event.type === 'assistant_text_delta' && event.content) await this.appendAssistantDelta(taskId, event.content)
      if (event.type === 'run_completed') await this.finishTurn(taskId, 'completed')
      if (event.type === 'run_failed') await this.finishTurn(taskId, 'failed')
      if (event.type === 'run_cancelled') await this.finishTurn(taskId, 'cancelled')
      this.emitter.emit(taskId, event)
    }
    return result
  }

  listEvents(taskId: string) {
    if (this.postgresState) {
      this.getTask(taskId)
      return this.events.get(taskId) ?? []
    }
    return this.readEventsFromDatabase(taskId)
  }

  async listNativeEvents(taskId: string) {
    if (this.postgresState) return this.postgresState.listNativeEvents(this.getTask(taskId))
    this.getTask(taskId)
    return this.requireUnitOfWork().run((repositories) => repositories.nativeEvents.listByConversation(taskId))
  }

  async listNativeProjectionRecords(taskId: string) {
    if (this.postgresState) return this.postgresState.listNativeProjectionRecords(this.getTask(taskId))
    this.getTask(taskId)
    return this.requireUnitOfWork().run((repositories) => repositories.nativeEvents.listProjections(taskId))
  }

  async listNativeProjectionOffsets(taskId: string) {
    if (this.postgresState) return this.postgresState.listNativeProjectionOffsets(this.getTask(taskId))
    this.getTask(taskId)
    return this.requireUnitOfWork().run((repositories) => repositories.nativeEvents.listOffsets(taskId))
  }

  /**
   * Reserve a durable turn for a provider execution.
   *
   * `clientRequestId` is intentionally separate from the generated turn id:
   * an HTTP retry may arrive after the process has persisted the turn but
   * before the provider has settled.  Both persistence drivers must return
   * the original turn and leave its user/assistant messages untouched in that
   * case.  The provider adapter remains outside this reservation boundary.
   */
  async beginTurn(taskId: string, content: string, provider: Task['provider'], clientRequestId?: string) {
    const now = new Date().toISOString()
    const turnId = `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`
    const requestId = clientRequestId ?? turnId
    const task = this.getTask(taskId)
    const resetPlan = task.plan.some((step) => step.status !== 'pending')
    const existing = this.readMessages(task)
    const userMessage: ChatMessage = { id: `${turnId}:user`, taskId, turnId, role: 'user', content, status: 'completed', provider, createdAt: now, updatedAt: now }
    const assistantMessage: ChatMessage = { id: `${turnId}:assistant`, taskId, turnId, role: 'assistant', content: '', status: 'streaming', provider, createdAt: now, updatedAt: now }
    const ordinal = existing.filter((message) => message.role === 'user').length
    if (this.postgresState) {
      const persistedTurn = await this.postgresState.beginTurn(task, turnId, requestId, content, new Date(now))
      if (!persistedTurn.replayed) {
        const persistedAssistant = await this.postgresState.createAssistantPlaceholder(task, persistedTurn.id, assistantMessage.id, new Date(now))
        this.postgresMessageRevisions.set(persistedAssistant.id, persistedAssistant.revision)
      }
      this.messages.set(taskId, await this.postgresState.listMessages(task))
      if (persistedTurn.replayed && persistedTurn.status !== 'running') return persistedTurn.id
      this.activeTurns.set(taskId, persistedTurn.id)
      await this.updateTask(taskId, {
        activeRunId: persistedTurn.id,
        ...(!persistedTurn.replayed && resetPlan ? { plan: task.plan.map((step) => ({ id: step.id, title: step.title, status: 'pending' as const })) } : {}),
      })
      if (!persistedTurn.replayed && resetPlan) await this.appendEvent(taskId, {
        type: 'activity_delta', lane: 'control', label: 'Plan reset for new run',
        content: 'The new turn has a fresh plan lifecycle. Prior run timing and completion remain preserved in the immutable evidence history.',
        payload: { previousRunId: task.activeRunId, newRunId: persistedTurn.id, planReset: true },
      })
      return persistedTurn.id
    }
    this.requireUnitOfWork().run((repositories) => {
      const replayed = repositories.turns.findByClientRequest(taskId, requestId)
      if (replayed) return
      repositories.turns.insert({ id: turnId, conversationId: taskId, clientRequestId: requestId, ordinal, status: 'running', createdAt: now, startedAt: now, completedAt: null })
      repositories.messages.append(this.toMessageRecord(userMessage, existing.length))
      repositories.messages.append(this.toMessageRecord(assistantMessage, existing.length + 1))
    })
    const replayed = this.requireUnitOfWork().run((repositories) => repositories.turns.findByClientRequest(taskId, requestId))
    if (!replayed) throw new Error(`Turn ${requestId} was not persisted`)
    const replayedMessages = this.requireUnitOfWork().run((repositories) => repositories.messages.listByConversation(taskId, -1, 500).map((record) => this.fromMessageRecord(task, record)))
    this.messages.set(taskId, replayedMessages)
    if (replayed.id !== turnId && replayed.status !== 'running') return replayed.id
    this.activeTurns.set(taskId, replayed.id)
    await this.updateTask(taskId, {
      activeRunId: replayed.id,
      ...(replayed.id === turnId && resetPlan ? { plan: task.plan.map((step) => ({ id: step.id, title: step.title, status: 'pending' as const })) } : {}),
    })
    if (replayed.id === turnId && resetPlan) await this.appendEvent(taskId, {
      type: 'activity_delta', lane: 'control', label: 'Plan reset for new run',
      content: 'The new turn has a fresh plan lifecycle. Prior run timing and completion remain preserved in the immutable evidence history.',
      payload: { previousRunId: task.activeRunId, newRunId: replayed.id, planReset: true },
    })
    return replayed.id
  }

  async appendStandaloneMessage(taskId: string, role: ChatMessage['role'], content: string, status: ChatMessage['status'] = 'completed') {
    const now = new Date().toISOString()
    const task = this.getTask(taskId)
    const message: ChatMessage = { id: `message_${randomUUID().replaceAll('-', '')}`, taskId, turnId: `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`, role, content, status, provider: task.provider, createdAt: now, updatedAt: now }
    if (this.postgresState) {
      const persisted = await this.postgresState.appendStandaloneMessage(task, message.id, role, { text: content, provider: task.provider, updatedAt: now }, status, new Date(now))
      const converted = { ...persisted, turnId: message.turnId }
      this.messages.set(taskId, [...(this.messages.get(taskId) ?? []), converted])
      return converted
    }
    const existing = this.readMessages(task)
    this.requireUnitOfWork().run((repositories) => repositories.messages.append({ ...this.toMessageRecord(message, existing.length), turnId: null }))
    existing.push(message)
    this.messages.set(taskId, existing)
    return message
  }

  listMessages(taskId: string, options: { cursor?: string; limit?: number; query?: string } = {}) {
    const task = this.getTask(taskId)
    const query = options.query?.trim().toLocaleLowerCase()
    const all = this.readMessages(task).filter((message) => !query || message.content.toLocaleLowerCase().includes(query))
    const cursorIndex = options.cursor ? all.findIndex((message) => message.id === options.cursor) : -1
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200)
    const messages = all.slice(start, start + limit)
    return { messages, nextCursor: start + limit < all.length ? messages.at(-1)?.id : undefined, total: all.length }
  }

  async claimRetry(taskId: string, idempotencyKey: string, prompt: string): Promise<{ claimed: boolean; state: 'pending' | 'completed'; response?: Record<string, unknown> }> {
    this.getTask(taskId)
    const scope = `retry:${taskId}`
    const requestHash = createHash('sha256').update(JSON.stringify({ taskId, prompt })).digest('hex')
    return this.claimIdempotentOperation(scope, idempotencyKey, requestHash, this.getTask(taskId).ownerUserId)
  }

  async claimIdempotentOperation(scope: string, idempotencyKey: string, requestHash: string, ownerUserId?: string): Promise<{ claimed: boolean; state: 'pending' | 'completed'; response?: Record<string, unknown> }> {
    const now = new Date().toISOString()
    if (this.postgresState) return this.postgresState.claimIdempotency(scope, idempotencyKey, requestHash, now, ownerUserId)
    return this.requireUnitOfWork().run((repositories) => {
      const existing = repositories.idempotency.find(scope, idempotencyKey)
      if (existing) {
        repositories.idempotency.claim(scope, idempotencyKey, requestHash, now)
        return {
          claimed: false,
          state: existing.state,
          ...(existing.responseJson ? { response: JSON.parse(existing.responseJson) as Record<string, unknown> } : {}),
        }
      }
      repositories.idempotency.claim(scope, idempotencyKey, requestHash, now)
      return { claimed: true, state: 'pending' as const }
    })
  }

  async completeIdempotentOperation(scope: string, idempotencyKey: string, response: Record<string, unknown>) {
    const encodedResponse = JSON.stringify(response)
    if (this.postgresState) {
      await this.postgresState.completeIdempotency(scope, idempotencyKey, encodedResponse, new Date().toISOString())
      return
    }
    this.requireUnitOfWork().run((repositories) => repositories.idempotency.complete(scope, idempotencyKey, encodedResponse, new Date().toISOString()))
  }

  async createFollowUpOperation(taskId: string, idempotencyKey: string, requestHash: string, prompt: string, attachmentsJson: string, executionMode: 'queued' | 'immediate', ownerUserId?: string): Promise<{ claimed: boolean; operation: FollowUpOperationRecord }> {
    const task = this.getTask(taskId, ownerUserId)
    const now = new Date().toISOString()
    const id = `follow_up_${createHash('sha256').update(`${taskId}:${idempotencyKey}`).digest('hex').slice(0, 32)}`
    const executionId = `execution_${createHash('sha256').update(`${taskId}:${idempotencyKey}:execution`).digest('hex').slice(0, 32)}`
    const record: FollowUpOperationRecord = {
      id, taskId, ownerUserId: task.ownerUserId ?? ownerUserId ?? null, idempotencyKey, requestHash, prompt, attachmentsJson,
      executionMode, state: 'prepared', guidanceId: null, turnId: null, responseJson: null, errorJson: null,
      leaseOwner: null, leaseExpiresAt: null, attemptCount: 0, executionId, providerRequestId: `onevibe:${executionId}`,
      providerState: 'not_started', providerStartedAt: null, providerCompletedAt: null,
      createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
    }
    const attachments = durableFollowUpAttachments(record.id, taskId, record.ownerUserId, idempotencyKey, attachmentsJson, now)
    if (this.postgresState) return this.postgresState.createFollowUpOperation(record, attachments)
    return this.requireUnitOfWork().run((repositories) => {
      const existing = repositories.followUpOperations.findByKey(taskId, idempotencyKey)
      if (existing) {
        if (existing.requestHash !== requestHash) throw new IdempotencyConflictError(`Follow-up operation ${taskId}/${idempotencyKey} was reused with a different request`)
        return { claimed: false, operation: existing }
      }
      repositories.followUpOperations.insert(record)
      for (const attachment of attachments) repositories.followUpAttachments.insert(attachment)
      return { claimed: true, operation: record }
    })
  }

  async listRecoverableFollowUpOperations(): Promise<FollowUpOperationRecord[]> {
    if (this.postgresState) return this.postgresState.listRecoverableFollowUpOperations()
    return this.requireUnitOfWork().run((repositories) => repositories.followUpOperations.listRecoverable())
  }

  async findFollowUpOperation(taskId: string, idempotencyKey: string): Promise<FollowUpOperationRecord | undefined> {
    this.getTask(taskId)
    if (this.postgresState) return this.postgresState.findFollowUpOperation(taskId, idempotencyKey)
    return this.requireUnitOfWork().run((repositories) => repositories.followUpOperations.findByKey(taskId, idempotencyKey))
  }

  async updateFollowUpOperation(operation: FollowUpOperationRecord, patch: Partial<Pick<FollowUpOperationRecord, 'state' | 'guidanceId' | 'turnId' | 'responseJson' | 'errorJson' | 'leaseOwner' | 'leaseExpiresAt' | 'attemptCount' | 'providerState' | 'providerStartedAt' | 'providerCompletedAt' | 'startedAt' | 'completedAt'>>): Promise<FollowUpOperationRecord> {
    const updated = { ...operation, ...patch, updatedAt: new Date().toISOString() }
    if (this.postgresState) {
      await this.postgresState.updateFollowUpOperation(updated, operation.updatedAt)
      return updated
    }
    this.requireUnitOfWork().run((repositories) => repositories.followUpOperations.update(updated, operation.updatedAt))
    return updated
  }

  async claimFollowUpOperation(operation: FollowUpOperationRecord, leaseOwner: string, now: string, leaseExpiresAt: string): Promise<FollowUpOperationRecord | undefined> {
    if (this.postgresState) return this.postgresState.claimFollowUpOperation(operation.id, leaseOwner, now, leaseExpiresAt)
    return this.requireUnitOfWork().run((repositories) => repositories.followUpOperations.claim(operation.id, leaseOwner, now, leaseExpiresAt))
  }

  async renewFollowUpOperation(operation: FollowUpOperationRecord, leaseOwner: string, now: string, leaseExpiresAt: string): Promise<FollowUpOperationRecord | undefined> {
    if (this.postgresState) return this.postgresState.renewFollowUpOperation(operation.id, leaseOwner, now, leaseExpiresAt)
    return this.requireUnitOfWork().run((repositories) => repositories.followUpOperations.renew(operation.id, leaseOwner, now, leaseExpiresAt))
  }

  async listFollowUpAttachments(operationId: string): Promise<FollowUpAttachmentRecord[]> {
    if (this.postgresState) return this.postgresState.listFollowUpAttachments(operationId)
    return this.requireUnitOfWork().run((repositories) => repositories.followUpAttachments.listForOperation(operationId))
  }

  async markFollowUpAttachmentsMaterialized(operationId: string): Promise<void> {
    const attachments = await this.listFollowUpAttachments(operationId)
    for (const attachment of attachments) {
      if (attachment.state === 'materialized') continue
      const updated = { ...attachment, state: 'materialized' as const, updatedAt: new Date().toISOString() }
      if (this.postgresState) await this.postgresState.updateFollowUpAttachment(updated, attachment.updatedAt)
      else this.requireUnitOfWork().run((repositories) => repositories.followUpAttachments.update(updated, attachment.updatedAt))
    }
  }

  async getRetry(taskId: string, idempotencyKey: string): Promise<{ state: 'pending' | 'completed'; response?: Record<string, unknown> } | undefined> {
    this.getTask(taskId)
    if (this.postgresState) {
      const record = await this.postgresState.findIdempotency(`retry:${taskId}`, idempotencyKey)
      if (!record) return undefined
      return { state: record.state, ...(record.responseJson ? { response: JSON.parse(record.responseJson) as Record<string, unknown> } : {}) }
    }
    const record = this.requireUnitOfWork().run((repositories) => repositories.idempotency.find(`retry:${taskId}`, idempotencyKey))
    if (!record) return undefined
    return { state: record.state, ...(record.responseJson ? { response: JSON.parse(record.responseJson) as Record<string, unknown> } : {}) }
  }

  async completeRetry(taskId: string, idempotencyKey: string, response: Record<string, unknown>) {
    await this.completeIdempotentOperation(`retry:${taskId}`, idempotencyKey, response)
  }

  searchMessages(query: string, limit = 50, ownerUserId?: string) {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    const results: Array<{ task: Task; message: ChatMessage }> = []
    for (const task of this.listTasks(ownerUserId)) {
      const messages = this.readMessages(task)
      for (const message of messages) if (message.content.toLocaleLowerCase().includes(normalized)) results.push({ task, message })
    }
    return results.sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt)).slice(0, limit)
  }

  subscribe(taskId: string, listener: (event: RuntimeEvent) => void) {
    this.emitter.on(taskId, listener)
    let closed = false
    let lastSequence = this.events.get(taskId)?.at(-1)?.sequence ?? -1
    let polling = false
    const poll = async () => {
      if (closed || polling || !this.postgresState) return
      const task = this.tasks.get(taskId)
      if (!task?.ownerUserId) return
      polling = true
      try {
        const durable = await this.postgresState.listEvents(task)
        const pending = durable.filter((event) => event.sequence > lastSequence).sort((a, b) => a.sequence - b.sequence)
        this.events.set(taskId, durable)
        for (const event of pending) {
          lastSequence = event.sequence
          listener(event)
        }
      } catch {
        // The in-process emitter remains the low-latency path. A transient
        // poll failure is retried on the next interval and never leaks DB data.
      } finally {
        polling = false
      }
    }
    const poller = this.postgresState ? setInterval(() => { void poll() }, 250) : undefined
    return () => {
      if (closed) return
      closed = true
      if (poller) clearInterval(poller)
      this.emitter.off(taskId, listener)
    }
  }

  workspacePath(taskId: string, relativePath = '') {
    this.getTask(taskId)
    const root = path.join(this.workspacesRoot, taskId)
    const candidate = path.resolve(root, relativePath)
    assertWithin(root, candidate)
    return candidate
  }

  runtimeStatePath(taskId: string) {
    this.getTask(taskId)
    const candidate = path.join(this.runtimeRoot, taskId)
    assertWithin(this.runtimeRoot, candidate)
    return candidate
  }

  async writeWorkspaceFile(taskId: string, relativePath: string, content: string) {
    await this.writeWorkspaceBytes(taskId, relativePath, Buffer.from(content, 'utf8'))
  }

  async writeWorkspaceBytes(taskId: string, relativePath: string, content: Uint8Array) {
    const target = this.workspacePath(taskId, relativePath)
    if (this.postgresState) {
      const task = this.getTask(taskId)
      await this.postgresState.writeWorkspaceFile(task, relativePath, content, createHash('sha256').update(content).digest('hex'))
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  async readWorkspaceFile(taskId: string, relativePath: string) {
    if (this.postgresState) return (await this.postgresState.readWorkspaceFile(this.getTask(taskId), relativePath)).content.toString('utf8')
    return readFile(this.workspacePath(taskId, relativePath), 'utf8')
  }

  async readWorkspaceBytes(taskId: string, relativePath: string) {
    if (this.postgresState) return (await this.postgresState.readWorkspaceFile(this.getTask(taskId), relativePath)).content
    return readFile(this.workspacePath(taskId, relativePath))
  }

  async listWorkspaceFiles(taskId: string): Promise<WorkspaceFile[]> {
    if (this.postgresState) {
      return (await this.postgresState.listWorkspaceFiles(this.getTask(taskId))).map(({ path: filePath, size, updatedAt }) => ({ path: filePath, size, updatedAt }))
    }
    const root = this.workspacePath(taskId)
    await mkdir(root, { recursive: true })
    const results: WorkspaceFile[] = []
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) await walk(full)
        if (entry.isFile()) {
          const details = await stat(full)
          results.push({
            path: path.relative(root, full),
            size: details.size,
            updatedAt: details.mtime.toISOString(),
          })
        }
      }
    }
    await walk(root)
    return results.sort((a, b) => a.path.localeCompare(b.path))
  }

  async listPublicWorkspaceFiles(taskId: string): Promise<WorkspaceFile[]> {
    const task = this.getTask(taskId)
    const privateAttachmentPaths = new Set(task.attachments.map((attachment) => normalizeWorkspacePath(attachment.path)))
    return (await this.listWorkspaceFiles(taskId)).filter((file) => !isInternalWorkspacePath(file.path) && !isPrivateWorkspacePath(file.path) && !privateAttachmentPaths.has(normalizeWorkspacePath(file.path)))
  }

  async createWorkspaceVersion(taskId: string, label: string) {
    const files = await this.listWorkspaceFiles(taskId)
    if (!files.length) return null
    const id = `version_${Date.now()}_${randomUUID().slice(0, 8)}`
    if (this.postgresState) {
      const task = this.getTask(taskId)
      const records = await this.postgresState.listWorkspaceFiles(task)
      const version: WorkspaceVersion = {
        id, taskId, label: label.slice(0, 120), createdAt: new Date().toISOString(), fileCount: records.length,
        evidenceHash: this.listEvents(taskId).at(-1)?.eventHash ?? 'GENESIS',
      }
      return this.postgresState.createWorkspaceVersion(task, version, records)
    }
    const root = path.join(this.versionsRoot, taskId, id)
    assertWithin(this.versionsRoot, root)
    await mkdir(root, { recursive: true })
    await cp(this.workspacePath(taskId), path.join(root, 'files'), { recursive: true })
    const version: WorkspaceVersion = {
      id, taskId, label: label.slice(0, 120), createdAt: new Date().toISOString(), fileCount: files.length,
      evidenceHash: this.listEvents(taskId).at(-1)?.eventHash ?? 'GENESIS',
    }
    await atomicWriteJson(path.join(root, 'version.json'), version)
    return version
  }

  async listWorkspaceVersions(taskId: string): Promise<WorkspaceVersion[]> {
    if (this.postgresState) return this.postgresState.listWorkspaceVersions(this.getTask(taskId))
    this.getTask(taskId)
    const root = path.join(this.versionsRoot, taskId)
    await mkdir(root, { recursive: true })
    const versions: WorkspaceVersion[] = []
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      try { versions.push(JSON.parse(await readFile(path.join(root, entry.name, 'version.json'), 'utf8')) as WorkspaceVersion) } catch { /* ignore incomplete snapshots */ }
    }
    return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async restoreWorkspaceVersion(taskId: string, versionId: string) {
    if (this.postgresState) {
      const task = this.getTask(taskId)
      const version = await this.postgresState.restoreWorkspaceVersion(task, versionId)
      await this.hydratePostgresWorkspaceCache(task)
      return version
    }
    const versionRoot = path.resolve(this.versionsRoot, taskId, versionId)
    assertWithin(path.join(this.versionsRoot, taskId), versionRoot)
    const version = JSON.parse(await readFile(path.join(versionRoot, 'version.json'), 'utf8')) as WorkspaceVersion
    if (version.taskId !== taskId || version.id !== versionId) throw new Error('Invalid workspace version')
    const workspace = this.workspacePath(taskId)
    await rm(workspace, { recursive: true, force: true })
    await cp(path.join(versionRoot, 'files'), workspace, { recursive: true })
    return version
  }

  async compareWorkspaceVersion(taskId: string, versionId: string): Promise<WorkspaceVersionComparison> {
    if (this.postgresState) {
      const task = this.getTask(taskId)
      const version = (await this.postgresState.listWorkspaceVersions(task)).find((candidate) => candidate.id === versionId)
      if (!version) throw new Error('Invalid workspace version')
      const [beforeRecords, afterRecords] = await Promise.all([
        this.postgresState.listWorkspaceVersionFiles(task, versionId),
        this.postgresState.listWorkspaceFiles(task),
      ])
      const before = new Map(beforeRecords.map((file) => [file.path, { size: file.size, hash: file.sha256 }]))
      const after = new Map(afterRecords.map((file) => [file.path, { size: file.size, hash: file.sha256 }]))
      const paths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b))
      const changes: WorkspaceVersionComparison['changes'] = []
      let added = 0; let changed = 0; let removed = 0
      for (const relativePath of paths) {
        const prior = before.get(relativePath)
        const current = after.get(relativePath)
        if (!prior && current) { added += 1; changes.push({ path: relativePath, status: 'added', afterSize: current.size, afterHash: current.hash }); continue }
        if (prior && !current) { removed += 1; changes.push({ path: relativePath, status: 'removed', beforeSize: prior.size, beforeHash: prior.hash }); continue }
        if (prior && current && prior.hash !== current.hash) { changed += 1; changes.push({ path: relativePath, status: 'changed', beforeSize: prior.size, afterSize: current.size, beforeHash: prior.hash, afterHash: current.hash }) }
      }
      const limit = 200
      return { version, comparedAt: new Date().toISOString(), summary: { added, changed, removed }, changes: changes.slice(0, limit), truncated: changes.length > limit }
    }
    const versionRoot = path.resolve(this.versionsRoot, taskId, versionId)
    assertWithin(path.join(this.versionsRoot, taskId), versionRoot)
    const version = JSON.parse(await readFile(path.join(versionRoot, 'version.json'), 'utf8')) as WorkspaceVersion
    if (version.taskId !== taskId || version.id !== versionId) throw new Error('Invalid workspace version')
    const describe = async (root: string) => {
      const files = new Map<string, { size: number; hash: string }>()
      const walk = async (directory: string) => {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name)
          if (entry.isDirectory()) await walk(full)
          if (entry.isFile()) {
            const details = await stat(full)
            const bytes = await readFile(full)
            files.set(path.relative(root, full), { size: details.size, hash: createHash('sha256').update(bytes).digest('hex') })
          }
        }
      }
      await walk(root)
      return files
    }
    const [before, after] = await Promise.all([describe(path.join(versionRoot, 'files')), describe(this.workspacePath(taskId))])
    const paths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a.localeCompare(b))
    const changes: WorkspaceVersionComparison['changes'] = []
    let added = 0; let changed = 0; let removed = 0
    for (const relativePath of paths) {
      const prior = before.get(relativePath)
      const current = after.get(relativePath)
      if (!prior && current) { added += 1; changes.push({ path: relativePath, status: 'added', afterSize: current.size, afterHash: current.hash }); continue }
      if (prior && !current) { removed += 1; changes.push({ path: relativePath, status: 'removed', beforeSize: prior.size, beforeHash: prior.hash }); continue }
      if (prior && current && prior.hash !== current.hash) { changed += 1; changes.push({ path: relativePath, status: 'changed', beforeSize: prior.size, afterSize: current.size, beforeHash: prior.hash, afterHash: current.hash }) }
    }
    const limit = 200
    return { version, comparedAt: new Date().toISOString(), summary: { added, changed, removed }, changes: changes.slice(0, limit), truncated: changes.length > limit }
  }

  async copyWorkspace(sourceTaskId: string, targetTaskId: string) {
    if (this.postgresState) {
      const source = this.getTask(sourceTaskId)
      const target = this.getTask(targetTaskId)
      if (!source.ownerUserId || source.ownerUserId !== target.ownerUserId) throw new Error('Postgres workspace copies require one owner')
      const count = await this.postgresState.copyWorkspaceFiles(source, target)
      await this.hydratePostgresWorkspaceCache(target)
      return count
    }
    const source = this.workspacePath(sourceTaskId)
    const target = this.workspacePath(targetTaskId)
    const files = await this.listWorkspaceFiles(sourceTaskId)
    if (!files.length) return 0
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
    return files.length
  }

  async readWorkspaceVersionBytes(taskId: string, versionId: string, relativePath: string) {
    const task = this.getTask(taskId)
    if (this.postgresState) {
      const files = await this.postgresState.listWorkspaceVersionFiles(task, versionId)
      const file = files.find((candidate) => candidate.path === relativePath)
      if (!file) throw new Error(`Workspace version file ${relativePath} does not exist`)
      return file.content
    }
    const versionRoot = path.resolve(this.versionsRoot, taskId, versionId)
    assertWithin(path.join(this.versionsRoot, taskId), versionRoot)
    const target = path.resolve(versionRoot, 'files', relativePath)
    assertWithin(path.join(versionRoot, 'files'), target)
    return readFile(target)
  }

  async listWorkspaceVersionFiles(taskId: string, versionId: string): Promise<WorkspaceFile[]> {
    const task = this.getTask(taskId)
    if (this.postgresState) {
      return (await this.postgresState.listWorkspaceVersionFiles(task, versionId)).map(({ path: filePath, size, updatedAt }) => ({ path: filePath, size, updatedAt }))
    }
    const root = path.join(this.versionsRoot, taskId, versionId, 'files')
    assertWithin(this.versionsRoot, root)
    const results: WorkspaceFile[] = []
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) await walk(full)
        if (entry.isFile()) {
          const details = await stat(full)
          results.push({ path: path.relative(root, full), size: details.size, updatedAt: details.mtime.toISOString() })
        }
      }
    }
    await walk(root)
    return results.sort((a, b) => a.path.localeCompare(b.path))
  }

  /**
   * Reconcile files created by provider runtimes that write directly through
   * their SDK tools. The Postgres repository remains authoritative; internal
   * SDK state is deliberately excluded from the portable workspace ledger.
   */
  async syncWorkspaceFromDisk(taskId: string) {
    if (!this.postgresState) return
    const task = this.getTask(taskId)
    if (!task.ownerUserId) throw new Error('Postgres workspace files require an owner')
    const root = this.workspacePath(taskId)
    const seen = new Set<string>()
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name)
        const relative = path.relative(root, full).split(path.sep).join('/')
        if (entry.isDirectory()) {
          if (!isInternalWorkspacePath(`${relative}/`)) await walk(full)
          continue
        }
        if (!entry.isFile() || isInternalWorkspacePath(relative)) continue
        const bytes = await readFile(full)
        seen.add(relative)
        await this.postgresState!.writeWorkspaceFile(task, relative, bytes, createHash('sha256').update(bytes).digest('hex'))
      }
    }
    await walk(root)
    for (const file of await this.postgresState.listWorkspaceFiles(task)) {
      if (!seen.has(file.path) && !isInternalWorkspacePath(file.path)) await this.postgresState.deleteWorkspaceFile(task, file.path)
    }
  }

  /**
   * Create a durable conversation branch at a user message boundary.
   *
   * The selected user message is deliberately excluded from the copied
   * transcript: the caller supplies its edited replacement as the first new
   * turn. Prior messages are copied into a new conversation with fresh IDs,
   * while the current workspace is copied as an independent file tree.
   */
  async forkTask(sourceTaskId: string, fromMessageId: string, newPrompt: string) {
    const source = this.getTask(sourceTaskId)
    if (['pending', 'running', 'waiting_for_user_input', 'waiting_for_approval'].includes(source.status) || this.activeTurns.has(sourceTaskId)) {
      throw new Error('Stop the active task before creating a conversation branch')
    }
    const sourceMessages = this.readMessages(source)
    const boundary = sourceMessages.findIndex((message) => message.id === fromMessageId)
    if (boundary < 0) throw new Error('The selected message is not part of this conversation')
    if (sourceMessages[boundary]?.role !== 'user') throw new Error('Conversation branches must start from a user message')

    const fork = await this.createTask(newPrompt, source.provider, source.mode, source.projectId, undefined, source.references, source.attachments, source.skills, source.ownerUserId)
    const forkedAt = new Date().toISOString()
    await this.updateTask(fork.id, { parentTaskId: source.id, forkedFromMessageId: fromMessageId, forkedAt })
    await this.copyWorkspace(source.id, fork.id)

    const history = sourceMessages.slice(0, boundary)
    const turnMap = new Map<string, { id: string; ordinal: number; createdAt: string; completedAt: string; statuses: ChatMessage['status'][] }>()
    for (const message of history) {
      const current = turnMap.get(message.turnId)
      if (current) {
        current.completedAt = current.completedAt > message.updatedAt ? current.completedAt : message.updatedAt
        current.statuses.push(message.status)
      } else {
        turnMap.set(message.turnId, {
          id: `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`,
          ordinal: turnMap.size,
          createdAt: message.createdAt,
          completedAt: message.updatedAt,
          statuses: [message.status],
        })
      }
    }
    if (this.postgresState) {
      const turns = [...turnMap.values()].map((turn) => ({
        id: turn.id, clientRequestId: turn.id, ordinal: turn.ordinal,
        status: turn.statuses.includes('failed') ? 'failed' : turn.statuses.includes('cancelled') ? 'cancelled' : 'completed',
        createdAt: new Date(turn.createdAt), startedAt: new Date(turn.createdAt), completedAt: new Date(turn.completedAt),
      }))
      const messages = history.map((message, sequence) => {
        const turn = turnMap.get(message.turnId)
        if (!turn) throw new Error(`Missing branch turn for message ${message.id}`)
        return {
          id: `message_${randomUUID().replaceAll('-', '')}`, turnId: turn.id, sequence, role: message.role,
          content: { text: message.content, provider: message.provider, updatedAt: message.updatedAt },
          status: message.status === 'streaming' ? 'failed' : message.status, createdAt: new Date(message.createdAt),
        }
      })
      await this.postgresState.cloneConversationHistory(source, fork, turns, messages)
      this.messages.set(fork.id, await this.postgresState.listMessages(fork))
      await this.appendEvent(fork.id, {
        type: 'activity_delta', lane: 'control', label: 'Conversation branch created',
        content: `Branched from ${source.id} before the selected user message. The workspace was copied independently.`,
        payload: { sourceTaskId: source.id, sourceMessageId: fromMessageId, sourceEvidenceHash: this.listEvents(source.id).at(-1)?.eventHash ?? 'GENESIS', historyMessageCount: history.length, workspaceCopied: true },
      })
      return this.getTask(fork.id)
    }
    this.requireUnitOfWork().run((repositories) => {
      for (const turn of turnMap.values()) {
        const status = turn.statuses.includes('failed') ? 'failed' : turn.statuses.includes('cancelled') ? 'cancelled' : 'completed'
        repositories.turns.insert({
          id: turn.id, conversationId: fork.id, clientRequestId: turn.id, ordinal: turn.ordinal,
          status, createdAt: turn.createdAt, startedAt: turn.createdAt, completedAt: turn.completedAt,
        })
      }
      history.forEach((message, sequence) => {
        const turn = turnMap.get(message.turnId)
        if (!turn) throw new Error(`Missing branch turn for message ${message.id}`)
        const status = message.status === 'streaming' ? 'failed' : message.status
        const cloned: ChatMessage = {
          ...message,
          id: `message_${randomUUID().replaceAll('-', '')}`,
          taskId: fork.id,
          turnId: turn.id,
          status,
        }
        repositories.messages.append(this.toMessageRecord(cloned, sequence))
      })
    })
    this.messages.set(fork.id, this.readMessages(this.getTask(fork.id)))
    await this.appendEvent(fork.id, {
      type: 'activity_delta', lane: 'control', label: 'Conversation branch created',
      content: `Branched from ${source.id} before the selected user message. The workspace was copied independently.`,
      payload: { sourceTaskId: source.id, sourceMessageId: fromMessageId, sourceEvidenceHash: this.listEvents(source.id).at(-1)?.eventHash ?? 'GENESIS', historyMessageCount: history.length, workspaceCopied: true },
    })
    return this.getTask(fork.id)
  }

  async exportWorkspaceZip(taskId: string) {
    const task = this.getTask(taskId)
    const events = this.listEvents(taskId)
    const messages = this.listMessages(taskId, { limit: 200 }).messages
    const chainValid = this.verifyChain(taskId)
    const files = await this.listWorkspaceFiles(taskId)
    const entries: Record<string, Uint8Array> = {}
    const excludedWorkspaceFiles: string[] = []
    const privateAttachmentPaths = new Set(task.attachments.map((attachment) => normalizeWorkspacePath(attachment.path)))
    for (const file of files) {
      if (!portableArtifactKind(file.path) || privateAttachmentPaths.has(normalizeWorkspacePath(file.path))) { excludedWorkspaceFiles.push(file.path); continue }
      entries[file.path] = await this.readWorkspaceBytes(taskId, file.path)
    }
    const project = this.getProject(task.projectId)
    const projectFileEntries: string[] = []
    const projectRevisionEntries: string[] = []
    for (const file of project.files) {
      const stored = await this.readProjectFileBytes(project.id, file.path, project.ownerUserId)
      const entryPath = `project-knowledge/${file.path}`
      entries[entryPath] = stored.content
      projectFileEntries.push(entryPath)
      for (const version of this.listProjectFileVersions(project.id, file.path, project.ownerUserId)) {
        const revision = await this.readProjectFileVersionBytes(project.id, file.path, version.id, project.ownerUserId)
        const revisionPath = `project-knowledge/.history/${file.path.replace(/[^a-zA-Z0-9._/-]/g, '_')}/${version.id}`
        entries[revisionPath] = revision.content
        projectRevisionEntries.push(revisionPath)
      }
    }
    entries['GITHUB-HANDOFF.md'] = strToU8(`# GitHub handoff\n\nThis archive is a portable handoff for **${task.title}**. It does not create a repository, authenticate to GitHub, or authorize publication.\n\n## Evidence\n\n- Task ID: \`${task.id}\`\n- Creation mode: \`${task.mode}\`\n- Provider: \`${task.provider}\`\n- Evidence chain: ${chainValid ? 'valid at export' : 'INVALID — do not publish until reviewed'}\n- Final evidence hash: \`${events.at(-1)?.eventHash ?? 'GENESIS'}\`\n\n## Suggested review and handoff\n\n1. Extract this archive and inspect \`ONEVIBE-EVIDENCE.json\`, \`validation-report.json\` (when present), and the generated source.\n2. Remove anything unsuitable for external publication. Never commit credentials, private inputs, evidence screenshots, or \`.env*\` files.\n3. Create a reviewed repository: \`git init && git add . && git commit -m "Initial governed handoff"\`.\n4. Use your approved GitHub identity and repository policy to create a remote or pull request. For GitHub CLI users: \`gh repo create <owner>/<repo> --private --source=. --push\`.\n5. Preserve this archive or attach \`ONEVIBE-EVIDENCE.json\` to the review record so the source handoff remains traceable.\n\nExternal publishing remains a consequential action. Obtain the required independent VTI Wallet approval before executing it.\n`)
    entries['ONEVIBE-EVIDENCE.json'] = strToU8(`${JSON.stringify({
      task, project: { id: project.id, name: project.name, context: project.context, files: project.files }, events, messages, chainValid,
      excludedWorkspaceFiles, projectFileEntries, projectRevisionEntries,
      exportedAt: new Date().toISOString(),
    }, null, 2)}\n`)
    return zipSync(entries, { level: 6 })
  }

  async snapshot(taskId: string): Promise<TaskSnapshot> {
    return { ...this.getTask(taskId), events: this.listEvents(taskId), files: await this.listPublicWorkspaceFiles(taskId), messages: this.listMessages(taskId, { limit: 200 }).messages }
  }

  verifyChain(taskId: string) {
    const events = this.listEvents(taskId)
    let previousHash = 'GENESIS'
    for (const event of events) {
      const { id: _id, eventHash, ...unsigned } = event
      if (event.previousHash !== previousHash) return false
      const expected = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')
      if (expected !== eventHash) return false
      previousHash = eventHash
    }
    return true
  }

  private async persist(task: Task) {
    await atomicWriteJson(path.join(this.tasksRoot, task.id, 'task.json'), task)
  }

  private async persistProjects() { await atomicWriteJson(this.projectsFile, this.listProjects()) }
  private async persistSchedules() { await atomicWriteJson(this.schedulesFile, this.listSchedules()) }

  private async appendAssistantDelta(taskId: string, content: string) {
    let turnId = this.activeTurns.get(taskId)
    const task = this.getTask(taskId)
    const existing = this.readMessages(task)
    if (this.postgresState) {
      if (!turnId) throw new Error('Postgres assistant deltas require an active durable turn')
      const message = [...existing].reverse().find((item) => item.turnId === turnId && item.role === 'assistant')
      if (!message) throw new Error(`Assistant message for turn ${turnId} is missing from durable history`)
      const expectedRevision = this.postgresMessageRevisions.get(message.id)
      if (expectedRevision === undefined) throw new Error(`Assistant message ${message.id} revision is missing from durable history`)
      const updated = await this.postgresState.appendAssistantDelta(task, message.id, expectedRevision, content)
      this.postgresMessageRevisions.set(updated.id, updated.revision)
      Object.assign(message, this.fromPostgresMessage(task, updated))
      this.messages.set(taskId, existing)
      return
    }
    if (!turnId) {
      const now = new Date().toISOString()
      turnId = `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`
      this.activeTurns.set(taskId, turnId)
      const assistant: ChatMessage = { id: `message_${randomUUID().replaceAll('-', '')}`, taskId, turnId, role: 'assistant', content: '', status: 'streaming', provider: task.provider, createdAt: now, updatedAt: now }
      this.requireUnitOfWork().run((repositories) => {
        repositories.turns.insert({
          id: turnId!, conversationId: taskId, clientRequestId: turnId!,
          ordinal: new Set(existing.map((candidate) => candidate.turnId)).size,
          status: 'running', createdAt: now, startedAt: now, completedAt: null,
        })
        repositories.messages.append(this.toMessageRecord(assistant, existing.length))
      })
      existing.push(assistant)
    }
    const message = [...existing].reverse().find((item) => item.turnId === turnId && item.role === 'assistant')
    if (message) {
      const updated = this.requireUnitOfWork().run((repositories) => {
        const record = repositories.messages.listByConversation(taskId, -1, 500).find((candidate) => candidate.id === message.id)
        if (!record) throw new Error(`Assistant message ${message.id} is missing from durable history`)
        return repositories.messages.appendAssistantDelta(message.id, record.revision, content)
      })
      Object.assign(message, this.fromMessageRecord(task, updated))
    }
    this.messages.set(taskId, existing)
  }

  private async finishTurn(taskId: string, status: Extract<ChatMessage['status'], 'completed' | 'failed' | 'cancelled'>) {
    const turnId = this.activeTurns.get(taskId)
    if (!turnId) return
    const task = this.getTask(taskId)
    const messages = this.readMessages(task)
    const message = [...messages].reverse().find((item) => item.turnId === turnId && item.role === 'assistant')
    if (this.postgresState && !message) {
      // A process can die after the task lease is persisted but before the
      // provider creates its assistant turn. Reconciliation still records the
      // failed run, but must not manufacture a durable turn on restart.
      this.activeTurns.delete(taskId)
      return
    }
    const completedAt = new Date().toISOString()
    if (this.postgresState) {
      await this.postgresState.finishTurn(task, turnId, status, new Date(completedAt))
      if (message) {
        const persisted = await this.postgresState.listMessages(task)
        this.messages.set(taskId, persisted)
        for (const candidate of persisted) {
          const revision = this.postgresMessageRevisions.get(candidate.id)
          if (candidate.id === message.id && revision !== undefined) this.postgresMessageRevisions.set(candidate.id, revision + 1)
        }
      }
      this.activeTurns.delete(taskId)
      if (this.getTask(taskId).activeRunId === turnId) await this.updateTask(taskId, { activeRunId: undefined })
      return
    }
    this.requireUnitOfWork().run((repositories) => {
      const turn = repositories.turns.findById(turnId)
      if (!turn) throw new Error(`Turn ${turnId} is missing from durable history`)
      if (turn.status !== status) repositories.turns.transition(turnId, turn.status, { ...turn, status, completedAt })
      if (message) {
        const record = repositories.messages.listByConversation(taskId, -1, 500).find((candidate) => candidate.id === message.id)
        if (!record) throw new Error(`Assistant message ${message.id} is missing from durable history`)
        if (record.status !== status) repositories.messages.reviseAssistant(message.id, record.revision, JSON.stringify({ text: message.content, provider: message.provider, updatedAt: completedAt }), status)
      }
    })
    this.messages.set(taskId, this.readMessages(task))
    this.activeTurns.delete(taskId)
    if (this.getTask(taskId).activeRunId === turnId) await this.updateTask(taskId, { activeRunId: undefined })
  }

  private async reconcileRestartedTasks() {
    for (const candidate of this.listTasks()) {
      if (!candidate.activeRunId || !restartReconciliationStatuses.has(candidate.status) || this.activeTurns.has(candidate.id)) continue

      const task = this.getTask(candidate.id)
      const runId = task.activeRunId
      if (!runId || !restartReconciliationStatuses.has(task.status) || this.activeTurns.has(task.id)) continue

      this.activeTurns.set(task.id, runId)
      try {
        const alreadyFailed = this.listEvents(task.id).some((event) => event.runId === runId && event.type === 'run_failed')
        if (!alreadyFailed) await this.appendEvent(task.id, {
          type: 'run_failed', lane: 'control', status: 'failed', label: 'Process restart reconciled',
          content: 'The previous run ended during a process restart. Retry is available.',
          payload: { reason: 'process_restart_reconciliation', retryable: true },
        })
        else await this.finishTurn(task.id, 'failed')
        await this.updateTask(task.id, { status: 'failed', activeRunId: undefined })
      } finally {
        this.activeTurns.delete(task.id)
      }
    }
  }

  private requireUnitOfWork() {
    if (!this.unitOfWork) throw new Error('TaskStore is not initialized')
    return this.unitOfWork
  }

  private async hydratePostgresWorkspaceCache(task: Task) {
    if (!this.postgresState || !task.ownerUserId) return
    const root = this.workspacePath(task.id)
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    for (const file of await this.postgresState.listWorkspaceFiles(task)) {
      const target = path.join(root, file.path)
      assertWithin(root, target)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.content)
    }
  }

  private async hydratePostgresProjectCache(project: Project) {
    if (!this.postgresState || !project.ownerUserId) return
    const root = path.join(this.projectsRoot, project.id)
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    for (const file of project.files) {
      const stored = await this.postgresState.readProjectFile(project, project.ownerUserId, file.path).catch(() => undefined)
      if (!stored) continue
      const target = path.join(root, file.path)
      assertWithin(root, target)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, stored.content)
    }
  }

  private runtimeEventFromRecord(record: RuntimeEventRecord): RuntimeEvent {
    const payload = JSON.parse(record.payloadJson) as Record<string, unknown>
    return {
      id: record.id,
      taskId: record.conversationId,
      ...(record.runId ? { runId: record.runId } : {}),
      sequence: record.sequence,
      type: record.type as RuntimeEvent['type'],
      lane: record.lane as RuntimeEvent['lane'],
      ...(record.status ? { status: record.status as RuntimeEvent['status'] } : {}),
      ...(record.label ? { label: record.label } : {}),
      ...(record.content ? { content: record.content } : {}),
      payload,
      createdAt: record.createdAt,
      previousHash: record.previousHash,
      eventHash: record.eventHash,
    }
  }

  private readEventsFromDatabase(taskId: string): RuntimeEvent[] {
    if (this.postgresState) return this.events.get(taskId) ?? []
    return this.requireUnitOfWork().run((repositories) => repositories.runtimeEvents.listByConversation(taskId).map((record) => this.runtimeEventFromRecord(record)))
  }

  private toMessageRecord(message: ChatMessage, sequence: number): MessageRecord {
    return {
      id: message.id, conversationId: message.taskId, turnId: message.turnId, sequence, role: message.role,
      contentJson: JSON.stringify({ text: message.content, provider: message.provider, updatedAt: message.updatedAt }),
      revision: 0, status: message.status, createdAt: message.createdAt,
    }
  }

  private fromMessageRecord(task: Task, record: MessageRecord): ChatMessage {
    const content = JSON.parse(record.contentJson) as { text?: unknown; provider?: unknown; updatedAt?: unknown }
    return {
      id: record.id, taskId: record.conversationId, turnId: record.turnId ?? `legacy_turn_${record.sequence}`,
      role: record.role === 'tool' ? 'system' : record.role,
      content: typeof content.text === 'string' ? content.text : '', status: record.status,
      provider: content.provider === 'demo' || content.provider === 'claude_sdk' || content.provider === 'codex' || content.provider === 'onecomputer' || content.provider === 'remote' ? content.provider : task.provider,
      createdAt: record.createdAt, updatedAt: typeof content.updatedAt === 'string' ? content.updatedAt : record.createdAt,
    }
  }

  private fromPostgresMessage(task: Task, record: PostgresChatMessage): ChatMessage {
    const content = record.content && typeof record.content === 'object' && !Array.isArray(record.content) ? record.content as { text?: unknown; provider?: unknown; updatedAt?: unknown } : {}
    return {
      id: record.id, taskId: record.taskId, turnId: record.turnId ?? `legacy_turn_${record.sequence}`,
      role: record.role === 'tool' ? 'system' : record.role as ChatMessage['role'],
      content: typeof content.text === 'string' ? content.text : '', status: record.status as ChatMessage['status'],
      provider: content.provider === 'demo' || content.provider === 'claude_sdk' || content.provider === 'codex' || content.provider === 'agentcore' || content.provider === 'onecomputer' || content.provider === 'remote' ? content.provider : task.provider,
      createdAt: record.createdAt.toISOString(), updatedAt: typeof content.updatedAt === 'string' ? content.updatedAt : record.createdAt.toISOString(),
    }
  }

  private readMessages(task: Task): ChatMessage[] {
    if (this.postgresState) return this.messages.get(task.id) ?? []
    return this.requireUnitOfWork().run((repositories) => repositories.messages.listByConversation(task.id, -1, 500))
      .map((record) => this.fromMessageRecord(task, record))
  }

  private async importLegacyConversationState() {
    const unitOfWork = this.requireUnitOfWork()
    const state = unitOfWork.run((repositories) => repositories.idempotency.find('migration', 'task-store-json-v1'))
    if (state?.state === 'completed') return
    const requestHash = createHash('sha256').update('task-store-json-v1').digest('hex')
    if (!state) unitOfWork.run((repositories) => repositories.idempotency.claim('migration', 'task-store-json-v1', requestHash, new Date().toISOString()))
    const importer = new LegacyJsonImporter({
      legacyRoot: this.tasksRoot,
      unitOfWork,
      compatibility: {
        messagesFor: async ({ sourceDirectory, task }) => {
          const typedTask = task as unknown as Task
          let events: RuntimeEvent[] = []
          try { events = JSON.parse(await readFile(path.join(sourceDirectory, 'events.json'), 'utf8')) as RuntimeEvent[] } catch { /* no legacy events */ }
          return this.messagesFromLegacyEvents(typedTask, events)
        },
      },
    })
    const report = await importer.importAll()
    const fatal = report.quarantined.filter((item) => item.code === 'changed_source' || item.code === 'transaction_failed')
    if (fatal.length) throw new Error(`Legacy conversation import failed: ${fatal.map((item) => `${item.sourceId}: ${item.reason}`).join('; ')}`)
    unitOfWork.run((repositories) => repositories.idempotency.complete('migration', 'task-store-json-v1', JSON.stringify(report), new Date().toISOString()))
  }

  private async importLegacyEvents() {
    const unitOfWork = this.requireUnitOfWork()
    const key = 'task-store-events-v1'
    if (unitOfWork.run((repositories) => repositories.idempotency.find('migration', key)?.state === 'completed')) return
    const requestHash = createHash('sha256').update(key).digest('hex')
    unitOfWork.run((repositories) => {
      const state = repositories.idempotency.find('migration', key)
      if (!state) repositories.idempotency.claim('migration', key, requestHash, new Date().toISOString())
    })

    const entries = await readdir(this.tasksRoot, { withFileTypes: true })
    let imported = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const taskId = entry.name
      let legacyEvents: RuntimeEvent[]
      try {
        const parsed = JSON.parse(await readFile(path.join(this.tasksRoot, taskId, 'events.json'), 'utf8')) as unknown
        if (!Array.isArray(parsed)) continue
        legacyEvents = parsed as RuntimeEvent[]
      } catch {
        continue
      }
      if (!unitOfWork.run((repositories) => repositories.conversations.findById(taskId))) continue
      const added = unitOfWork.run((repositories) => {
        if (repositories.runtimeEvents.listByConversation(taskId).length > 0) return 0
        for (const event of legacyEvents) {
          if (!event || event.taskId !== taskId || !Number.isSafeInteger(event.sequence) || event.sequence < 0 || typeof event.payload !== 'object' || !event.payload) {
            throw new Error(`Legacy runtime event ${taskId} is invalid`)
          }
          repositories.runtimeEvents.append({
            id: event.id,
            conversationId: taskId,
            runId: event.runId ?? null,
            sequence: event.sequence,
            type: event.type,
            lane: event.lane,
            status: event.status ?? null,
            label: event.label ?? null,
            content: event.content ?? null,
            payloadJson: JSON.stringify(event.payload),
            createdAt: event.createdAt,
            previousHash: event.previousHash,
            eventHash: event.eventHash,
          })
        }
        return legacyEvents.length
      })
      imported += added
    }
    unitOfWork.run((repositories) => repositories.idempotency.complete('migration', key, JSON.stringify({ imported }), new Date().toISOString()))
  }

  private messagesFromLegacyEvents(task: Task, events: RuntimeEvent[]) {
    const messages: ChatMessage[] = []
    let assistant: ChatMessage | undefined
    for (const event of events) {
      if (event.type === 'user_message' && event.content) {
        const turnId = `legacy_turn_${event.sequence}`
        messages.push({ id: `legacy_message_${event.sequence}`, taskId: task.id, turnId, role: 'user', content: event.content, status: 'completed', provider: task.provider, createdAt: event.createdAt, updatedAt: event.createdAt })
        assistant = undefined
      }
      if (event.type === 'assistant_text_delta' && event.content) {
        if (!assistant) {
          const turnId = messages.at(-1)?.turnId ?? `legacy_turn_${event.sequence}`
          assistant = { id: `legacy_assistant_${event.sequence}`, taskId: task.id, turnId, role: 'assistant', content: '', status: 'completed', provider: task.provider, createdAt: event.createdAt, updatedAt: event.createdAt }
          messages.push(assistant)
        }
        assistant.content += event.content
        assistant.updatedAt = event.createdAt
      }
    }
    return messages
  }

}
