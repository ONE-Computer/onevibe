import { ArrowLeft, ArrowRight, Eye, FileCode2, Radio, TerminalSquare, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { TaskSnapshot } from '../types'

type ComputerItem = {
  id: string
  kind: 'terminal' | 'screenshot' | 'preview' | 'file'
  title: string
  detail?: string
  createdAt: string
  uri?: string
  payload?: Record<string, unknown>
  live?: boolean
}

const presentationItems = (task: TaskSnapshot): ComputerItem[] => {
  const items = task.events.flatMap((event): ComputerItem[] => {
    if (event.type.startsWith('tool_call')) return [{ id: event.id, kind: 'terminal', title: event.label ?? 'Tool call', detail: event.content, createdAt: event.createdAt, payload: event.payload }]
    if (event.type === 'artifact_created' || event.type === 'artifact_updated') {
      const uri = typeof event.payload.uri === 'string' ? event.payload.uri : undefined
      const kind = event.payload.kind === 'visual_frame' ? 'screenshot' : uri ? 'preview' : 'file'
      return [{ id: event.id, kind, title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, uri, payload: event.payload }]
    }
    return []
  })
  if (task.securityContext?.visualRuntimeReady && task.securityContext.sandboxState !== 'destroyed') items.push({
    id: 'live-x11', kind: 'screenshot', title: 'Live X11 display', detail: 'Authenticated PNG capture · no VNC',
    createdAt: task.updatedAt, uri: `/api/tasks/${task.id}/visual/screenshot`, live: true,
  })
  return items
}

const iconFor = (item: ComputerItem) => item.kind === 'terminal' ? <TerminalSquare size={13} /> : item.kind === 'screenshot' ? <Eye size={13} /> : item.kind === 'preview' ? <Radio size={13} /> : <FileCode2 size={13} />

export const ComputerTimeline = ({ task }: { task: TaskSnapshot }) => {
  const items = useMemo(() => presentationItems(task), [task])
  const [selected, setSelected] = useState(0)
  const [follow, setFollow] = useState(true)
  const [frame, setFrame] = useState(Date.now())
  useEffect(() => { if (follow && items.length) setSelected(items.length - 1) }, [follow, items.length])
  const active = items[Math.min(selected, Math.max(items.length - 1, 0))]
  useEffect(() => {
    if (!active?.live) return
    setFrame(Date.now())
    const timer = window.setInterval(() => setFrame(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active?.live])
  const move = (next: number) => { setFollow(false); setSelected(Math.max(0, Math.min(items.length - 1, next))) }
  if (!items.length) return <div className="workspace-placeholder"><Wrench size={20} /><strong>No computer activity yet</strong><span>Commands, screenshots, files, and previews will appear here as the agent works.</span></div>
  return <div className="computer-timeline">
    <aside className="computer-history"><div className="computer-history-heading"><span>Agent computer</span><button className={follow ? 'active' : ''} onClick={() => { setFollow(true); setSelected(items.length - 1) }}><Radio size={10} /> Live</button></div>{items.map((item, index) => <button key={item.id} className={index === selected ? 'selected' : ''} onClick={() => move(index)}><span>{iconFor(item)}</span><div><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></div></button>)}</aside>
    <section className="computer-stage"><header><button disabled={selected === 0} onClick={() => move(selected - 1)}><ArrowLeft size={13} /></button><button disabled={selected >= items.length - 1} onClick={() => move(selected + 1)}><ArrowRight size={13} /></button><div><strong>{active?.title}</strong><span>{active?.detail}</span></div><em>{selected + 1} / {items.length}</em></header>
      {active?.kind === 'screenshot' && active.uri && <div className="computer-visual"><img src={`${active.uri}?v=${frame}`} alt={active.title} /></div>}
      {active?.kind === 'preview' && active.uri && <iframe title={active.title} sandbox="allow-scripts" src={active.uri} />}
      {active?.kind === 'file' && <div className="computer-file"><FileCode2 size={28} /><strong>{active.detail ?? active.title}</strong><span>Open the Files or Code tab to inspect this artifact.</span></div>}
      {active?.kind === 'terminal' && <pre><code>{[active.detail, active.payload ? JSON.stringify(active.payload, null, 2).slice(0, 24_000) : ''].filter(Boolean).join('\n\n')}</code></pre>}
    </section>
  </div>
}
