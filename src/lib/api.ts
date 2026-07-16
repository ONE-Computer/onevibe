import type { ChatMessage, ConversationSummary, LibraryItem, Project, ProjectFileVersion, RuntimeReadiness, Task, TaskAttachment, TaskMode, TaskSchedule, TaskSkill, TaskSnapshot, WorkspaceFile, WorkspaceVersion, WorkspaceVersionComparison } from '../types'

export type SkillCatalogEntry = { id: TaskSkill; version: number; title: string; summary: string; sha256: string }
export type SkillOption = Pick<SkillCatalogEntry, 'id' | 'title' | 'summary'>

export const fallbackSkillCatalog: SkillOption[] = [
  { id: 'research', title: 'Research', summary: 'Evidence, uncertainty, and source discipline' },
  { id: 'web_build', title: 'Web build', summary: 'Responsive, accessible product surfaces' },
  { id: 'slides', title: 'Slides', summary: 'Narrative decks and speaker notes' },
  { id: 'data_analysis', title: 'Data analysis', summary: 'Decision story with stated limits' },
  { id: 'document', title: 'Document', summary: 'Portable briefs and structured writing' },
  { id: 'product_design', title: 'Product design', summary: 'Interaction hierarchy and clear states' },
  { id: 'security_review', title: 'Security review', summary: 'Untrusted input and governed actions' },
  { id: 'browser_testing', title: 'Browser testing', summary: 'Rendered-flow validation guidance' },
]

export const normalizeSelectedSkillIds = (value: unknown, catalog: readonly SkillOption[] = fallbackSkillCatalog): TaskSkill[] => {
  if (!Array.isArray(value)) return []
  const validIds = new Set(catalog.map((skill) => skill.id))
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
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`)
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
export const listLibrary = async () => parse<{ items: LibraryItem[] }>(await fetch('/api/library'))
export const listSkills = async () => parse<{ skills: SkillCatalogEntry[] }>(await fetch('/api/skills'))

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

export const retryTask = async (taskId: string, idempotencyKey = `retry_${crypto.randomUUID()}`) =>
  parse<{ status: string; taskId: string; retryKey: string }>(await fetch(`/api/tasks/${taskId}/retry`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey }),
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
