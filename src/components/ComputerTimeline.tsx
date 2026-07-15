import { ArrowLeft, ArrowRight, CheckCircle2, Eye, FileCode2, Presentation, Radio, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { PresentationDescriptor, PresentationPanel, TaskSnapshot } from '../types'

type ComputerItem = {
  id: string
  kind: PresentationPanel
  title: string
  detail?: string
  runId?: string
  createdAt: string
  uri?: string
  payload?: Record<string, unknown>
  live?: boolean
}

const presentationItems = (task: TaskSnapshot): ComputerItem[] => {
  const items = task.events.flatMap((event): ComputerItem[] => {
    const presentation = event.payload.presentation as PresentationDescriptor | undefined
    if (presentation && ['terminal', 'screenshot', 'preview', 'file', 'diff', 'slide', 'approval'].includes(presentation.panel)) return [{ id: event.id, kind: presentation.panel, title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId: event.runId, uri: presentation.uri, payload: event.payload }]
    // Compatibility for evidence created before the typed presentation contract.
    if (event.type.startsWith('tool_call')) return [{ id: event.id, kind: 'terminal', title: event.label ?? 'Tool call', detail: event.content, createdAt: event.createdAt, runId: event.runId, payload: event.payload }]
    if (event.type === 'artifact_created' || event.type === 'artifact_updated') return [{ id: event.id, kind: event.type === 'artifact_updated' ? 'diff' : 'file', title: event.label ?? 'Artifact', detail: event.content, createdAt: event.createdAt, runId: event.runId, payload: event.payload }]
    return []
  })
  if (task.securityContext?.visualRuntimeReady && task.securityContext.sandboxState !== 'destroyed') items.push({
    id: 'live-x11', kind: 'screenshot', title: 'Live X11 display', detail: 'Authenticated PNG capture · no VNC',
    createdAt: task.updatedAt, uri: `/api/tasks/${task.id}/visual/screenshot`, live: true,
  })
  return items
}

const iconFor = (item: ComputerItem) => item.kind === 'terminal' ? <TerminalSquare size={13} /> : item.kind === 'screenshot' ? <Eye size={13} /> : item.kind === 'preview' ? <Radio size={13} /> : item.kind === 'slide' ? <Presentation size={13} /> : item.kind === 'approval' ? <ShieldCheck size={13} /> : <FileCode2 size={13} />

export const ComputerTimeline = ({ task }: { task: TaskSnapshot }) => {
  const items = useMemo(() => presentationItems(task), [task])
  const [selected, setSelected] = useState(0)
  const [follow, setFollow] = useState(true)
  const [newActivity, setNewActivity] = useState(0)
  const [frame, setFrame] = useState(Date.now())
  const itemKey = items.map((item) => item.id).join('|')
  useEffect(() => { setFollow(true); setNewActivity(0); setSelected(0) }, [task.id])
  useEffect(() => {
    if (follow && items.length) { setSelected(items.length - 1); setNewActivity(0); return }
    setNewActivity((current) => Math.max(current, Math.max(0, items.length - selected - 1)))
  }, [follow, items.length, itemKey, selected])
  const active = items[Math.min(selected, Math.max(items.length - 1, 0))]
  useEffect(() => {
    if (!active?.live) return
    setFrame(Date.now())
    const timer = window.setInterval(() => setFrame(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active?.live])
  const move = (next: number) => { setFollow(false); setSelected(Math.max(0, Math.min(items.length - 1, next))) }
  const resumeLive = () => { setFollow(true); setNewActivity(0); setSelected(items.length - 1) }
  const onTimelineKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(selected - 1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(selected + 1) }
    if (event.key === 'Home') { event.preventDefault(); move(0) }
    if (event.key === 'End') { event.preventDefault(); resumeLive() }
  }
  if (!items.length) return <div className="workspace-placeholder"><Wrench size={20} /><strong>No computer activity yet</strong><span>Commands, screenshots, files, and previews will appear here as the agent works.</span></div>
  return <div className="computer-timeline" onKeyDown={onTimelineKeyDown} tabIndex={0} aria-label="Agent computer artifact timeline">
    <aside className="computer-history"><div className="computer-history-heading"><span>Agent computer</span><button className={follow ? 'active' : ''} onClick={resumeLive} aria-label="Resume live follow"><Radio size={10} /> {follow ? 'Live' : newActivity ? `${newActivity} new` : 'Resume'}</button></div>{items.map((item, index) => <button key={item.id} className={index === selected ? 'selected' : ''} onClick={() => move(index)} aria-label={`${item.title}, event ${index + 1} of ${items.length}`}><span>{iconFor(item)}</span><div><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></div></button>)}</aside>
    <section className="computer-stage"><header><button disabled={selected === 0} onClick={() => move(selected - 1)} aria-label="Previous timeline event"><ArrowLeft size={13} /></button><button disabled={selected >= items.length - 1} onClick={() => move(selected + 1)} aria-label="Next timeline event"><ArrowRight size={13} /></button><div><strong>{active?.title}</strong><span>{active?.detail}</span></div><em>{active?.runId ? `run ${active.runId.slice(-6)} · ` : ''}{selected + 1} / {items.length}{!follow && <b>paused</b>}</em></header>
      {active?.kind === 'screenshot' && active.uri && <div className="computer-visual"><img src={`${active.uri}?v=${frame}`} alt={active.title} /></div>}
      {active?.kind === 'preview' && active.uri && <iframe title={active.title} sandbox="allow-scripts" src={active.uri} />}
      {active?.kind === 'slide' && <div className="computer-file"><Presentation size={28} /><strong>{active.detail ?? active.title}</strong><span>Deck evidence is preserved. Open the Files tab to download the PPTX or inspect the rendered viewer.</span></div>}
      {active?.kind === 'approval' && <div className="computer-file"><CheckCircle2 size={28} /><strong>{active.title}</strong><span>{active.detail ?? 'Approval evidence is recorded separately from the browser and can be verified in the task history.'}</span></div>}
      {(active?.kind === 'file' || active?.kind === 'diff') && <div className="computer-file"><FileCode2 size={28} /><strong>{active.detail ?? active.title}</strong><span>{active.kind === 'diff' ? 'Open the Code tab to inspect the recorded version change.' : 'Open the Files or Code tab to inspect this artifact.'}</span></div>}
      {active?.kind === 'terminal' && <pre><code>{[active.detail, active.payload ? JSON.stringify(active.payload, null, 2).slice(0, 24_000) : ''].filter(Boolean).join('\n\n')}</code></pre>}
    </section>
  </div>
}
