import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AppWindow, BarChart3, Bot, ChevronRight, Clock3, FileText, Gamepad2, Globe2, Layers, Palette, Presentation, Search, Sparkles } from 'lucide-react'
import type { ConversationSummary, LibraryItem, TaskMode } from '../types'

type Props = {
  conversations: ConversationSummary[]
  library: LibraryItem[]
  activeProjectId: string
  onOpenTask: (taskId: string) => void
}

const greeting = (date: Date, name: string) => {
  const hour = date.getHours()
  const part = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Working late'
  return `${part}, ${name}.`
}

const modeIcon = (mode: TaskMode) => {
  switch (mode) {
    case 'chat': return Bot
    case 'website': return Globe2
    case 'slides': return Presentation
    case 'document': return FileText
    case 'research': return Search
    case 'data': return BarChart3
    case 'design': return Palette
    case 'app': return AppWindow
    case 'game': return Gamepad2
    default: return Sparkles
  }
}

const modeLabel = (mode: TaskMode) => mode === 'general' ? 'Agent' : mode.charAt(0).toUpperCase() + mode.slice(1)

const relativeTime = (isoDate: string, now: number): string => {
  const then = new Date(isoDate).getTime()
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const HomeHero = ({ conversations, library, activeProjectId, onOpenTask }: Props) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id) }, [])

  const heading = useMemo(() => greeting(new Date(now), 'Terence'), [now])
  const runningCount = useMemo(() => conversations.filter((c) => c.status === 'running' || c.status === 'pending').length, [conversations])
  const recentConversations = useMemo(() => conversations.filter((c) => c.projectId === activeProjectId).slice(0, 4), [conversations, activeProjectId])
  const recentArtifacts = useMemo(() => library.filter((item) => item.files.length > 0).slice(0, 3), [library])

  return (
    <div className="home-hero">
      <motion.div className="home-hero-heading" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: 'easeOut' }}>
        <h1>{heading}</h1>
        <p className="home-hero-status">
          {runningCount > 0
            ? <><span className="running-dot" aria-hidden="true" /><strong>{runningCount}</strong> task{runningCount === 1 ? '' : 's'} running · what&apos;s next?</>
            : <>Ready when you are.</>}
        </p>
      </motion.div>

      {(recentConversations.length > 0 || recentArtifacts.length > 0) && (
        <motion.section className="home-hero-recent" aria-label="Recent work" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55, delay: .15, ease: 'easeOut' }}>
          {recentConversations.length > 0 && (
            <div className="home-hero-recent-block">
              <header><Clock3 size={12} /> Recent</header>
              <div className="home-hero-recent-grid">
                {recentConversations.map((c) => {
                  const Icon = modeIcon(c.mode)
                  return (
                    <button key={c.id} type="button" className="home-hero-card" onClick={() => onOpenTask(c.id)}>
                      <span className={`home-hero-card-icon ${c.status}`}><Icon size={14} /></span>
                      <span className="home-hero-card-body">
                        <strong>{c.title}</strong>
                        <small>{modeLabel(c.mode)} · {relativeTime(c.updatedAt, now)}</small>
                      </span>
                      <ChevronRight size={13} className="home-hero-card-chevron" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {recentArtifacts.length > 0 && (
            <div className="home-hero-recent-block">
              <header><Layers size={12} /> From your library</header>
              <div className="home-hero-recent-artifacts">
                {recentArtifacts.map((item) => {
                  const Icon = modeIcon(item.task.mode)
                  const file = item.files[0]!
                  const fileName = file.path.split('/').at(-1) ?? file.path
                  return (
                    <button key={item.task.id} type="button" className="home-hero-artifact" onClick={() => onOpenTask(item.task.id)}>
                      <span className="home-hero-artifact-icon"><Icon size={16} /></span>
                      <span className="home-hero-artifact-body">
                        <strong>{item.task.title}</strong>
                        <small>{fileName}{item.files.length > 1 ? ` · +${item.files.length - 1} more` : ''}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </motion.section>
      )}
    </div>
  )
}
