import { ArrowLeft, ArrowRight, CheckCircle2, Eye, FileCode2, Pause, Play, Presentation, Radio, ShieldCheck, TerminalSquare, Wrench } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { PresentationPanel, TaskSnapshot } from '../types'
import { artifactRailItems, causalVisualItemsFor, compareRunArtifacts, defaultComputerItem, evidenceItemId, filterItemsByRun, formatDuration, formatInspectable, matchesRailQuery, presentationItems, railCardTypeFor, runIdsFor, runLabel, summarizeRunEvidence, terminalActivityFor, virtualRailRange, visualEvidenceStateFor, type ComputerItem } from './computer-timeline-activity'

const iconFor = (item: ComputerItem) => item.kind === 'terminal' ? <TerminalSquare size={13} /> : item.kind === 'screenshot' ? <Eye size={13} /> : item.kind === 'preview' ? <Radio size={13} /> : item.kind === 'slide' ? <Presentation size={13} /> : item.kind === 'approval' ? <ShieldCheck size={13} /> : <FileCode2 size={13} />
const RAIL_ROW_HEIGHT = 68
const withCacheBust = (uri: string, value: number) => `${uri}${uri.includes('?') ? '&' : '?'}v=${value}`
const isBrowserEvidence = (value: unknown): value is { tool: string; url?: string } => Boolean(value) && typeof value === 'object' && typeof (value as { tool?: unknown }).tool === 'string' && (typeof (value as { url?: unknown }).url === 'string' || (value as { url?: unknown }).url === undefined)

const ArtifactRailEntry = ({ item, previousRunId, runIds, index, selected, total, events, onMove }: { item: ComputerItem; previousRunId?: string; runIds: string[]; index: number; selected: boolean; total: number; events: TaskSnapshot['events']; onMove: (index: number) => void }) => {
  const activity = item.kind === 'terminal' ? terminalActivityFor(item, events) : undefined
  const elapsed = formatDuration(activity?.durationMs)
  const title = activity?.command ? `CLI command · ${item.title}` : item.title
  const cardType = railCardTypeFor(item)
  return <div className="computer-rail-entry" data-rail-type={cardType}>{item.runId && item.runId !== previousRunId && <div className="computer-run-marker">{runLabel(item.runId, runIds)}</div>}<button className={selected ? 'selected' : ''} aria-current={selected ? 'true' : undefined} onClick={() => onMove(index)} aria-label={`${cardType} evidence: ${title}, event ${index + 1} of ${total}`}><span>{iconFor(item)}</span><div><small className="computer-card-type">{cardType}</small><strong>{title}</strong>{item.activityPreview && <code title={item.activityPreview}>{item.activityPreview}</code>}{item.relatedEventIds?.length ? <small className={activity?.failed ? 'computer-pair-status failed' : 'computer-pair-status'}>{activity?.failed ? 'failed' : `complete${elapsed ? ` · ${elapsed}` : ''}`}</small> : <small>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>}</div>{item.kind === 'screenshot' && item.uri && !item.live && <img className="computer-rail-thumbnail" src={item.uri} alt="" loading="lazy" />}</button></div>
}

export const ComputerTimeline = ({ task }: { task: TaskSnapshot }) => {
  const allItems = useMemo(() => presentationItems(task), [task])
  const railItems = useMemo(() => artifactRailItems(allItems), [allItems])
  const [filter, setFilter] = useState<'all' | PresentationPanel>('all')
  const [runFilter, setRunFilter] = useState('all')
  const [comparisonRunId, setComparisonRunId] = useState('')
  const [railQuery, setRailQuery] = useState('')
  const runIds = useMemo(() => runIdsFor(railItems), [railItems])
  const items = useMemo(() => filterItemsByRun(filter === 'all' ? railItems : railItems.filter((item) => item.kind === filter), runFilter).filter((item) => matchesRailQuery(item, railQuery)), [filter, railItems, railQuery, runFilter])
  const [selectedId, setSelectedId] = useState<string>()
  const [follow, setFollow] = useState(task.status === 'running' || task.status === 'waiting_for_approval' || task.status === 'waiting_for_user_input')
  const [newActivity, setNewActivity] = useState(0)
  const [replaying, setReplaying] = useState(false)
  const [frame, setFrame] = useState(Date.now())
  const [railScrollTop, setRailScrollTop] = useState(0)
  const [railViewportHeight, setRailViewportHeight] = useState(360)
  const previousFilter = useRef(`${filter}:${runFilter}`)
  const restoredReplayTask = useRef<string | undefined>(undefined)
  const railScrollRef = useRef<HTMLDivElement>(null)
  const itemKey = items.map((item) => item.id).join('|')
  const lastItemId = items.at(-1)?.id
  const selected = Math.max(0, items.findIndex((item) => item.id === selectedId))
  const settled = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
  const defaultItem = useMemo(() => defaultComputerItem(items, settled), [items, settled])
  const replayFrames = useMemo(() => filterItemsByRun(railItems, runFilter).filter((item) => item.kind === 'screenshot' && !item.live), [railItems, runFilter])
  const visibleRange = virtualRailRange(items.length, railScrollTop, railViewportHeight, RAIL_ROW_HEIGHT)
  const comparison = useMemo(() => comparisonRunId && runFilter !== 'all' && comparisonRunId !== runFilter ? { baseline: summarizeRunEvidence(railItems, comparisonRunId), candidate: summarizeRunEvidence(railItems, runFilter), artifacts: compareRunArtifacts(railItems, comparisonRunId, runFilter) } : undefined, [comparisonRunId, railItems, runFilter])
  useEffect(() => { setFollow(task.status === 'running' || task.status === 'waiting_for_approval' || task.status === 'waiting_for_user_input'); setNewActivity(0); setReplaying(false); setSelectedId(undefined); setFilter('all'); setRunFilter('all'); setComparisonRunId(''); setRailQuery('') }, [task.id, task.status])
  useEffect(() => {
    const filterKey = `${filter}:${runFilter}`
    if (previousFilter.current !== filterKey) { setFollow(false); setNewActivity(0); previousFilter.current = filterKey }
    if (follow && items.length) setSelectedId(items.at(-1)?.id)
    else if (defaultItem && !items.some((item) => item.id === selectedId)) setSelectedId(defaultItem.id)
  }, [defaultItem, filter, follow, items, runFilter, selectedId])
  useEffect(() => {
    if (follow && items.length) { setSelectedId(lastItemId); setNewActivity(0); return }
    setNewActivity((current) => Math.max(current, Math.max(0, items.length - selected - 1)))
  }, [follow, items.length, itemKey, lastItemId, selected])
  useEffect(() => {
    if (restoredReplayTask.current === task.id) return
    const params = new URLSearchParams(window.location.search)
    const requestedFilter = params.get('rail')
    if (requestedFilter === 'terminal' || requestedFilter === 'screenshot' || requestedFilter === 'file' || requestedFilter === 'preview' || requestedFilter === 'slide' || requestedFilter === 'approval' || requestedFilter === 'diff') setFilter(requestedFilter)
    const requestedRun = params.get('run')
    if (requestedRun && runIds.includes(requestedRun)) setRunFilter(requestedRun)
    const requestedComparison = params.get('compare')
    if (requestedComparison && runIds.includes(requestedComparison)) setComparisonRunId(requestedComparison)
    const eventId = evidenceItemId(railItems, params.get('event'))
    if (eventId) {
      const index = railItems.findIndex((item) => item.id === eventId)
      setFilter('all'); setFollow(false); setNewActivity(0); setSelectedId(railItems[index].id)
    }
    restoredReplayTask.current = task.id
  }, [railItems, runIds, task.id])
  const active = items[Math.min(selected, Math.max(items.length - 1, 0))]
  const terminalActivity = active?.kind === 'terminal' ? terminalActivityFor(active, task.events) : undefined
  const relatedVisuals = active?.kind === 'terminal' ? causalVisualItemsFor(active.id, allItems) : []
  const visualEvidenceState = active?.kind === 'terminal' ? visualEvidenceStateFor(active, allItems) : 'not_applicable'
  useEffect(() => {
    if (!active?.live) return
    setFrame(Date.now())
    const timer = window.setInterval(() => setFrame(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [active?.live])
  useEffect(() => {
    const element = railScrollRef.current
    if (!element || !active?.id) return
    const top = selected * RAIL_ROW_HEIGHT
    const bottom = top + RAIL_ROW_HEIGHT
    if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) element.scrollTo({ top: Math.max(0, top - Math.floor(element.clientHeight / 2) + Math.floor(RAIL_ROW_HEIGHT / 2)), behavior: 'auto' })
  }, [active?.id, filter, selected])
  useEffect(() => {
    const element = railScrollRef.current
    if (!element) return
    const update = () => setRailViewportHeight(element.clientHeight || 360)
    update()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])
  const persistEvidenceReference = useCallback((item: ComputerItem | undefined, persistedFilter = filter) => {
    if (!item?.eventHash) return
    const url = new URL(window.location.href)
    url.searchParams.set('event', item.id)
    if (persistedFilter === 'all') url.searchParams.delete('rail')
    else url.searchParams.set('rail', persistedFilter)
    if (runFilter === 'all') url.searchParams.delete('run')
    else url.searchParams.set('run', runFilter)
    if (!comparisonRunId || comparisonRunId === runFilter || runFilter === 'all') url.searchParams.delete('compare')
    else url.searchParams.set('compare', comparisonRunId)
    window.history.replaceState(window.history.state, '', url)
  }, [comparisonRunId, filter, runFilter])
  useEffect(() => {
    // Keep review state shareable even when the reviewer only changes filters
    // and never selects another evidence card.
    if (restoredReplayTask.current !== task.id) return
    const url = new URL(window.location.href)
    if (filter === 'all') url.searchParams.delete('rail')
    else url.searchParams.set('rail', filter)
    if (runFilter === 'all') url.searchParams.delete('run')
    else url.searchParams.set('run', runFilter)
    if (!comparisonRunId || comparisonRunId === runFilter || runFilter === 'all') url.searchParams.delete('compare')
    else url.searchParams.set('compare', comparisonRunId)
    window.history.replaceState(window.history.state, '', url)
  }, [comparisonRunId, filter, runFilter, task.id])
  useEffect(() => {
    if (!replaying || filter !== 'screenshot' || items.length < 2) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      const next = selected >= items.length - 1 ? 0 : selected + 1
      setSelectedId(items[next]?.id)
      persistEvidenceReference(items[next], 'screenshot')
    }, reducedMotion ? 2_400 : 1_250)
    return () => window.clearTimeout(timer)
  }, [filter, items, persistEvidenceReference, replaying, selected])
  const move = (next: number) => { const index = Math.max(0, Math.min(items.length - 1, next)); setReplaying(false); setFollow(false); setSelectedId(items[index]?.id); persistEvidenceReference(items[index]) }
  const resumeLive = () => { const index = items.length - 1; setReplaying(false); setFollow(true); setNewActivity(0); setSelectedId(items[index]?.id); persistEvidenceReference(items[index]) }
  const toggleReplay = () => {
    if (replaying) { setReplaying(false); return }
    if (replayFrames.length < 2) return
    setFilter('screenshot')
    setRailQuery('')
    setFollow(false)
    setNewActivity(0)
    setSelectedId(replayFrames[0]?.id)
    setReplaying(true)
  }
  const inspectVisual = (eventId: string) => {
    const index = railItems.findIndex((item) => item.id === eventId)
    if (index < 0) return
    setReplaying(false)
    setFilter('all')
    setFollow(false)
    setNewActivity(0)
    setSelectedId(railItems[index].id)
    persistEvidenceReference(railItems[index], 'all')
  }
  const onTimelineKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(selected - 1) }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(selected + 1) }
    if (event.key === 'Home') { event.preventDefault(); move(0) }
    if (event.key === 'End') { event.preventDefault(); resumeLive() }
  }
  if (!allItems.length) return <div className="workspace-placeholder"><Wrench size={20} /><strong>No computer activity yet</strong><span>Commands, screenshots, files, and previews will appear here as the agent works.</span></div>
  return <div className="computer-timeline" onKeyDown={onTimelineKeyDown} tabIndex={0} aria-label="Agent computer artifact timeline">
    <aside className="computer-history"><div className="computer-history-heading"><span>Artifact rail</span><div>{replayFrames.length > 1 && <button className={replaying ? 'active' : ''} onClick={toggleReplay} aria-label={replaying ? 'Pause visual evidence replay' : 'Replay visual evidence'} title={replaying ? 'Pause replay' : 'Replay visual evidence'}>{replaying ? <Pause size={10} /> : <Play size={10} />} {replaying ? 'Pause' : 'Replay'}</button>}<button className={follow ? 'active' : ''} onClick={resumeLive} aria-label="Resume live follow"><Radio size={10} /> {follow ? 'Live' : newActivity ? `${newActivity} new` : 'Resume'}</button></div></div><div className="computer-filters">{(['all', 'terminal', 'screenshot', 'file', 'preview', 'slide', 'approval', 'diff'] as const).filter((kind) => kind === 'all' || railItems.some((item) => item.kind === kind)).map((kind) => <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => { setReplaying(false); setFilter(kind) }}>{kind === 'all' ? 'All' : kind}</button>)}{runIds.length > 1 && <><select value={runFilter} onChange={(event) => { setReplaying(false); setComparisonRunId(''); setRunFilter(event.target.value) }} aria-label="Filter artifact evidence by run"><option value="all">All runs</option>{runIds.map((runId) => <option key={runId} value={runId}>{runLabel(runId, runIds)}</option>)}</select>{runFilter !== 'all' && <select value={comparisonRunId} onChange={(event) => setComparisonRunId(event.target.value)} aria-label="Compare selected run against another run"><option value="">Compare…</option>{runIds.filter((runId) => runId !== runFilter).map((runId) => <option key={runId} value={runId}>vs {runLabel(runId, runIds)}</option>)}</select>}</>}</div>{comparison && <div className="computer-run-comparison"><strong>{runLabel(comparison.candidate.runId, runIds)} vs {runLabel(comparison.baseline.runId, runIds)}</strong><span>{comparison.candidate.toolCards} tools · {comparison.candidate.visualFrames} frames · {comparison.candidate.deliverables} deliverables</span><small>{comparison.candidate.cards - comparison.baseline.cards >= 0 ? '+' : ''}{comparison.candidate.cards - comparison.baseline.cards} evidence cards · {formatDuration(comparison.candidate.durationMs) ?? 'single event'} vs {formatDuration(comparison.baseline.durationMs) ?? 'single event'}</small>{(comparison.artifacts.added.length > 0 || comparison.artifacts.removed.length > 0) && <small className="computer-run-artifact-delta">{comparison.artifacts.added.length ? `+ ${comparison.artifacts.added.join(', ')}` : ''}{comparison.artifacts.added.length && comparison.artifacts.removed.length ? ' · ' : ''}{comparison.artifacts.removed.length ? `− ${comparison.artifacts.removed.join(', ')}` : ''}{comparison.artifacts.truncated ? ' · more' : ''}</small>}</div>}<label className="computer-rail-search"><span>Find evidence</span><input value={railQuery} onChange={(event) => { setReplaying(false); setRailQuery(event.target.value) }} placeholder="Command, artifact, run…" aria-label="Find projected task evidence" /></label>{items.length > 0 && <label className="computer-rail-scrubber"><span><b>Scrub evidence</b><em>{selected + 1} / {items.length}{active ? ` · ${new Date(active.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</em></span><input type="range" min="0" max={Math.max(items.length - 1, 0)} value={selected} disabled={items.length < 2} onChange={(event) => move(Number(event.target.value))} aria-label="Scrub chronological task evidence" /></label>}<div className="computer-rail-scroll" ref={railScrollRef} onScroll={(event) => setRailScrollTop(event.currentTarget.scrollTop)}>{items.length ? <div className="computer-rail-virtual" style={{ height: items.length * RAIL_ROW_HEIGHT }}><div style={{ transform: `translateY(${visibleRange.start * RAIL_ROW_HEIGHT}px)` }}>{items.slice(visibleRange.start, visibleRange.end).map((item, offset) => { const index = visibleRange.start + offset; return <ArtifactRailEntry key={item.id} item={item} previousRunId={items[index - 1]?.runId} runIds={runIds} index={index} selected={index === selected} total={items.length} events={task.events} onMove={move} /> })}</div></div> : <p className="computer-rail-empty">No projected evidence matches this search.</p>}</div></aside>
    <section className="computer-stage"><header><button disabled={selected === 0} onClick={() => move(selected - 1)} aria-label="Previous timeline event"><ArrowLeft size={13} /></button><button disabled={selected >= items.length - 1} onClick={() => move(selected + 1)} aria-label="Next timeline event"><ArrowRight size={13} /></button><div><strong>{active?.title}</strong><span>{active?.detail}</span></div><em>{active?.runId ? `${runLabel(active.runId, runIds)} · ` : ''}{active?.sequence ? `#${active.sequence} · ` : ''}{selected + 1} / {items.length}{filter !== 'all' && ` · ${filter}`}{active?.eventHash && <code title="Immutable evidence hash">{active.eventHash.slice(0, 8)}</code>}{replaying ? <b>replaying</b> : !follow && !settled && <b>paused</b>}</em></header>
      {active?.kind === 'screenshot' && active.uri && <div className="computer-visual"><img src={withCacheBust(active.uri, frame)} alt={active.title} /></div>}
      {active?.kind === 'preview' && active.uri && <iframe title={active.title} sandbox="allow-scripts" src={active.uri} />}
      {active?.kind === 'slide' && <div className="computer-file"><Presentation size={28} /><strong>{active.detail ?? active.title}</strong><span>Deck evidence is preserved. Open the Files tab to download the PPTX or inspect the rendered viewer.</span></div>}
      {active?.kind === 'approval' && <div className="computer-file"><CheckCircle2 size={28} /><strong>{active.title}</strong><span>{active.detail ?? 'Approval evidence is recorded separately from the browser and can be verified in the task history.'}</span></div>}
      {(active?.kind === 'file' || active?.kind === 'diff') && <div className="computer-file"><FileCode2 size={28} /><strong>{active.detail ?? active.title}</strong><span>{active.kind === 'diff' ? 'Open the Code tab to inspect the recorded version change.' : 'Open the Files or Code tab to inspect this artifact.'}</span></div>}
      {active?.kind === 'terminal' && <div className="computer-terminal"><div className="computer-terminal-meta"><span>{terminalActivity?.command ? `CLI command · ${active.title}` : active.title}</span>{terminalActivity?.failed ? <b>tool error</b> : <em>{terminalActivity?.durationMs !== undefined ? `completed in ${formatDuration(terminalActivity.durationMs)}` : 'recorded activity'}</em>}</div>{active.payload?.browserTool === true && <small className="computer-browser-evidence">Governed browser evidence · sandbox only{isBrowserEvidence(active.payload.browserEvidence) && active.payload.browserEvidence.url ? ` · ${active.payload.browserEvidence.url}` : ''}</small>}{terminalActivity?.command ? <section><label>Command · {terminalActivity.workspaceLabel}</label><pre><code>$ {terminalActivity.command}</code></pre></section> : terminalActivity?.request !== undefined && <section><label>Request</label><pre><code>{formatInspectable(terminalActivity.request)}</code></pre></section>}{terminalActivity?.output && <section><label>{terminalActivity.failed ? 'Error output' : terminalActivity.command ? 'Command output' : 'Result'}</label><pre><code>{formatInspectable(terminalActivity.output)}</code></pre></section>}{relatedVisuals.length > 0 && <div className="computer-checkpoints"><span>{relatedVisuals.length} causal visual checkpoint{relatedVisuals.length === 1 ? '' : 's'}</span><div className="computer-checkpoint-gallery">{relatedVisuals.map((visual, index) => <button key={visual.id} onClick={() => inspectVisual(visual.id)} aria-label={`Inspect visual checkpoint ${index + 1} for ${active.title}`}><img src={withCacheBust(visual.uri ?? '', frame)} alt={`Checkpoint ${index + 1}: ${visual.title}`} loading="lazy" /><small>Frame {index + 1} · #{visual.sequence ?? '—'}</small></button>)}</div></div>}{visualEvidenceState === 'unavailable' && <div className="computer-visual-unavailable"><Eye size={14} /><div><strong>No visual checkpoint captured</strong><span>This browser action is preserved as tool evidence only. No screenshot is being implied.</span></div></div>}{terminalActivity?.toolUseId && <small>Tool call {terminalActivity.toolUseId.slice(-8)} · correlated with its paired result and visual checkpoints in this run.</small>}</div>}
    </section>
  </div>
}
