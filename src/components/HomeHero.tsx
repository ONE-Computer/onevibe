import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CheckCircle2, Info } from 'lucide-react'
import { useTenantTheme } from '../hooks/useTenantTheme'

type Props = { name?: string }

const greeting = (date: Date, name: string) => {
  const hour = date.getHours()
  const part = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Working late'
  return `${part}, ${name}.`
}

export const HomeHero = ({ name = 'Terence' }: Props) => {
  const { config } = useTenantTheme()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id) }, [])
  const heading = useMemo(() => greeting(new Date(now), name), [now, name])
  const home = config?.homePage
  const cards = home?.featureCards ?? []
  return <div className="home-hero">
    {home?.announcementBannerVisible && home.announcementBannerText && <div className="tenant-announcement"><Info size={13} /><span>{home.announcementBannerText}</span>{home.announcementBannerUrl && <a href={home.announcementBannerUrl} target={home.announcementBannerUrl.startsWith('https://') ? '_blank' : undefined} rel={home.announcementBannerUrl.startsWith('https://') ? 'noreferrer' : undefined}>Learn more <ArrowUpRight size={12} /></a>}</div>}
    <h1 className="home-hero-heading">{home?.heroHeadline || heading}</h1>
    {home?.heroSubheadline && <p className="tenant-hero-subheadline">{home.heroSubheadline}</p>}
    {cards.length > 0 && <div className="tenant-feature-grid">{cards.map((card) => <article key={`${card.title}:${card.description}`}><span className={`tenant-feature-icon ${card.accent}`}><CheckCircle2 size={14} /></span><div><strong>{card.title}</strong><p>{card.description}</p></div></article>)}</div>}
  </div>
}
