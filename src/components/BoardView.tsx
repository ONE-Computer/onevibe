import { useMemo, useState } from 'react'
import { Kanban, List } from 'lucide-react'
import type { Project, RunStatus, Task } from '../types'
import { statusLabel } from '../lib/runtime-labels'

type BoardColumn = { id: string; label: string; statuses: RunStatus[] }

const COLUMNS: BoardColumn[] = [
  { id: 'todo', label: 'Todo', statuses: ['pending'] },
  { id: 'in_progress', label: 'In Progress', statuses: ['running', 'waiting_for_approval', 'waiting_for_user_input'] },
  { id: 'done', label: 'Done', statuses: ['completed'] },
  { id: 'blocked', label: 'Blocked', statuses: ['failed', 'cancelled'] },
]

const columnFor = (status: RunStatus): string => COLUMNS.find((column) => column.statuses.includes(status))?.id ?? 'todo'

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

type SortKey = 'title' | 'priority' | 'status' | 'date'

type Props = {
  tasks: Task[]
  projects?: Project[]
  onOpenTask: (taskId: string) => void
}

export const BoardView = ({ tasks, projects = [], onOpenTask }: Props) => {
  const [mode, setMode] = useState<'kanban' | 'list'>('kanban')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const projectName = (projectId: string) => projects.find((project) => project.id === projectId)?.name

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = Object.fromEntries(COLUMNS.map((column) => [column.id, []]))
    const sorted = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    for (const task of sorted) map[columnFor(task.status)]?.push(task)
    return map
  }, [tasks])

  const sortedTasks = useMemo(() => {
    const direction = sortAsc ? 1 : -1
    return [...tasks].sort((a, b) => {
      switch (sortKey) {
        case 'title': return direction * a.title.localeCompare(b.title)
        case 'priority': return direction * ((PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9))
        case 'status': return direction * a.status.localeCompare(b.status)
        case 'date': return direction * a.updatedAt.localeCompare(b.updatedAt)
      }
    })
  }, [tasks, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((value) => !value)
    else { setSortKey(key); setSortAsc(key === 'title') }
  }

  const sortMark = (key: SortKey) => (sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '')

  return (
    <div className="board-view">
      <header className="board-view-header">
        <h1>Board</h1>
        <div className="board-view-toggle">
          <button type="button" className={mode === 'kanban' ? 'active' : ''} onClick={() => setMode('kanban')}><Kanban size={14} /> Kanban</button>
          <button type="button" className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}><List size={14} /> List</button>
        </div>
      </header>
      {mode === 'kanban' ? (
        <div className="board-columns">
          {COLUMNS.map((column) => {
            const items = grouped[column.id] ?? []
            return (
              <section key={column.id} className="board-column">
                <header className="board-column-header"><span>{column.label}</span><span className="board-count">{items.length}</span></header>
                {items.map((task) => (
                  <button key={task.id} type="button" className="board-card" onClick={() => onOpenTask(task.id)}>
                    <span className="board-card-top">
                      <i className="board-status-dot" data-column={column.id} />
                      {task.priority && <span className="priority-chip" data-priority={task.priority}>{task.priority}</span>}
                    </span>
                    <span className="board-card-title">{task.title}</span>
                    <span className="board-card-meta">
                      {projectName(task.projectId) && <span className="label-chip">{projectName(task.projectId)}</span>}
                      {task.labels?.map((label) => <span key={label} className="label-chip">{label}</span>)}
                    </span>
                  </button>
                ))}
                {items.length === 0 && <p className="board-empty">No tasks</p>}
              </section>
            )
          })}
        </div>
      ) : (
        <table className="board-table">
          <thead><tr>
            <th onClick={() => toggleSort('title')}>Title{sortMark('title')}</th>
            <th onClick={() => toggleSort('priority')}>Priority{sortMark('priority')}</th>
            <th onClick={() => toggleSort('status')}>Status{sortMark('status')}</th>
            <th onClick={() => toggleSort('date')}>Updated{sortMark('date')}</th>
          </tr></thead>
          <tbody>
            {sortedTasks.map((task) => (
              <tr key={task.id} onClick={() => onOpenTask(task.id)}>
                <td>{task.title}</td>
                <td>{task.priority ? <span className="priority-chip" data-priority={task.priority}>{task.priority}</span> : '—'}</td>
                <td>{statusLabel(task.status)}</td>
                <td>{new Date(task.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
