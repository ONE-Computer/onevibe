import { useEffect, useMemo, useState } from 'react'
import { Bot, Zap } from 'lucide-react'
import type { Project, Task } from '../types'
import { t, type Locale } from '../lib/i18n'
import { ACTIVE_NOW_PREVIEW_LIMIT, activeAgentRuns, elapsedSeconds, formatElapsed, visibleActiveRuns } from '../lib/assignees'

type Props = {
  tasks: Task[]
  projects: Project[]
  locale: Locale
  variant: 'sidebar' | 'home'
  onOpenTask: (taskId: string) => void
}

export const ActiveNowPanel = ({ tasks, projects, locale, variant, onOpenTask }: Props) => {
  const [now, setNow] = useState(() => Date.now())
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 10_000)
    return () => window.clearInterval(interval)
  }, [])
  const runs = useMemo(() => activeAgentRuns(tasks), [tasks])
  if (runs.length === 0) return null
  const visible = visibleActiveRuns(runs, expanded)
  const projectName = (projectId: string) => projects.find((project) => project.id === projectId)?.name
  return (
    <div className={`active-now-panel active-now-${variant}`}>
      <header><Zap size={12} /> {t('activeNow', locale)} <span className="active-now-count">{runs.length}</span></header>
      <div className="active-now-list">
        {visible.map((run) => (
          <button key={run.taskId} type="button" className="active-now-entry" onClick={() => onOpenTask(run.taskId)}>
            <i className="active-now-dot" aria-hidden="true" />
            <span className="agent-chip"><Bot size={9} /> {run.agents.join(' + ')}</span>
            <strong>{run.title}</strong>
            {projectName(run.projectId) && <span className="label-chip">{projectName(run.projectId)}</span>}
            <span className="active-now-elapsed">{formatElapsed(elapsedSeconds(run.startedAt, now))}</span>
          </button>
        ))}
      </div>
      {runs.length > ACTIVE_NOW_PREVIEW_LIMIT && (
        <button type="button" className="active-now-view-all" onClick={() => setExpanded((current) => !current)}>
          {expanded ? t('showLess', locale) : t('viewAllActive', locale).replace('{count}', String(runs.length))}
        </button>
      )}
    </div>
  )
}
