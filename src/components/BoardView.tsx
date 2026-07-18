import { useEffect, useMemo, useState } from 'react'
import { Bot, Kanban, List, User, Zap } from 'lucide-react'
import type { BoardStatus, Project, Task, TaskPriority } from '../types'
import { t, type Locale } from '../lib/i18n'
import { boardStatusFor, boardStatusLabelKey } from '../lib/board-metadata'
import { StatusChipPicker, PriorityChipPicker } from './ChipPicker'
import { HUMAN_ASSIGNEE, activeAgentRuns, distinctActiveRuns, distinctAgents, elapsedSeconds, formatElapsed, hasAgentAssignee, matchesAgentFilter, matchesRunFilter, parseAssignees } from '../lib/assignees'

type BoardColumn = { id: BoardStatus; label: string }

const COLUMNS: BoardColumn[] = [
  { id: 'todo', label: '' },
  { id: 'in_progress', label: '' },
  { id: 'done', label: '' },
  { id: 'blocked', label: '' },
  { id: 'cancelled', label: '' },
]

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

type SortKey = 'title' | 'priority' | 'status' | 'date'

type Props = {
  tasks: Task[]
  projects?: Project[]
  locale?: Locale
  onOpenTask: (taskId: string) => void
  onPatchTask: (taskId: string, patch: { status?: BoardStatus | null; priority?: TaskPriority | null }) => void
}

export const BoardView = ({ tasks, projects = [], locale = 'en', onOpenTask, onPatchTask }: Props) => {
  const [mode, setMode] = useState<'kanban' | 'list'>('kanban')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAsc, setSortAsc] = useState(false)
  const [agentFilter, setAgentFilter] = useState('all')
  const [runFilter, setRunFilter] = useState('all')
  const [now, setNow] = useState(() => Date.now())
  const projectName = (projectId: string) => projects.find((project) => project.id === projectId)?.name

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(interval)
  }, [])

  const agentOptions = useMemo(() => distinctAgents(tasks), [tasks])
  const runOptions = useMemo(() => distinctActiveRuns(tasks), [tasks])
  const hasHumanAssignee = useMemo(() => tasks.some((task) => parseAssignees(task.assignedAgent).includes(HUMAN_ASSIGNEE)), [tasks])
  const activeRuns = useMemo(() => activeAgentRuns(tasks), [tasks])

  const visibleTasks = useMemo(
    () => tasks.filter((task) => matchesAgentFilter(task, agentFilter) && matchesRunFilter(task, runFilter)),
    [tasks, agentFilter, runFilter],
  )

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = Object.fromEntries(COLUMNS.map((column) => [column.id, []]))
    const sorted = [...visibleTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    for (const task of sorted) map[boardStatusFor(task.status, task.boardStatus)]?.push(task)
    return map
  }, [visibleTasks])

  const sortedTasks = useMemo(() => {
    const direction = sortAsc ? 1 : -1
    return [...visibleTasks].sort((a, b) => {
      switch (sortKey) {
        case 'title': return direction * a.title.localeCompare(b.title)
        case 'priority': return direction * ((PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9))
        case 'status': return direction * boardStatusFor(a.status, a.boardStatus).localeCompare(boardStatusFor(b.status, b.boardStatus))
        case 'date': return direction * a.updatedAt.localeCompare(b.updatedAt)
      }
    })
  }, [visibleTasks, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((value) => !value)
    else { setSortKey(key); setSortAsc(key === 'title') }
  }

  const sortMark = (key: SortKey) => (sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : '')

  const handleCardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, taskId: string) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenTask(taskId)
    }
  }

  return (
    <div className="board-view">
      <header className="board-view-header">
        <h1>Board</h1>
        <div className="board-view-toggle">
          <button type="button" className={mode === 'kanban' ? 'active' : ''} onClick={() => setMode('kanban')}><Kanban size={14} /> Kanban</button>
          <button type="button" className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}><List size={14} /> List</button>
        </div>
      </header>
      <div className="board-filters">
        <select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} aria-label={t('agentFilter', locale)}>
          <option value="all">{t('allAgents', locale)}</option>
          {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
          {hasHumanAssignee && <option value={HUMAN_ASSIGNEE}>{t('humanAssignee', locale)}</option>}
        </select>
        <select value={runFilter} onChange={(event) => setRunFilter(event.target.value)} aria-label={t('sessionFilter', locale)}>
          <option value="all">{t('allSessions', locale)}</option>
          {runOptions.map((runId) => <option key={runId} value={runId}>…{runId.slice(-8)}</option>)}
        </select>
      </div>
      {mode === 'kanban' ? (
        <div className="board-columns">
          {COLUMNS.map((column) => {
            const items = grouped[column.id] ?? []
            return (
              <section key={column.id} className="board-column">
                <header className="board-column-header"><span>{t(boardStatusLabelKey[column.id], locale)}</span><span className="board-count">{items.length}</span></header>
                {items.map((task) => (
                  <div
                    key={task.id}
                    role="button"
                    tabIndex={0}
                    className="board-card"
                    onClick={() => onOpenTask(task.id)}
                    onKeyDown={(event) => handleCardKeyDown(event, task.id)}
                  >
                    <span className="board-card-top">
                      <StatusChipPicker value={boardStatusFor(task.status, task.boardStatus)} onSelect={(status) => onPatchTask(task.id, { status })} locale={locale} />
                      <PriorityChipPicker value={task.priority ?? null} onSelect={(priority) => onPatchTask(task.id, { priority })} locale={locale} />
                      {parseAssignees(task.assignedAgent).map((assignee) => (
                        <span key={assignee} className="agent-chip">{assignee === HUMAN_ASSIGNEE ? <User size={9} /> : <Bot size={9} />} {assignee === HUMAN_ASSIGNEE ? t('humanAssignee', locale) : assignee}</span>
                      ))}
                      {hasAgentAssignee(task.assignedAgent) && task.status === 'running' && <span className="agent-live"><i className="active-now-dot" /> {t('live', locale)}</span>}
                    </span>
                    <span className="board-card-title">{task.title}</span>
                    <span className="board-card-meta">
                      {projectName(task.projectId) && <span className="label-chip">{projectName(task.projectId)}</span>}
                      {task.labels?.map((label) => <span key={label} className="label-chip">{label}</span>)}
                    </span>
                  </div>
                ))}
                {items.length === 0 && <p className="board-empty">{t('noTasksYet', locale)}</p>}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="board-list-scroll">
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
                <td><PriorityChipPicker value={task.priority ?? null} onSelect={(priority) => onPatchTask(task.id, { priority })} locale={locale} /></td>
                <td><StatusChipPicker value={boardStatusFor(task.status, task.boardStatus)} onSelect={(status) => onPatchTask(task.id, { status })} locale={locale} /></td>
                <td>{new Date(task.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
      {activeRuns.length > 0 && (
        <div className="active-now-strip board-active-now">
          <header><Zap size={12} /> {t('activeNow', locale)}</header>
          <div className="active-now-chips">
            {activeRuns.map((run) => (
              <button key={run.taskId} type="button" className="active-now-chip" onClick={() => onOpenTask(run.taskId)}>
                <i className="active-now-dot" />
                <span className="agent-chip"><Bot size={9} /> {run.agents.join(' + ')}</span>
                <strong>{run.title}</strong>
                <span className="active-now-elapsed">{formatElapsed(elapsedSeconds(run.startedAt, now))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
