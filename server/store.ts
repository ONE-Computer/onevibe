import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { ChatMessage, EventInput, PresentationDescriptor, Project, RuntimeEvent, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill, TaskSnapshot, WorkspaceFile, WorkspaceVersion } from './types.js'

const DEFAULT_DATA_ROOT = path.resolve(process.env.ONEVIBE_DATA_DIR ?? '.onevibe')

const assertWithin = (root: string, candidate: string) => {
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path escapes configured workspace root')
}

const writeJson = async (filePath: string, value: unknown) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

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
  if (artifactPath?.toLowerCase().endsWith('.pptx')) return { panel: 'slide', uri, artifactPath }
  if (uri) return { panel: 'preview', uri, artifactPath }
  return { panel: 'file', artifactPath }
}

const planFor = (mode: TaskMode, prompt: string): Task['plan'] => {
  const middle: Record<TaskMode, [string, string, string]> = {
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

  constructor(dataRoot = DEFAULT_DATA_ROOT) {
    const resolvedRoot = path.resolve(dataRoot)
    this.tasksRoot = path.join(resolvedRoot, 'tasks')
    this.workspacesRoot = path.join(resolvedRoot, 'workspaces')
    this.runtimeRoot = path.join(resolvedRoot, 'runtime')
    this.versionsRoot = path.join(resolvedRoot, 'versions')
    this.projectsRoot = path.join(resolvedRoot, 'projects')
    this.projectsFile = path.join(resolvedRoot, 'projects.json')
    this.schedulesFile = path.join(resolvedRoot, 'schedules.json')
  }

  async initialize() {
    await mkdir(this.tasksRoot, { recursive: true })
    await mkdir(this.workspacesRoot, { recursive: true })
    await mkdir(this.runtimeRoot, { recursive: true })
    await mkdir(this.versionsRoot, { recursive: true })
    await mkdir(this.projectsRoot, { recursive: true })
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
    const entries = await readdir(this.tasksRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const task = JSON.parse(await readFile(path.join(this.tasksRoot, entry.name, 'task.json'), 'utf8')) as Task
        task.mode ??= 'general'
        task.skills ??= []
        task.queuedGuidance ??= []
        task.projectId ??= 'project_onevibe'
        task.references ??= []
        task.attachments ??= []
        const eventFile = path.join(this.tasksRoot, entry.name, 'events.json')
        let storedEvents: RuntimeEvent[] = []
        try {
          storedEvents = JSON.parse(await readFile(eventFile, 'utf8')) as RuntimeEvent[]
        } catch {
          storedEvents = []
        }
        this.tasks.set(task.id, task)
        this.events.set(task.id, storedEvents)
        const messageFile = path.join(this.tasksRoot, entry.name, 'messages.json')
        let storedMessages: ChatMessage[] = []
        try { storedMessages = JSON.parse(await readFile(messageFile, 'utf8')) as ChatMessage[] } catch { storedMessages = this.messagesFromLegacyEvents(task, storedEvents) }
        this.messages.set(task.id, storedMessages)
        if (storedMessages.length && !await this.fileExists(messageFile)) await writeJson(messageFile, storedMessages)
      } catch {
        // Ignore incomplete local-demo records. Production storage must fail closed.
      }
    }
    for (const [id, project] of this.projects) {
      project.files ??= []
      this.projects.set(id, project)
    }
  }

  async createTask(prompt: string, provider: Task['provider'], mode: TaskMode = 'general', projectId = 'project_onevibe', scheduleId?: string, references: string[] = [], attachments: TaskAttachment[] = [], skills: TaskSkill[] = []): Promise<Task> {
    if (!this.projects.has(projectId)) throw new Error('Project not found')
    const now = new Date().toISOString()
    const id = `task_${randomUUID().replaceAll('-', '').slice(0, 14)}`
    const task: Task = {
      id,
      title: prompt.length > 56 ? `${prompt.slice(0, 53).trim()}…` : prompt,
      prompt,
      provider,
      mode,
      skills,
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
    this.tasks.set(id, task)
    this.events.set(id, [])
    this.messages.set(id, [])
    await this.persist(task)
    return task
  }

  listTasks() {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async listLibrary() {
    const completed = this.listTasks().filter((task) => task.status === 'completed')
    return Promise.all(completed.map(async (task) => ({
      task,
      files: (await this.listWorkspaceFiles(task.id)).filter((file) => !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/')),
    })))
  }

  listProjects() { return [...this.projects.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }

  getProject(id: string) {
    const project = this.projects.get(id)
    if (!project) throw new Error('Project not found')
    return project
  }

  async createProject(name: string, context = ''): Promise<Project> {
    const now = new Date().toISOString()
    const project = { id: `project_${randomUUID().replaceAll('-', '').slice(0, 12)}`, name, context, files: [], createdAt: now, updatedAt: now }
    this.projects.set(project.id, project)
    await this.persistProjects()
    return project
  }

  async addProjectFile(projectId: string, input: { name: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId)
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
    this.projects.set(projectId, updated)
    await this.persistProjects()
    return updated
  }

  async projectContextFiles(projectId: string) {
    const project = this.getProject(projectId)
    const chunks: string[] = []
    let remaining = 12_000
    for (const file of project.files) {
      if (remaining <= 0 || !/^(?:text\/|application\/(?:json|yaml|xml))/.test(file.mimeType) && !/\.(?:md|txt|json|ya?ml|csv|xml)$/i.test(file.name)) continue
      const target = path.join(this.projectsRoot, project.id, file.path)
      assertWithin(path.join(this.projectsRoot, project.id), target)
      const raw = await readFile(target, 'utf8').catch(() => '')
      const content = raw.slice(0, Math.min(4_000, remaining))
      if (!content) continue
      chunks.push(`--- ${file.name} (untrusted project knowledge) ---\n${content}`)
      remaining -= content.length
    }
    return chunks
  }

  listSchedules() { return [...this.schedules.values()].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)) }

  async createSchedule(input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>): Promise<TaskSchedule> {
    if (!this.projects.has(input.projectId)) throw new Error('Project not found')
    const now = new Date().toISOString()
    const schedule: TaskSchedule = { id: `schedule_${randomUUID().replaceAll('-', '').slice(0, 12)}`, ...input, enabled: true, nextRunAt: new Date(Date.now() + input.intervalMinutes * 60_000).toISOString(), createdAt: now, updatedAt: now }
    this.schedules.set(schedule.id, schedule)
    await this.persistSchedules()
    return schedule
  }

  async setScheduleEnabled(id: string, enabled: boolean) {
    const current = this.schedules.get(id)
    if (!current) throw new Error('Schedule not found')
    const updated = { ...current, enabled, updatedAt: new Date().toISOString(), ...(enabled && current.nextRunAt < new Date().toISOString() ? { nextRunAt: new Date().toISOString() } : {}) }
    this.schedules.set(id, updated)
    await this.persistSchedules()
    return updated
  }

  async claimScheduleNow(id: string, now = new Date()) {
    const schedule = this.schedules.get(id)
    if (!schedule) throw new Error('Schedule not found')
    if (!schedule.enabled) throw new Error('Schedule is paused')
    const updated = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: new Date(now.getTime() + schedule.intervalMinutes * 60_000).toISOString(), updatedAt: now.toISOString() }
    this.schedules.set(id, updated)
    await this.persistSchedules()
    return updated
  }

  async claimDueSchedules(now = new Date()) {
    const due = this.listSchedules().filter((schedule) => schedule.enabled && schedule.nextRunAt <= now.toISOString())
    for (const schedule of due) {
      const updated = { ...schedule, lastRunAt: now.toISOString(), nextRunAt: new Date(now.getTime() + schedule.intervalMinutes * 60_000).toISOString(), updatedAt: now.toISOString() }
      this.schedules.set(schedule.id, updated)
    }
    if (due.length) await this.persistSchedules()
    return due
  }

  getTask(id: string) {
    const task = this.tasks.get(id)
    if (!task) throw new Error('Task not found')
    return task
  }

  findTaskByApproval(approvalId: string) {
    const task = [...this.tasks.values()].find((candidate) => candidate.approval?.id === approvalId)
    if (!task) throw new Error('Approval not found')
    return task
  }

  findTaskByShare(shareId: string) {
    const task = [...this.tasks.values()].find((candidate) => candidate.share?.id === shareId)
    if (!task) throw new Error('Share not found')
    return task
  }

  async updateTask(id: string, patch: Partial<Task>) {
    const current = this.getTask(id)
    const updated = { ...current, ...patch, id: current.id, updatedAt: new Date().toISOString() }
    this.tasks.set(id, updated)
    await this.persist(updated)
    return updated
  }

  async queueGuidance(taskId: string, prompt: string) {
    const task = this.getTask(taskId)
    if (task.queuedGuidance.length >= 8) throw new Error('Task already has the maximum of 8 queued guidance messages')
    const guidance = { id: `guidance_${randomUUID().replaceAll('-', '').slice(0, 12)}`, prompt, createdAt: new Date().toISOString() }
    await this.updateTask(taskId, { queuedGuidance: [...task.queuedGuidance, guidance] })
    await this.appendEvent(taskId, {
      type: 'guidance_queued', lane: 'control', label: 'Guidance queued for next turn',
      content: 'The current provider turn is non-interruptible; this guidance will resume the same task immediately after it reaches a terminal state.',
      payload: { guidanceId: guidance.id, promptLength: prompt.length, appliesAfterRun: task.activeRunId },
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

  async appendEvent(taskId: string, input: EventInput) {
    const existing = this.events.get(taskId) ?? []
    const runId = this.getTask(taskId).activeRunId
    const previousHash = existing.at(-1)?.eventHash ?? 'GENESIS'
    const presentation = panelFor(input)
    const unsigned = {
      taskId,
      ...(runId ? { runId } : {}),
      sequence: existing.length,
      type: input.type,
      lane: input.lane,
      status: input.status,
      label: input.label,
      content: input.content,
      payload: { ...input.payload, ...(presentation ? { presentation } : {}) },
      createdAt: new Date().toISOString(),
      previousHash,
    }
    const eventHash = createHash('sha256').update(JSON.stringify(unsigned)).digest('hex')
    const event: RuntimeEvent = { id: `${taskId}:event:${existing.length}`, ...unsigned, eventHash }
    existing.push(event)
    this.events.set(taskId, existing)
    await writeJson(path.join(this.tasksRoot, taskId, 'events.json'), existing)
    if (input.type === 'assistant_text_delta' && input.content) await this.appendAssistantDelta(taskId, input.content)
    if (input.type === 'run_completed') await this.finishTurn(taskId, 'completed')
    if (input.type === 'run_failed') await this.finishTurn(taskId, 'failed')
    if (input.type === 'run_cancelled') await this.finishTurn(taskId, 'cancelled')
    this.emitter.emit(taskId, event)
    return event
  }

  listEvents(taskId: string) {
    return this.events.get(taskId) ?? []
  }

  async beginTurn(taskId: string, content: string, provider: Task['provider']) {
    const now = new Date().toISOString()
    const turnId = `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`
    const existing = this.messages.get(taskId) ?? []
    existing.push({ id: `message_${randomUUID().replaceAll('-', '')}`, taskId, turnId, role: 'user', content, status: 'completed', provider, createdAt: now, updatedAt: now })
    existing.push({ id: `message_${randomUUID().replaceAll('-', '')}`, taskId, turnId, role: 'assistant', content: '', status: 'streaming', provider, createdAt: now, updatedAt: now })
    this.messages.set(taskId, existing)
    this.activeTurns.set(taskId, turnId)
    await this.updateTask(taskId, { activeRunId: turnId })
    await this.persistMessages(taskId)
    return turnId
  }

  async appendStandaloneMessage(taskId: string, role: ChatMessage['role'], content: string, status: ChatMessage['status'] = 'completed') {
    const now = new Date().toISOString()
    const message: ChatMessage = { id: `message_${randomUUID().replaceAll('-', '')}`, taskId, turnId: `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`, role, content, status, provider: this.getTask(taskId).provider, createdAt: now, updatedAt: now }
    const existing = this.messages.get(taskId) ?? []
    existing.push(message)
    this.messages.set(taskId, existing)
    await this.persistMessages(taskId)
    return message
  }

  listMessages(taskId: string, options: { cursor?: string; limit?: number; query?: string } = {}) {
    this.getTask(taskId)
    const query = options.query?.trim().toLocaleLowerCase()
    const all = (this.messages.get(taskId) ?? []).filter((message) => !query || message.content.toLocaleLowerCase().includes(query))
    const cursorIndex = options.cursor ? all.findIndex((message) => message.id === options.cursor) : -1
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200)
    const messages = all.slice(start, start + limit)
    return { messages, nextCursor: start + limit < all.length ? messages.at(-1)?.id : undefined, total: all.length }
  }

  searchMessages(query: string, limit = 50) {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return []
    const results: Array<{ task: Task; message: ChatMessage }> = []
    for (const [taskId, messages] of this.messages) {
      const task = this.getTask(taskId)
      for (const message of messages) if (message.content.toLocaleLowerCase().includes(normalized)) results.push({ task, message })
    }
    return results.sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt)).slice(0, limit)
  }

  subscribe(taskId: string, listener: (event: RuntimeEvent) => void) {
    this.emitter.on(taskId, listener)
    return () => this.emitter.off(taskId, listener)
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
    const target = this.workspacePath(taskId, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }

  async writeWorkspaceBytes(taskId: string, relativePath: string, content: Uint8Array) {
    const target = this.workspacePath(taskId, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  async readWorkspaceFile(taskId: string, relativePath: string) {
    return readFile(this.workspacePath(taskId, relativePath), 'utf8')
  }

  async readWorkspaceBytes(taskId: string, relativePath: string) {
    return readFile(this.workspacePath(taskId, relativePath))
  }

  async listWorkspaceFiles(taskId: string): Promise<WorkspaceFile[]> {
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

  async createWorkspaceVersion(taskId: string, label: string) {
    const files = await this.listWorkspaceFiles(taskId)
    if (!files.length) return null
    const id = `version_${Date.now()}_${randomUUID().slice(0, 8)}`
    const root = path.join(this.versionsRoot, taskId, id)
    assertWithin(this.versionsRoot, root)
    await mkdir(root, { recursive: true })
    await cp(this.workspacePath(taskId), path.join(root, 'files'), { recursive: true })
    const version: WorkspaceVersion = {
      id, taskId, label: label.slice(0, 120), createdAt: new Date().toISOString(), fileCount: files.length,
      evidenceHash: this.listEvents(taskId).at(-1)?.eventHash ?? 'GENESIS',
    }
    await writeJson(path.join(root, 'version.json'), version)
    return version
  }

  async listWorkspaceVersions(taskId: string): Promise<WorkspaceVersion[]> {
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
    const versionRoot = path.resolve(this.versionsRoot, taskId, versionId)
    assertWithin(path.join(this.versionsRoot, taskId), versionRoot)
    const version = JSON.parse(await readFile(path.join(versionRoot, 'version.json'), 'utf8')) as WorkspaceVersion
    if (version.taskId !== taskId || version.id !== versionId) throw new Error('Invalid workspace version')
    const workspace = this.workspacePath(taskId)
    await rm(workspace, { recursive: true, force: true })
    await cp(path.join(versionRoot, 'files'), workspace, { recursive: true })
    return version
  }

  async copyWorkspace(sourceTaskId: string, targetTaskId: string) {
    const source = this.workspacePath(sourceTaskId)
    const target = this.workspacePath(targetTaskId)
    const files = await this.listWorkspaceFiles(sourceTaskId)
    if (!files.length) return 0
    await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
    return files.length
  }

  async exportWorkspaceZip(taskId: string) {
    const task = this.getTask(taskId)
    const events = this.listEvents(taskId)
    const messages = this.listMessages(taskId, { limit: 200 }).messages
    const chainValid = this.verifyChain(taskId)
    const files = await this.listWorkspaceFiles(taskId)
    const entries: Record<string, Uint8Array> = {}
    for (const file of files) entries[file.path] = await this.readWorkspaceBytes(taskId, file.path)
    entries['GITHUB-HANDOFF.md'] = strToU8(`# GitHub handoff\n\nThis archive is a portable handoff for **${task.title}**. It does not create a repository, authenticate to GitHub, or authorize publication.\n\n## Evidence\n\n- Task ID: \`${task.id}\`\n- Creation mode: \`${task.mode}\`\n- Provider: \`${task.provider}\`\n- Evidence chain: ${chainValid ? 'valid at export' : 'INVALID — do not publish until reviewed'}\n- Final evidence hash: \`${events.at(-1)?.eventHash ?? 'GENESIS'}\`\n\n## Suggested review and handoff\n\n1. Extract this archive and inspect \`ONEVIBE-EVIDENCE.json\`, \`validation-report.json\` (when present), and the generated source.\n2. Remove anything unsuitable for external publication. Never commit credentials, private inputs, evidence screenshots, or \`.env*\` files.\n3. Create a reviewed repository: \`git init && git add . && git commit -m "Initial governed handoff"\`.\n4. Use your approved GitHub identity and repository policy to create a remote or pull request. For GitHub CLI users: \`gh repo create <owner>/<repo> --private --source=. --push\`.\n5. Preserve this archive or attach \`ONEVIBE-EVIDENCE.json\` to the review record so the source handoff remains traceable.\n\nExternal publishing remains a consequential action. Obtain the required independent VTI Wallet approval before executing it.\n`)
    entries['ONEVIBE-EVIDENCE.json'] = strToU8(`${JSON.stringify({
      task, events, messages, chainValid,
      exportedAt: new Date().toISOString(),
    }, null, 2)}\n`)
    return zipSync(entries, { level: 6 })
  }

  async snapshot(taskId: string): Promise<TaskSnapshot> {
    return { ...this.getTask(taskId), events: this.listEvents(taskId), files: await this.listWorkspaceFiles(taskId), messages: this.listMessages(taskId, { limit: 200 }).messages }
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
    await writeJson(path.join(this.tasksRoot, task.id, 'task.json'), task)
  }

  private async persistProjects() { await writeJson(this.projectsFile, this.listProjects()) }
  private async persistSchedules() { await writeJson(this.schedulesFile, this.listSchedules()) }

  private async appendAssistantDelta(taskId: string, content: string) {
    let turnId = this.activeTurns.get(taskId)
    const existing = this.messages.get(taskId) ?? []
    if (!turnId) {
      const now = new Date().toISOString()
      turnId = `turn_${randomUUID().replaceAll('-', '').slice(0, 14)}`
      this.activeTurns.set(taskId, turnId)
      existing.push({ id: `message_${randomUUID().replaceAll('-', '')}`, taskId, turnId, role: 'assistant', content: '', status: 'streaming', provider: this.getTask(taskId).provider, createdAt: now, updatedAt: now })
    }
    const message = [...existing].reverse().find((item) => item.turnId === turnId && item.role === 'assistant')
    if (message) { message.content += content; message.updatedAt = new Date().toISOString() }
    this.messages.set(taskId, existing)
    await this.persistMessages(taskId)
  }

  private async finishTurn(taskId: string, status: Extract<ChatMessage['status'], 'completed' | 'failed' | 'cancelled'>) {
    const turnId = this.activeTurns.get(taskId)
    if (!turnId) return
    const message = [...(this.messages.get(taskId) ?? [])].reverse().find((item) => item.turnId === turnId && item.role === 'assistant')
    if (message) { message.status = status; message.updatedAt = new Date().toISOString() }
    this.activeTurns.delete(taskId)
    if (this.getTask(taskId).activeRunId === turnId) await this.updateTask(taskId, { activeRunId: undefined })
    await this.persistMessages(taskId)
  }

  private async persistMessages(taskId: string) {
    await writeJson(path.join(this.tasksRoot, taskId, 'messages.json'), this.messages.get(taskId) ?? [])
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

  private async fileExists(filePath: string) {
    try { await stat(filePath); return true } catch { return false }
  }
}
