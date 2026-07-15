import type { ChatMessage, Task, TaskMode, TaskSnapshot, WorkspaceFile, WorkspaceVersion } from '../types'

const parse = async <T>(response: Response): Promise<T> => {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`)
  return body
}

export const listTasks = async () => parse<{ tasks: Task[] }>(await fetch('/api/tasks'))

export const createTask = async (prompt: string, provider: Task['provider'], mode: TaskMode) =>
  parse<Task>(await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider, mode }),
  }))

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

export const sendFollowUp = async (taskId: string, prompt: string) =>
  parse<{ status: string; taskId: string }>(await fetch(`/api/tasks/${taskId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  }))

export const getVersions = async (taskId: string) =>
  parse<{ versions: WorkspaceVersion[] }>(await fetch(`/api/tasks/${taskId}/versions`))

export const restoreVersion = async (taskId: string, versionId: string) =>
  parse<{ version: WorkspaceVersion }>(await fetch(`/api/tasks/${taskId}/versions/${versionId}/restore`, { method: 'POST' }))

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
