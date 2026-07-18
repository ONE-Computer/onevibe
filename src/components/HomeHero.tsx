import { useEffect, useMemo, useState } from 'react'
import { AppWindow, ArrowUpRight, BarChart3, Bot, CheckCircle2, ChevronRight, Clock3, FileText, Gamepad2, Globe2, Info, Loader, Palette, Presentation, Search, Sparkles, TriangleAlert } from 'lucide-react'
import { useTenantTheme } from '../hooks/useTenantTheme'
import type { ConversationSummary, Project, Task, TaskMode } from '../types'
import type { Locale } from '../lib/i18n'
import { t } from '../lib/i18n'
import { ActiveNowPanel } from './ActiveNowPanel'

type Props = {
  name?: string
  recentConversations?: ConversationSummary[]
  tasks?: Task[]
  projects?: Project[]
  onSelectTask?: (taskId: string) => void
  locale?: Locale
}

const greetingKey = (hour: number) => {
  if (hour < 5 || hour >= 22) return 'greetingLate' as const
  if (hour < 12) return 'greetingMorning' as const
  if (hour < 17) return 'greetingAfternoon' as const
  return 'greetingEvening' as const
}

const modeIconFor = (mode: TaskMode) => {
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

const statusIconFor = (status: ConversationSummary['status']) => {
  switch (status) {
    case 'running':
    case 'pending': return Loader
    case 'failed':
    case 'cancelled': return TriangleAlert
    default: return CheckCircle2
  }
}

const relativeShort = (iso: string, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const HomeHero = ({ name = 'there', recentConversations = [], tasks = [], projects = [], onSelectTask, locale = 'en' }: Props) => {
  const { config } = useTenantTheme()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id) }, [])
  const heading = useMemo(() => {
    const key = greetingKey(new Date(now).getHours())
    const base = t(key, locale)
    if (locale === 'zh') return base
    return base.replace(/\.$/, `, ${name}.`)
  }, [now, name, locale])
  const home = config?.homePage
  const cards = home?.featureCards ?? []
  const recent = recentConversations.slice(0, 5)

  return <div className="home-hero">
    {home?.announcementBannerVisible && home.announcementBannerText && <div className="tenant-announcement"><Info size={13} /><span>{home.announcementBannerText}</span>{home.announcementBannerUrl && <a href={home.announcementBannerUrl} target={home.announcementBannerUrl.startsWith('https://') ? '_blank' : undefined} rel={home.announcementBannerUrl.startsWith('https://') ? 'noreferrer' : undefined}>Learn more <ArrowUpRight size={12} /></a>}</div>}
    <div className="home-hero-heading"><h1>{home?.heroHeadline || heading}</h1></div>
    {home?.heroSubheadline && <p className="tenant-hero-subheadline">{home.heroSubheadline}</p>}
    {cards.length > 0 && <div className="tenant-feature-grid">{cards.map((card) => <article key={`${card.title}:${card.description}`}><span className={`tenant-feature-icon ${card.accent}`}><CheckCircle2 size={14} /></span><div><strong>{card.title}</strong><p>{card.description}</p></div></article>)}</div>}
    {recent.length > 0 && onSelectTask && <div className="home-hero-recent">
      <div className="home-hero-recent-block">
        <header><Clock3 size={12} /> Recent</header>
        <div className="home-hero-recent-grid">
          {recent.map((conv) => {
            const ModeIcon = modeIconFor(conv.mode)
            const StatusIcon = statusIconFor(conv.status)
            const isRunning = conv.status === 'running' || conv.status === 'pending'
            const isFailed = conv.status === 'failed' || conv.status === 'cancelled'
            return <button
              key={conv.id}
              className="home-hero-card"
              onClick={() => onSelectTask(conv.id)}
              type="button"
            >
              <span className={`home-hero-card-icon ${isRunning ? 'running' : isFailed ? 'failed' : ''}`}>
                <ModeIcon size={14} />
              </span>
              <span className="home-hero-card-body">
                <strong>{conv.title}</strong>
                <small><StatusIcon size={9} className={isRunning ? 'spin' : ''} /> {isRunning ? 'Running' : isFailed ? 'Failed' : relativeShort(conv.updatedAt, now)}</small>
              </span>
              <ChevronRight size={13} className="home-hero-card-chevron" />
            </button>
          })}
        </div>
      </div>
    </div>}
    {onSelectTask && <ActiveNowPanel tasks={tasks} projects={projects} locale={locale} variant="home" onOpenTask={onSelectTask} />}
  </div>
}
