import type { Task } from '../types'

/**
 * P12-03: a task's `assignedAgent` holds a comma-separated list of assignee
 * ids so a task can be assigned to an agent runtime, a human, or both
 * (e.g. "codex,human"). These helpers keep that encoding in one place.
 */
export const HUMAN_ASSIGNEE = 'human'

export const parseAssignees = (value: string | null | undefined): string[] => {
  if (!value) return []
  const seen = new Set<string>()
  for (const segment of value.split(',')) {
    const id = segment.trim()
    if (id) seen.add(id)
  }
  return [...seen]
}

export const formatAssignees = (assignees: readonly string[]): string | undefined => {
  const unique = [...new Set(assignees.map((id) => id.trim()).filter(Boolean))]
  return unique.length > 0 ? unique.join(',') : undefined
}

export const agentAssignees = (value: string | null | undefined): string[] =>
  parseAssignees(value).filter((id) => id !== HUMAN_ASSIGNEE)

export const hasAgentAssignee = (value: string | null | undefined): boolean =>
  agentAssignees(value).length > 0

export const toggleAssignee = (value: string | null | undefined, id: string): string | undefined => {
  const current = parseAssignees(value)
  const next = current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]
  return formatAssignees(next)
}

type AssigneeCarrier = Pick<Task, 'assignedAgent'>

/** Distinct agent-runtime assignees across tasks (excludes the human assignee). */
export const distinctAgents = (tasks: readonly AssigneeCarrier[]): string[] =>
  [...new Set(tasks.flatMap((task) => agentAssignees(task.assignedAgent)))].sort()

/** Distinct live run ids across tasks, for the Agent Session filter. */
export const distinctActiveRuns = (tasks: readonly Pick<Task, 'activeRunId'>[]): string[] =>
  [...new Set(tasks.map((task) => task.activeRunId).filter((id): id is string => Boolean(id)))].sort()

export const matchesAgentFilter = (task: AssigneeCarrier, filter: string): boolean =>
  filter === 'all' || parseAssignees(task.assignedAgent).includes(filter)

export const matchesRunFilter = (task: Pick<Task, 'activeRunId'>, filter: string): boolean =>
  filter === 'all' || task.activeRunId === filter

export type ActiveAgentRun = { taskId: string; title: string; agents: string[]; startedAt: string; projectId: string }

type RunCarrier = Pick<Task, 'id' | 'title' | 'status' | 'updatedAt' | 'assignedAgent' | 'projectId'>

/**
 * Concurrent agent runs across all tasks. A run counts while the task is
 * running and at least one assignee is an agent runtime. `updatedAt` is the
 * closest available run-start marker: the store bumps it on the status
 * transition into `running` and nothing else touches it during a run.
 */
export const activeAgentRuns = (tasks: readonly RunCarrier[]): ActiveAgentRun[] =>
  tasks
    .filter((task) => task.status === 'running' && hasAgentAssignee(task.assignedAgent))
    .map((task) => ({ taskId: task.id, title: task.title, agents: agentAssignees(task.assignedAgent), startedAt: task.updatedAt, projectId: task.projectId }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

/** P12-06: preview cap before the "View all N →" expansion. */
export const ACTIVE_NOW_PREVIEW_LIMIT = 5

export const visibleActiveRuns = (runs: readonly ActiveAgentRun[], expanded: boolean): ActiveAgentRun[] =>
  expanded ? [...runs] : runs.slice(0, ACTIVE_NOW_PREVIEW_LIMIT)

export const elapsedSeconds = (startedAt: string, now: number): number => {
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((now - started) / 1000))
}

export const formatElapsed = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}
