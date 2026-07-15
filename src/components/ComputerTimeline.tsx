import { ArrowLeft, ArrowRight, CheckCircle2, Eye, FileCode2, Presentation, Radio, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { PresentationPanel, TaskSnapshot } from '../types'
import { artifactRailItems, causalVisualItemsFor, evidenceItemId, formatInspectable, presentationItems, terminalActivityFor, type ComputerItem } from './computer-timeline-activity'

const iconFor = (item: ComputerItem) => item.kind === 'terminal' ? <TerminalSquare size={13} /> : item.kind === 'screenshot' ? <Eye size={13} /> : item.kind === 'preview' ? <Radio size={13} /> : item.kind === 'slide' ? <Presentation size={13} /> : item.kind === 'approval' ? <ShieldCheck size={13} /> : <FileCode2 size={13} />

export const ComputerTimeline = ({ task }: { task: TaskSnapshot }) => {
  const allItems = useMemo(() => presentationItems(task), [task])
  const railItems = useMemo(() => artifactRailItems(allItems), [allItems])
  const [filter, setFilter] = useState<'all' | PresentationPanel>('all')
  const items = filter === 'all' ? railItems : railItems.filter((item) => item.kind === filter)
  const [selected, setSelected] = useState(0)
  const [follow, setFollow] = useState(true)
  const [newActivity, setNewActivity] = useState(0)
  const [frame, setFrame] = useState(Date.now())
  const previousFilter = useRef(filter)
  const restoredReplayTask = useRef<string | undefined>(undefined)
  const itemKey = items.map((item) => item.id).join('|')
  useEffect(() => { setFollow(true); setNewActivity(0); setSelected(0); setFilter('all') }, [task.id])
  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(items.length - 1, 0)))
    if (previousFilter.current !== filter) { setFollow(true); setNewActivity(0); previousFilter.current = filter }
  }, [filter, items.length])
  useEffect(() => {
    if (follow && items.length) { setSelected(items.length - 1); setNewActivity(0); return }
    setNewActivity((current) => Math.max(current, Math.max(0, items.length - selected - 1)))
  }, [follow, items.length, itemKey, selected])
  useEffect(() => {
    if (restoredReplayTask.current === task.id) return
    const eventId = evidenceItemId(railItems, new URLSearchParams(window.location.search).get('event'))
    if (eventId) {
      const index = railItems.findIndex((item) => item.id === eventId)
      setFilter('all'); setFollow(false); setNewActivity(0); setSelected(index)
    }
    restoredReplayTask.current = task.id
  }, [railItems, task.id])
  const active = items[Math.min(selected, Math.max(items.length - 1, 0))]
  const terminalActivity = active?.kind === 'terminal' ? terminalActivityFor(active, task.events) : undefined
  const relatedVisuals = active?.kind === 'terminal' ? causalVisualItemsFor(active.id, allItems) : []
  useEffect(() => {
    if (!active?.live) return
    setFrame(Date.now())
    const timer = window.setInterval(() => setFrame(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active?.live])
  const persistEvidenceReference = (item: ComputerItem | undefined) => {
    if (!item?.eventHash) return
    const url = new URL(window.location.href)
    url.searchParams.set('event', item.id)
    window.history.replaceState(window.history.state, '', url)
  }
  const move = (next: number) => { const index = Math.max(0, Math.min(items.length - 1, next)); setFollow(false); setSelected(index); persistEvidenceReference(items[index]) }
  const resumeLive = () => { const index = items.length - 1; setFollow(true); setNewActivity(0); setSelected(index); persistEvidenceReference(items[index]) }
  const inspectVisual = (eventId: string) => {
    const index = railItems.findIndex((item) => item.id === eventId)
    if (index < 0) return
    setFilter('all')
    setFollow(false)
    setNewActivity(0)
    setSelected(index)
    persistEvidenceReference(railItems[index])
  }
  const onTimelineKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(selected - 1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(selected + 1) }
    if (event.key === 'Home') { event.preventDefault(); move(0) }
    if (event.key === 'End') { event.preventDefault(); resumeLive() }
  }
  if (!allItems.length) return <div className="workspace-placeholder"><Wrench size={20} /><strong>No computer activity yet</strong><span>Commands, screenshots, files, and previews will appear here as the agent works.</span></div>
  return <div className="computer-timeline" onKeyDown={onTimelineKeyDown} tabIndex={0} aria-label="Agent computer artifact timeline">
    <aside className="computer-history"><div className="computer-history-heading"><span>Artifact rail</span><button className={follow ? 'active' : ''} onClick={resumeLive} aria-label="Resume live follow"><Radio size={10} /> {follow ? 'Live' : newActivity ? `${newActivity} new` : 'Resume'}</button></div><div className="computer-filters">{(['all', 'terminal', 'screenshot', 'file', 'preview', 'slide', 'approval', 'diff'] as const).filter((kind) => kind === 'all' || railItems.some((item) => item.kind === kind)).map((kind) => <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>{kind === 'all' ? 'All' : kind}</button>)}</div>{items.map((item, index) => <div className="computer-rail-entry" key={item.id}>{item.runId && item.runId !== items[index - 1]?.runId && <div className="computer-run-marker">Run {item.runId.slice(-6)}</div>}<button className={index === selected ? 'selected' : ''} onClick={() => move(index)} aria-label={`${item.title}, event ${index + 1} of ${items.length}`}><span>{iconFor(item)}</span><div><strong>{item.title}</strong>{item.activityPreview && <code title={item.activityPreview}>{item.activityPreview}</code>}{item.relatedEventIds?.length ? <small className="computer-pair-status">result recorded</small> : <small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>}</div>{item.kind === 'screenshot' && item.uri && !item.live && <img className="computer-rail-thumbnail" src={item.uri} alt="" loading="lazy" />}</button></div>)}</aside>
    <section className="computer-stage"><header><button disabled={selected === 0} onClick={() => move(selected - 1)} aria-label="Previous timeline event"><ArrowLeft size={13} /></button><button disabled={selected >= items.length - 1} onClick={() => move(selected + 1)} aria-label="Next timeline event"><ArrowRight size={13} /></button><div><strong>{active?.title}</strong><span>{active?.detail}</span></div><em>{active?.runId ? `run ${active.runId.slice(-6)} · ` : ''}{active?.sequence ? `#${active.sequence} · ` : ''}{selected + 1} / {items.length}{filter !== 'all' && ` · ${filter}`}{active?.eventHash && <code title="Immutable evidence hash">{active.eventHash.slice(0, 8)}</code>}{!follow && <b>paused</b>}</em></header>
      {active?.kind === 'screenshot' && active.uri && <div className="computer-visual"><img src={`${active.uri}?v=${frame}`} alt={active.title} /></div>}
      {active?.kind === 'preview' && active.uri && <iframe title={active.title} sandbox="allow-scripts" src={active.uri} />}
      {active?.kind === 'slide' && <div className="computer-file"><Presentation size={28} /><strong>{active.detail ?? active.title}</strong><span>Deck evidence is preserved. Open the Files tab to download the PPTX or inspect the rendered viewer.</span></div>}
      {active?.kind === 'approval' && <div className="computer-file"><CheckCircle2 size={28} /><strong>{active.title}</strong><span>{active.detail ?? 'Approval evidence is recorded separately from the browser and can be verified in the task history.'}</span></div>}
      {(active?.kind === 'file' || active?.kind === 'diff') && <div className="computer-file"><FileCode2 size={28} /><strong>{active.detail ?? active.title}</strong><span>{active.kind === 'diff' ? 'Open the Code tab to inspect the recorded version change.' : 'Open the Files or Code tab to inspect this artifact.'}</span></div>}
      {active?.kind === 'terminal' && <div className="computer-terminal"><div className="computer-terminal-meta"><span>{active.title}</span>{terminalActivity?.failed ? <b>tool error</b> : <em>recorded activity</em>}</div>{terminalActivity?.request !== undefined && <section><label>Request</label><pre><code>{formatInspectable(terminalActivity.request)}</code></pre></section>}{terminalActivity?.output && <section><label>{terminalActivity.failed ? 'Error output' : 'Result'}</label><pre><code>{formatInspectable(terminalActivity.output)}</code></pre></section>}{relatedVisuals.length > 0 && <div className="computer-checkpoints"><span>{relatedVisuals.length} visual checkpoint{relatedVisuals.length === 1 ? '' : 's'} captured for this activity</span><div>{relatedVisuals.map((visual, index) => <button key={visual.id} onClick={() => inspectVisual(visual.id)} aria-label={`Inspect visual checkpoint ${index + 1} for ${active.title}`}>View frame {index + 1}</button>)}</div></div>}{terminalActivity?.toolUseId && <small>Tool call {terminalActivity.toolUseId.slice(-8)} · correlated with its paired result and visual checkpoints in this run.</small>}</div>}
    </section>
  </div>
}
