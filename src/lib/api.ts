import type { ChatMessage, ConversationSummary, LibraryItem, Project, ProjectFileVersion, RuntimeDiagnostics, RuntimeHealth, RuntimeMcpConfig, RuntimeReadiness, SkillInstallation, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill, TaskSnapshot, WorkspaceFile, WorkspaceVersion, WorkspaceVersionComparison } from '../types'

export type SkillCatalogEntry = SkillInstallation
export type SkillOption = Pick<SkillCatalogEntry, 'id' | 'title' | 'summary' | 'source' | 'installed' | 'contentUrl'> & { selectable?: boolean }

export const fallbackSkillCatalog: SkillOption[] = [
  { id: 'research', title: 'Research', summary: 'Evidence, uncertainty, and source discipline', source: 'builtin', installed: true },
  { id: 'web_build', title: 'Web build', summary: 'Responsive, accessible product surfaces', source: 'builtin', installed: true },
  { id: 'slides', title: 'Slides', summary: 'Narrative decks and speaker notes', source: 'builtin', installed: true },
  { id: 'data_analysis', title: 'Data analysis', summary: 'Decision story with stated limits', source: 'builtin', installed: true },
  { id: 'document', title: 'Document', summary: 'Portable briefs and structured writing', source: 'builtin', installed: true },
  { id: 'product_design', title: 'Product design', summary: 'Interaction hierarchy and clear states', source: 'builtin', installed: true },
  { id: 'security_review', title: 'Security review', summary: 'Untrusted input and governed actions', source: 'builtin', installed: true },
  { id: 'browser_testing', title: 'Browser testing', summary: 'Rendered-flow validation guidance', source: 'builtin', installed: true },
]

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  get isBackendOffline() {
    return this.code === 'backend_offline'
  }
}

export const isBackendOfflineError = (error: unknown) =>
  (error instanceof ApiError && error.isBackendOffline) ||
  (error instanceof TypeError && /fetch|network|failed to fetch/i.test(error.message))

export const normalizeSelectedSkillIds = (value: unknown, catalog: readonly SkillOption[] = fallbackSkillCatalog): TaskSkill[] => {
  if (!Array.isArray(value)) return []
  const validIds = new Set(catalog.filter((skill) => skill.selectable !== false && (skill.source === 'builtin' || skill.installed)).map((skill) => skill.id))
  const selected: TaskSkill[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'string' || !validIds.has(candidate as TaskSkill)) continue
    const skill = candidate as TaskSkill
    if (selected.includes(skill)) continue
    selected.push(skill)
    if (selected.length === 4) break
  }
  return selected
}

const parse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new ApiError('Backend offline or not reachable', response.status || 503, 'backend_offline')
  }
  const body = await response.json() as T & { error?: string; code?: string }
  if (!response.ok) throw new ApiError(body.error ?? `Request failed with HTTP ${response.status}`, response.status, body.code ?? 'http_error')
  return body
}

export const listTasks = async () => parse<{ tasks: Task[] }>(await fetch('/api/tasks'))
export const listConversations = async (cursor?: string, limit = 50, query?: string) => {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  if (query) params.set('q', query)
  return parse<{ conversations: ConversationSummary[]; nextCursor?: string }>(await fetch(`/api/conversations?${params}`))
}
export const getRuntimeReadiness = async () => parse<RuntimeReadiness>(await fetch('/api/runtime'))
export const getRuntimeDiagnostics = async () => parse<RuntimeDiagnostics>(await fetch('/api/diagnostics'))
export const testRuntime = async (provider: Task['provider']) => parse<{ provider: Task['provider']; health: RuntimeHealth }>(await fetch(`/api/runtime/test/${encodeURIComponent(provider)}`, { method: 'POST' }))
export const listLibrary = async () => parse<{ items: LibraryItem[] }>(await fetch('/api/library'))
export const removeLibraryItem = async (taskId: string) => parse<Task>(await fetch(`/api/library/${taskId}`, { method: 'DELETE' }))
export const listSkills = async () => parse<{ skills: SkillCatalogEntry[] }>(await fetch('/api/skills'))
export const installSkill = async (skillId: TaskSkill) => parse<SkillInstallation>(await fetch('/api/skills/install', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skillId }),
}))
export const removeSkill = async (skillId: TaskSkill) => parse<{ id: string; deleted: true }>(await fetch(`/api/skills/${encodeURIComponent(skillId)}`, { method: 'DELETE' }))
export const listMcpConfigs = async () => parse<{ configs: RuntimeMcpConfig[] }>(await fetch('/api/mcp'))
export const createMcpConfig = async (input: Pick<RuntimeMcpConfig, 'name' | 'command' | 'args'>) => parse<RuntimeMcpConfig>(await fetch('/api/mcp', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
}))
export const deleteMcpConfig = async (id: string) => parse<{ id: string; deleted: true }>(await fetch(`/api/mcp/${encodeURIComponent(id)}`, { method: 'DELETE' }))

export const createTask = async (prompt: string, provider: Task['provider'], mode: TaskMode, projectId = 'project_onevibe', references: string[] = [], attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = [], skills: TaskSkill[] = []) =>
  parse<Task>(await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider, mode, projectId, references, attachments, skills }),
  }))

export const listProjects = async () => parse<{ projects: Project[] }>(await fetch('/api/projects'))
export const createProject = async (name: string, context: string) => parse<Project>(await fetch('/api/projects', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, context }),
}))
export const updateProjectContext = async (projectId: string, context: string) => parse<Project>(await fetch(`/api/projects/${projectId}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ context }),
}))
export const addProjectFile = async (projectId: string, file: Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }) => parse<Project>(await fetch(`/api/projects/${projectId}/files`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(file),
}))
export const removeProjectFile = async (projectId: string, filePath: string) => parse<Project>(await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' }))
export const getProjectFile = async (projectId: string, filePath: string) => parse<{ path: string; content: string; contentHash: string }>(await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`))
export const updateProjectFile = async (projectId: string, filePath: string, content: string, expectedHash: string) => parse<{ project: Project; path: string; content: string; contentHash: string }>(await fetch(`/api/projects/${projectId}/files?path=${encodeURIComponent(filePath)}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, expectedHash }),
}))
export const listProjectFileVersions = async (projectId: string, filePath: string) => parse<{ versions: ProjectFileVersion[] }>(await fetch(`/api/projects/${projectId}/files/versions?path=${encodeURIComponent(filePath)}`))
export const restoreProjectFileVersion = async (projectId: string, filePath: string, versionId: string, expectedHash: string) => parse<{ project: Project; path: string; content: string; contentHash: string }>(await fetch(`/api/projects/${projectId}/files/versions/restore?path=${encodeURIComponent(filePath)}&version=${encodeURIComponent(versionId)}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedHash }),
}))
export const listSchedules = async () => parse<{ schedules: TaskSchedule[] }>(await fetch('/api/schedules'))
export const createSchedule = async (input: Pick<TaskSchedule, 'name' | 'prompt' | 'provider' | 'mode' | 'projectId' | 'intervalMinutes'>) => parse<TaskSchedule>(await fetch('/api/schedules', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
}))
export const setScheduleEnabled = async (id: string, enabled: boolean) => parse<TaskSchedule>(await fetch(`/api/schedules/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
}))
export const deleteSchedule = async (id: string) => parse<{ id: string; deleted: true }>(await fetch(`/api/schedules/${id}`, { method: 'DELETE' }))
export const runScheduleNow = async (id: string) => parse<{ schedule: TaskSchedule; task: Task }>(await fetch(`/api/schedules/${id}/run`, { method: 'POST' }))

export const getTask = async (taskId: string) => parse<TaskSnapshot>(await fetch(`/api/tasks/${taskId}`))

export const getFiles = async (taskId: string) =>
  parse<{ files: WorkspaceFile[] }>(await fetch(`/api/tasks/${taskId}/files`))

export const getFile = async (taskId: string, filePath: string) =>
  parse<{ path: string; content: string; contentHash: string }>(await fetch(`/api/tasks/${taskId}/file?path=${encodeURIComponent(filePath)}`))

export const updateFile = async (taskId: string, filePath: string, content: string, expectedHash: string) =>
  parse<{ path: string; content: string; contentHash: string }>(await fetch(`/api/tasks/${taskId}/file?path=${encodeURIComponent(filePath)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, expectedHash }),
  }))

export const getEvidence = async (taskId: string) =>
  parse<{ valid: boolean }>(await fetch(`/api/tasks/${taskId}/evidence`))

export const cancelTask = async (taskId: string) =>
  parse<{ status: string }>(await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' }))

export const retryTask = async (taskId: string, idempotencyKey = `retry_${crypto.randomUUID()}`, provider?: Task['provider']) =>
  parse<{ status: string; taskId: string; retryKey: string }>(await fetch(`/api/tasks/${taskId}/retry`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey, ...(provider ? { provider } : {}) }),
  }))

export const moveTaskToProject = async (taskId: string, projectId: string) =>
  parse<Task>(await fetch(`/api/tasks/${taskId}/project`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) }))

export const updateTaskTags = async (taskId: string, tags: string[]) =>
  parse<Task>(await fetch(`/api/tasks/${taskId}/tags`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) }))

export const sendFollowUp = async (taskId: string, prompt: string, attachments: Array<Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string }> = []) =>
  parse<{ status: string; taskId: string }>(await fetch(`/api/tasks/${taskId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, attachments }),
  }))

export const forkTask = async (taskId: string, fromMessageId: string, newPrompt: string) =>
  parse<TaskSnapshot>(await fetch(`/api/tasks/${taskId}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromMessageId, newPrompt }),
  }))

export const cancelQueuedGuidance = async (taskId: string, guidanceId: string) =>
  parse<Task>(await fetch(`/api/tasks/${taskId}/messages/${encodeURIComponent(guidanceId)}`, { method: 'DELETE' }))

export const getVersions = async (taskId: string) =>
  parse<{ versions: WorkspaceVersion[] }>(await fetch(`/api/tasks/${taskId}/versions`))

export const restoreVersion = async (taskId: string, versionId: string) =>
  parse<{ version: WorkspaceVersion }>(await fetch(`/api/tasks/${taskId}/versions/${versionId}/restore`, { method: 'POST' }))

export const compareVersion = async (taskId: string, versionId: string) =>
  parse<WorkspaceVersionComparison>(await fetch(`/api/tasks/${taskId}/versions/${versionId}/compare`))

export const copyTask = async (taskId: string) =>
  parse<TaskSnapshot>(await fetch(`/api/tasks/${taskId}/copy`, { method: 'POST' }))

export const answerInput = async (taskId: string, inputRequestId: string, answer: string) =>
  parse<{ status: string }>(await fetch(`/api/tasks/${taskId}/inputs/${inputRequestId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }),
  }))

export const requestShare = async (taskId: string) =>
  parse<{ approval?: Task['approval']; share?: NonNullable<Task['share']>; url?: string }>(await fetch(`/api/tasks/${taskId}/share`, { method: 'POST' }))

export const getSharedArtifact = async (shareId: string) =>
  parse<{ id: string; title: string; mode: TaskMode; createdAt: string }>(await fetch(`/api/shares/${shareId}`))

export const getMessages = async (taskId: string, cursor?: string, query?: string) => {
  const params = new URLSearchParams({ limit: '100' })
  if (cursor) params.set('cursor', cursor)
  if (query) params.set('q', query)
  return parse<{ messages: ChatMessage[]; nextCursor?: string; total: number }>(await fetch(`/api/tasks/${taskId}/messages?${params}`))
}

export const searchChat = async (query: string) =>
  parse<{ results: Array<{ taskId: string; taskTitle: string; message: ChatMessage }> }>(await fetch(`/api/search?q=${encodeURIComponent(query)}`))
