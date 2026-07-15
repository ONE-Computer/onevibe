import type { Task, TaskSnapshot, WorkspaceFile } from '../types'

const parse = async <T>(response: Response): Promise<T> => {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Request failed with HTTP ${response.status}`)
  return body
}

export const listTasks = async () => parse<{ tasks: Task[] }>(await fetch('/api/tasks'))

export const createTask = async (prompt: string, provider: Task['provider']) =>
  parse<Task>(await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider }),
  }))

export const getTask = async (taskId: string) => parse<TaskSnapshot>(await fetch(`/api/tasks/${taskId}`))

export const getFiles = async (taskId: string) =>
  parse<{ files: WorkspaceFile[] }>(await fetch(`/api/tasks/${taskId}/files`))

export const getFile = async (taskId: string, filePath: string) =>
  parse<{ path: string; content: string }>(await fetch(`/api/tasks/${taskId}/file?path=${encodeURIComponent(filePath)}`))

export const getEvidence = async (taskId: string) =>
  parse<{ valid: boolean }>(await fetch(`/api/tasks/${taskId}/evidence`))
