import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { inArray } from 'drizzle-orm'
import * as schema from '../server/db/schema.js'
import { validateImportRelationships, type OwnedProjectRow, type OwnedScheduleRow, type OwnedTaskRow } from '../server/persistence/import-validation.js'
import { TaskStore } from '../server/store.js'
import type { ChatMessage, Project, Task, TaskSchedule } from '../server/types.js'

type ImportOptions = { dataRoot: string; ownerUserId?: string; dryRun: boolean }

const parseOptions = (argv: string[]): ImportOptions => {
  const value = (name: string) => {
    const index = argv.indexOf(name)
    return index >= 0 ? argv[index + 1] : undefined
  }
  const dataRoot = value('--data-root') ?? process.env.ONEVIBE_DATA_DIR ?? '.onevibe'
  const ownerUserId = value('--owner-user-id') ?? process.env.ONEVIBE_IMPORT_OWNER_USER_ID
  return { dataRoot: path.resolve(dataRoot), ownerUserId, dryRun: argv.includes('--dry-run') }
}

const ownerFor = (record: { ownerUserId?: string | null }, options: ImportOptions, kind: string, id: string) => {
  if (record.ownerUserId && options.ownerUserId && record.ownerUserId !== options.ownerUserId) throw new Error(`${kind} ${id} belongs to ${record.ownerUserId}, not the requested import owner`)
  const owner = record.ownerUserId ?? options.ownerUserId
  if (!owner) throw new Error(`${kind} ${id} has no owner; pass --owner-user-id only after confirming the legacy data belongs to that user`)
  return owner
}

const date = (value: string | undefined | null) => value ? new Date(value) : null
const messageContent = (message: ChatMessage) => ({ text: message.content, provider: message.provider, updatedAt: message.updatedAt })

const run = async () => {
  const options = parseOptions(process.argv.slice(2))
  const store = new TaskStore(options.dataRoot)
  await store.initialize()
  const projects = store.listProjects()
  const tasks = store.listTasks()
  const schedules = store.listSchedules()
  const mcpConfigs = store.listMcpConfigs()
  const skillInstallations = store.listSkillInstallationRecords()
  const organizations = store.listOrganizationsForImport()
  const owners = new Set<string>()
  const projectRows: OwnedProjectRow[] = projects.map((project: Project) => { const ownerUserId = ownerFor(project, options, 'Project', project.id); owners.add(ownerUserId); return { project, ownerUserId } })
  const taskRows: OwnedTaskRow[] = tasks.map((task: Task) => { const ownerUserId = ownerFor(task, options, 'Task', task.id); owners.add(ownerUserId); return { task, ownerUserId } })
  const scheduleRows: OwnedScheduleRow[] = schedules.map((schedule: TaskSchedule) => { const ownerUserId = ownerFor(schedule, options, 'Schedule', schedule.id); owners.add(ownerUserId); return { schedule, ownerUserId } })
  const mcpRows = mcpConfigs.map((config) => { const ownerUserId = ownerFor(config, options, 'MCP config', config.id); owners.add(ownerUserId); return { config, ownerUserId } })
  const skillRows = skillInstallations.map((skill) => { const ownerUserId = ownerFor(skill, options, 'Skill installation', skill.id); owners.add(ownerUserId); return { skill, ownerUserId } })
  validateImportRelationships(projectRows, taskRows, scheduleRows)

  const organizationMemberUserIds = [...new Set(organizations.flatMap(({ members }) => members.map((member) => member.userId)))]
  const counts = { organizations: organizations.length, organizationMembers: organizationMemberUserIds.length, projects: projectRows.length, tasks: taskRows.length, schedules: scheduleRows.length, mcpConfigs: mcpRows.length, skillInstallations: skillRows.length, messages: 0, events: 0, nativeEvents: 0, versions: 0 }
  for (const { task } of taskRows) {
    counts.messages += store.listMessages(task.id, { limit: 200 }).messages.length
    counts.events += store.listEvents(task.id).length
    counts.nativeEvents += store.listNativeEvents(task.id).length
    counts.versions += (await store.listWorkspaceVersions(task.id)).length
  }
  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, dataRoot: options.dataRoot, owners: [...owners], counts }, null, 2))
    return
  }
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required unless --dry-run is used')
  if (owners.size !== 1) throw new Error(`Import requires exactly one explicit owner for this first migration; found ${owners.size}`)
  const ownerUserId = [...owners][0]!
  const client = postgres(databaseUrl, { max: 1, prepare: false })
  const db = drizzle(client, { schema })
  try {
    const requiredUserIds = [...new Set([ownerUserId, ...organizationMemberUserIds])]
    const existingUsers = await db.select({ id: schema.user.id }).from(schema.user).where(inArray(schema.user.id, requiredUserIds))
    const existingUserIds = new Set(existingUsers.map((user) => user.id))
    const missingUserId = requiredUserIds.find((userId) => !existingUserIds.has(userId))
    if (missingUserId) throw new Error(`Postgres user ${missingUserId} does not exist; create the Better Auth user first`)
    await db.transaction(async (tx) => {
      if (organizations.length) await tx.insert(schema.org).values(organizations.map(({ organization }) => ({
        id: organization.id, name: organization.name, createdAt: new Date(organization.createdAt), updatedAt: new Date(organization.updatedAt),
      }))).onConflictDoNothing()
      if (organizationMemberUserIds.length) await tx.insert(schema.orgMember).values(organizations.flatMap(({ members }) => members.map((member) => ({
        orgId: member.organizationId, userId: member.userId, role: member.role, createdAt: new Date(member.createdAt),
      })))).onConflictDoNothing()
      if (projectRows.length) await tx.insert(schema.project).values(projectRows.map(({ project, ownerUserId: owner }) => ({
        id: project.id, ownerUserId: owner, name: project.name, context: project.context, filesJson: project.files, createdAt: new Date(project.createdAt), updatedAt: new Date(project.updatedAt),
      }))).onConflictDoNothing()
      if (taskRows.length) await tx.insert(schema.task).values(taskRows.map(({ task, ownerUserId: owner }) => ({
        id: task.id, ownerUserId: owner, projectId: task.projectId, title: task.title, prompt: task.prompt, provider: task.provider, mode: task.mode, status: task.status,
        skillsJson: task.skills, tagsJson: task.tags, queuedGuidanceJson: task.queuedGuidance, referencesJson: task.references, attachmentsJson: task.attachments, planJson: task.plan,
        securityContextJson: task.securityContext ?? null, approvalJson: task.approval ?? null, inputRequestJson: task.inputRequest ?? null, shareJson: task.share ?? null,
        previewPath: task.previewPath ?? null, libraryHiddenAt: date(task.libraryHiddenAt), activeRunId: task.activeRunId ?? null, scheduleId: task.scheduleId ?? null,
        createdAt: new Date(task.createdAt), updatedAt: new Date(task.updatedAt),
      }))).onConflictDoNothing()
      if (scheduleRows.length) await tx.insert(schema.schedule).values(scheduleRows.map(({ schedule, ownerUserId: owner }) => ({
        id: schedule.id, ownerUserId: owner, projectId: schedule.projectId, name: schedule.name, prompt: schedule.prompt, provider: schedule.provider, mode: schedule.mode,
        intervalMinutes: schedule.intervalMinutes, enabled: schedule.enabled, nextRunAt: new Date(schedule.nextRunAt), lastRunAt: date(schedule.lastRunAt), createdAt: new Date(schedule.createdAt), updatedAt: new Date(schedule.updatedAt),
      }))).onConflictDoNothing()
      if (mcpRows.length) await tx.insert(schema.runtimeMcpConfig).values(mcpRows.map(({ config, ownerUserId: owner }) => ({
        id: config.id, ownerUserId: owner, name: config.name, command: config.command, argsJson: config.args, createdAt: new Date(config.createdAt), updatedAt: new Date(config.updatedAt),
      }))).onConflictDoNothing()
      if (skillRows.length) await tx.insert(schema.skillInstallation).values(skillRows.map(({ skill, ownerUserId: owner }) => ({
        id: skill.id, ownerScope: owner, ownerUserId: owner, version: skill.version, title: skill.title, summary: skill.summary,
        sha256: skill.sha256, content: skill.content, contentUrl: skill.contentUrl, sourceUrl: skill.sourceUrl,
        createdAt: new Date(skill.createdAt), updatedAt: new Date(skill.updatedAt),
      }))).onConflictDoNothing()

      for (const { task } of taskRows) {
        const messages = store.listMessages(task.id, { limit: 200 }).messages
        const turns = new Map<string, { id: string; ordinal: number; status: string; createdAt: Date; startedAt: Date; completedAt: Date | null }>()
        for (const message of messages) {
          const current = turns.get(message.turnId) ?? { id: message.turnId, ordinal: turns.size, status: 'completed', createdAt: new Date(message.createdAt), startedAt: new Date(message.createdAt), completedAt: new Date(message.updatedAt) }
          if (message.status === 'failed') current.status = 'failed'
          if (message.status === 'cancelled') current.status = 'cancelled'
          current.completedAt = new Date(Math.max(current.completedAt?.getTime() ?? 0, new Date(message.updatedAt).getTime()))
          turns.set(message.turnId, current)
        }
        if (turns.size) await tx.insert(schema.turn).values([...turns.values()].map((turn) => ({ id: turn.id, taskId: task.id, clientRequestId: turn.id, ordinal: turn.ordinal, status: turn.status, createdAt: turn.createdAt, startedAt: turn.startedAt, completedAt: turn.completedAt }))).onConflictDoNothing()
        if (messages.length) await tx.insert(schema.message).values(messages.map((message, sequence) => ({ id: message.id, taskId: task.id, turnId: message.turnId, sequence, role: message.role, contentJson: messageContent(message), revision: 0, status: message.status, createdAt: new Date(message.createdAt) }))).onConflictDoNothing()
        const events = store.listEvents(task.id)
        if (events.length) await tx.insert(schema.runtimeEvent).values(events.map((event) => ({ id: event.id, taskId: task.id, runId: event.runId ?? null, sequence: event.sequence, type: event.type, lane: event.lane, status: event.status ?? null, label: event.label ?? null, content: event.content ?? null, payloadJson: event.payload, createdAt: new Date(event.createdAt), previousHash: event.previousHash, eventHash: event.eventHash }))).onConflictDoNothing()
        const nativeEvents = store.listNativeEvents(task.id)
        if (nativeEvents.length) await tx.insert(schema.nativeEvent).values(nativeEvents.map((event) => ({ id: event.id, taskId: task.id, runId: event.runId, source: event.source, sourceEventId: event.sourceEventId, sourceSequence: event.sourceSequence, nativeType: event.nativeType, payloadJson: JSON.parse(event.payloadJson), payloadHash: event.payloadHash, receivedAt: new Date(event.receivedAt) }))).onConflictDoNothing()
        const versions = await store.listWorkspaceVersions(task.id)
        if (versions.length) await tx.insert(schema.workspaceVersion).values(versions.map((version) => ({ id: version.id, taskId: task.id, label: version.label, fileCount: version.fileCount, evidenceHash: version.evidenceHash, createdAt: new Date(version.createdAt) }))).onConflictDoNothing()
      }
    })
    console.log(JSON.stringify({ imported: true, ownerUserId, counts }, null, 2))
  } finally {
    await client.end({ timeout: 5 })
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
