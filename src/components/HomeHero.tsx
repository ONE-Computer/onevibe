import { useEffect, useMemo, useState } from 'react'

type Props = { name?: string }

const greeting = (date: Date, name: string) => {
  const hour = date.getHours()
  const part = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Working late'
  return `${part}, ${name}.`
}

export const HomeHero = ({ name = 'Terence' }: Props) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(id) }, [])
  const heading = useMemo(() => greeting(new Date(now), name), [now, name])
  return (
    <div className="home-hero">
      <h1 className="home-hero-heading">{heading}</h1>
    </div>
  )
}
