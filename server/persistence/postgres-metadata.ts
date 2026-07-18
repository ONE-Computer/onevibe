import postgres, { type Sql, type TransactionSql } from 'postgres'
import type { Project, Task, TaskMode, TaskSchedule } from '../types.js'
import { OptimisticConflictError, RecordNotFoundError } from './errors.js'

export type PostgresMetadataSql = Sql<Record<string, never>>
type MetadataTransaction = TransactionSql<Record<string, never>>

export type PostgresMetadataConfig = {
  readonly maxConnections?: number
  readonly connectTimeoutSeconds?: number
}

type ProjectRow = { id: string; owner_user_id: string; org_id: string | null; name: string; context: string; files_json: unknown; created_at: Date; updated_at: Date }
type TaskRow = {
  id: string; owner_user_id: string; org_id: string | null; conversation_id: string | null; project_id: string; title: string; prompt: string;
  provider: Task['provider']; mode: TaskMode; status: Task['status']; skills_json: unknown; tags_json: unknown;
  priority: string | null; board_status: string | null; labels_json: unknown; assigned_agent: string | null; epic_id: string | null; epic_label: string | null;
  queued_guidance_json: unknown; references_json: unknown; attachments_json: unknown; plan_json: unknown;
  security_context_json: unknown; approval_json: unknown; input_request_json: unknown; share_json: unknown;
  preview_path: string | null; library_hidden_at: Date | null; active_run_id: string | null; schedule_id: string | null;
  parent_task_id: string | null; forked_from_message_id: string | null; forked_at: Date | null; created_at: Date; updated_at: Date;
}
type ScheduleRow = { id: string; owner_user_id: string; project_id: string; name: string; prompt: string; provider: Task['provider']; mode: TaskMode; interval_minutes: number; enabled: boolean; next_run_at: Date; last_run_at: Date | null; created_at: Date; updated_at: Date }

const decodeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) as unknown } catch { return value }
}
const jsonArray = <T>(value: unknown, fallback: T[] = []): T[] => {
  const decoded = decodeJson(value)
  return Array.isArray(decoded) ? decoded as T[] : fallback
}
const jsonObject = <T>(value: unknown): T | undefined => {
  const decoded = decodeJson(value)
  return decoded && typeof decoded === 'object' && !Array.isArray(decoded) ? decoded as T : undefined
}
const projectMetadata = (project: Project) => JSON.stringify({ files: project.files, fileVersions: project.fileVersions ?? {} })

const projectFromRow = (row: ProjectRow): Project => {
  const stored = jsonObject<{ files?: unknown; fileVersions?: unknown }>(row.files_json)
  return {
  id: row.id,
  ownerUserId: row.owner_user_id,
  ...(row.org_id ? { organizationId: row.org_id } : {}),
  name: row.name,
  context: row.context,
  files: jsonArray(stored?.files ?? row.files_json),
  ...(stored?.fileVersions && typeof stored.fileVersions === 'object' && !Array.isArray(stored.fileVersions) ? { fileVersions: stored.fileVersions as Project['fileVersions'] } : {}),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  }
}

const taskFromRow = (row: TaskRow): Task => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  ...(row.org_id ? { organizationId: row.org_id } : {}),
  title: row.title,
  prompt: row.prompt,
  provider: row.provider,
  mode: row.mode,
  skills: jsonArray(row.skills_json),
  tags: jsonArray(row.tags_json),
  ...(row.priority ? { priority: row.priority as Task['priority'] } : {}),
  ...(row.board_status ? { boardStatus: row.board_status as Task['boardStatus'] } : {}),
  ...(jsonArray<string>(row.labels_json).length ? { labels: jsonArray<string>(row.labels_json) } : {}),
  ...(row.assigned_agent ? { assignedAgent: row.assigned_agent } : {}),
  ...(row.epic_id ? { epicId: row.epic_id } : {}),
  ...(row.epic_label ? { epicLabel: row.epic_label } : {}),
  queuedGuidance: jsonArray(row.queued_guidance_json),
  projectId: row.project_id,
  ...(row.parent_task_id ? { parentTaskId: row.parent_task_id } : {}),
  ...(row.forked_from_message_id ? { forkedFromMessageId: row.forked_from_message_id } : {}),
  ...(row.forked_at ? { forkedAt: row.forked_at.toISOString() } : {}),
  ...(row.schedule_id ? { scheduleId: row.schedule_id } : {}),
  references: jsonArray(row.references_json),
  attachments: jsonArray(row.attachments_json),
  status: row.status,
  ...(row.active_run_id ? { activeRunId: row.active_run_id } : {}),
  plan: jsonArray(row.plan_json),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  ...(row.library_hidden_at ? { libraryHiddenAt: row.library_hidden_at.toISOString() } : {}),
  ...(row.preview_path ? { previewPath: row.preview_path } : {}),
  ...(jsonObject<Task['securityContext']>(row.security_context_json) ? { securityContext: jsonObject<Task['securityContext']>(row.security_context_json) } : {}),
  ...(jsonObject<Task['approval']>(row.approval_json) ? { approval: jsonObject<Task['approval']>(row.approval_json) } : {}),
  ...(jsonObject<Task['inputRequest']>(row.input_request_json) ? { inputRequest: jsonObject<Task['inputRequest']>(row.input_request_json) } : {}),
  ...(jsonObject<Task['share']>(row.share_json) ? { share: jsonObject<Task['share']>(row.share_json) } : {}),
})

const scheduleFromRow = (row: ScheduleRow): TaskSchedule => ({
  id: row.id, ownerUserId: row.owner_user_id, projectId: row.project_id, name: row.name, prompt: row.prompt,
  provider: row.provider, mode: row.mode, intervalMinutes: row.interval_minutes, enabled: row.enabled,
  nextRunAt: row.next_run_at.toISOString(), ...(row.last_run_at ? { lastRunAt: row.last_run_at.toISOString() } : {}),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
})

const json = (value: unknown) => JSON.stringify(value ?? null)
const date = (value: string | undefined) => value ? new Date(value) : null

const requireProject = async (sql: PostgresMetadataSql | MetadataTransaction, projectId: string, ownerUserId: string) => {
  const rows = await sql<{ id: string; org_id: string | null }[]>`SELECT id, org_id FROM project WHERE id = ${projectId} AND owner_user_id = ${ownerUserId} FOR UPDATE`
  if (!rows[0]) throw new RecordNotFoundError(`Project ${projectId} does not exist for this owner`)
  return rows[0]
}

const taskValues = (task: Task) => ({
  id: task.id, ownerUserId: task.ownerUserId!, organizationId: task.organizationId ?? null, conversationId: task.id, projectId: task.projectId, title: task.title, prompt: task.prompt,
  provider: task.provider, mode: task.mode, status: task.status, skills: json(task.skills), tags: json(task.tags), queuedGuidance: json(task.queuedGuidance),
  priority: task.priority ?? null, boardStatus: task.boardStatus ?? null, labels: json(task.labels ?? []), assignedAgent: task.assignedAgent ?? null, epicId: task.epicId ?? null, epicLabel: task.epicLabel ?? null,
  references: json(task.references), attachments: json(task.attachments), plan: json(task.plan), securityContext: json(task.securityContext), approval: json(task.approval),
  inputRequest: json(task.inputRequest), share: json(task.share), previewPath: task.previewPath ?? null, libraryHiddenAt: date(task.libraryHiddenAt),
  activeRunId: task.activeRunId ?? null, scheduleId: task.scheduleId ?? null, parentTaskId: task.parentTaskId ?? null,
  forkedFromMessageId: task.forkedFromMessageId ?? null, forkedAt: date(task.forkedAt), createdAt: new Date(task.createdAt), updatedAt: new Date(task.updatedAt),
})

export class PostgresMetadataRepository {
  constructor(private readonly sql: PostgresMetadataSql) {}

  async load(ownerUserId?: string): Promise<{ projects: Project[]; tasks: Task[]; schedules: TaskSchedule[] }> {
    const projects = await this.sql<ProjectRow[]>`
      SELECT id, owner_user_id, org_id, name, context, files_json, created_at, updated_at FROM project
      ${ownerUserId ? this.sql`WHERE owner_user_id = ${ownerUserId}` : this.sql``}
      ORDER BY updated_at DESC, id DESC
    `
    const tasks = await this.sql<TaskRow[]>`
      SELECT id, owner_user_id, org_id, conversation_id, project_id, title, prompt, provider, mode, status, skills_json, tags_json,
        priority, board_status, labels_json, assigned_agent, epic_id, epic_label,
        queued_guidance_json, references_json, attachments_json, plan_json, security_context_json, approval_json, input_request_json,
        share_json, preview_path, library_hidden_at, active_run_id, schedule_id, parent_task_id, forked_from_message_id, forked_at, created_at, updated_at
      FROM task
      ${ownerUserId ? this.sql`WHERE owner_user_id = ${ownerUserId}` : this.sql``}
      ORDER BY updated_at DESC, id DESC
    `
    const schedules = await this.sql<ScheduleRow[]>`
      SELECT id, owner_user_id, project_id, name, prompt, provider, mode, interval_minutes, enabled, next_run_at, last_run_at, created_at, updated_at
      FROM schedule
      ${ownerUserId ? this.sql`WHERE owner_user_id = ${ownerUserId}` : this.sql``}
      ORDER BY next_run_at ASC, id ASC
    `
    return { projects: projects.map(projectFromRow), tasks: tasks.map(taskFromRow), schedules: schedules.map(scheduleFromRow) }
  }

  async insertProject(project: Project): Promise<void> {
    if (!project.ownerUserId) throw new Error('Postgres projects require an owner')
    await this.sql`
      INSERT INTO project (id, owner_user_id, org_id, name, context, files_json, created_at, updated_at)
      VALUES (${project.id}, ${project.ownerUserId}, ${project.organizationId ?? null}, ${project.name}, ${project.context}, ${projectMetadata(project)}::jsonb, ${new Date(project.createdAt)}, ${new Date(project.updatedAt)})
    `
  }

  async updateProject(project: Project, expectedUpdatedAt: string): Promise<void> {
    if (!project.ownerUserId) throw new Error('Postgres projects require an owner')
    const result = await this.sql`
      UPDATE project SET name = ${project.name}, context = ${project.context}, files_json = ${projectMetadata(project)}::jsonb, updated_at = ${new Date(project.updatedAt)}
      WHERE id = ${project.id} AND owner_user_id = ${project.ownerUserId} AND updated_at = ${new Date(expectedUpdatedAt)}
    `
    if (result.count === 1) return
    const existing = await this.sql<{ id: string }[]>`SELECT id FROM project WHERE id = ${project.id}`
    if (!existing[0]) throw new RecordNotFoundError(`Project ${project.id} does not exist`)
    throw new OptimisticConflictError(`Project ${project.id} was modified concurrently`)
  }

  async insertTask(task: Task): Promise<void> {
    const values = taskValues(task)
    const ownerUserId = task.ownerUserId
    if (!ownerUserId) throw new Error('Postgres tasks require an owner')
    await this.sql.begin(async (tx) => {
      const project = await requireProject(tx, task.projectId, ownerUserId)
      if ((project.org_id ?? undefined) !== task.organizationId) throw new Error(`Task ${task.id} organization does not match project ${task.projectId}`)
      await tx`
        INSERT INTO conversation (id, owner_user_id, title, status, created_at, updated_at)
        VALUES (${task.id}, ${ownerUserId}, ${task.title}, 'active', ${values.createdAt}, ${values.updatedAt})
      `
      await tx`
        INSERT INTO task (
          id, owner_user_id, org_id, conversation_id, project_id, title, prompt, provider, mode, status, skills_json, tags_json,
          priority, board_status, labels_json, assigned_agent, epic_id, epic_label,
          queued_guidance_json, references_json, attachments_json, plan_json, security_context_json, approval_json,
          input_request_json, share_json, preview_path, library_hidden_at, active_run_id, schedule_id, parent_task_id,
          forked_from_message_id, forked_at, created_at, updated_at
        ) VALUES (
          ${values.id}, ${values.ownerUserId}, ${values.organizationId}, ${values.conversationId}, ${values.projectId}, ${values.title}, ${values.prompt}, ${values.provider}, ${values.mode}, ${values.status},
          ${values.skills}::jsonb, ${values.tags}::jsonb, ${values.priority}, ${values.boardStatus}, ${values.labels}::jsonb, ${values.assignedAgent}, ${values.epicId}, ${values.epicLabel}, ${values.queuedGuidance}::jsonb, ${values.references}::jsonb, ${values.attachments}::jsonb,
          ${values.plan}::jsonb, ${values.securityContext}::jsonb, ${values.approval}::jsonb, ${values.inputRequest}::jsonb, ${values.share}::jsonb,
          ${values.previewPath}, ${values.libraryHiddenAt}, ${values.activeRunId}, ${values.scheduleId}, ${values.parentTaskId}, ${values.forkedFromMessageId}, ${values.forkedAt}, ${values.createdAt}, ${values.updatedAt}
        )
      `
    })
  }

  async updateTask(task: Task, expectedUpdatedAt: string): Promise<void> {
    const values = taskValues(task)
    const result = await this.sql`
      UPDATE task SET title = ${values.title}, prompt = ${values.prompt}, provider = ${values.provider}, mode = ${values.mode}, status = ${values.status},
        skills_json = ${values.skills}::jsonb, tags_json = ${values.tags}::jsonb, priority = ${values.priority}, board_status = ${values.boardStatus}, labels_json = ${values.labels}::jsonb, assigned_agent = ${values.assignedAgent}, epic_id = ${values.epicId}, epic_label = ${values.epicLabel}, queued_guidance_json = ${values.queuedGuidance}::jsonb,
        references_json = ${values.references}::jsonb, attachments_json = ${values.attachments}::jsonb, plan_json = ${values.plan}::jsonb,
        security_context_json = ${values.securityContext}::jsonb, approval_json = ${values.approval}::jsonb, input_request_json = ${values.inputRequest}::jsonb,
        share_json = ${values.share}::jsonb, preview_path = ${values.previewPath}, library_hidden_at = ${values.libraryHiddenAt}, active_run_id = ${values.activeRunId},
        schedule_id = ${values.scheduleId}, parent_task_id = ${values.parentTaskId}, forked_from_message_id = ${values.forkedFromMessageId}, forked_at = ${values.forkedAt}, updated_at = ${values.updatedAt}
      WHERE id = ${task.id} AND owner_user_id = ${values.ownerUserId} AND updated_at = ${new Date(expectedUpdatedAt)}
    `
    if (result.count === 1) return
    const existing = await this.sql<{ id: string }[]>`SELECT id FROM task WHERE id = ${task.id}`
    if (!existing[0]) throw new RecordNotFoundError(`Task ${task.id} does not exist`)
    throw new OptimisticConflictError(`Task ${task.id} was modified concurrently`)
  }

  async insertSchedule(schedule: TaskSchedule): Promise<void> {
    if (!schedule.ownerUserId) throw new Error('Postgres schedules require an owner')
    await this.sql`
      INSERT INTO schedule (id, owner_user_id, project_id, name, prompt, provider, mode, interval_minutes, enabled, next_run_at, last_run_at, created_at, updated_at)
      VALUES (${schedule.id}, ${schedule.ownerUserId}, ${schedule.projectId}, ${schedule.name}, ${schedule.prompt}, ${schedule.provider}, ${schedule.mode}, ${schedule.intervalMinutes}, ${schedule.enabled}, ${new Date(schedule.nextRunAt)}, ${date(schedule.lastRunAt)}, ${new Date(schedule.createdAt)}, ${new Date(schedule.updatedAt)})
    `
  }

  async updateSchedule(schedule: TaskSchedule, expectedUpdatedAt: string): Promise<void> {
    if (!schedule.ownerUserId) throw new Error('Postgres schedules require an owner')
    const result = await this.sql`
      UPDATE schedule SET name = ${schedule.name}, prompt = ${schedule.prompt}, provider = ${schedule.provider}, mode = ${schedule.mode}, project_id = ${schedule.projectId},
        interval_minutes = ${schedule.intervalMinutes}, enabled = ${schedule.enabled}, next_run_at = ${new Date(schedule.nextRunAt)}, last_run_at = ${date(schedule.lastRunAt)}, updated_at = ${new Date(schedule.updatedAt)}
      WHERE id = ${schedule.id} AND owner_user_id = ${schedule.ownerUserId} AND updated_at = ${new Date(expectedUpdatedAt)}
    `
    if (result.count === 1) return
    const existing = await this.sql<{ id: string }[]>`SELECT id FROM schedule WHERE id = ${schedule.id}`
    if (!existing[0]) throw new RecordNotFoundError(`Schedule ${schedule.id} does not exist`)
    throw new OptimisticConflictError(`Schedule ${schedule.id} was modified concurrently`)
  }

  async deleteSchedule(id: string, ownerUserId: string): Promise<void> {
    const result = await this.sql`DELETE FROM schedule WHERE id = ${id} AND owner_user_id = ${ownerUserId}`
    if (result.count !== 1) throw new RecordNotFoundError(`Schedule ${id} does not exist`)
  }
}

export const createPostgresMetadataRepository = (databaseUrl: string, config: PostgresMetadataConfig = {}) => {
  const sql = postgres(databaseUrl, { max: config.maxConnections ?? 4, connect_timeout: config.connectTimeoutSeconds ?? 5, prepare: false })
  return { repository: new PostgresMetadataRepository(sql as PostgresMetadataSql), close: () => sql.end({ timeout: 5 }) }
}
