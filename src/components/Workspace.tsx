import { Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Code2, Copy, Download, Eye, File, Files, GitFork, Globe2, History, Image, LoaderCircle, Maximize2, Minimize2, Network, Palette, Pencil, Presentation, RefreshCw, Save, Search, Settings2, ShieldCheck, Table2, TerminalSquare, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compareVersion, copyTask, getEvidence, getFile, getFiles, getVersions, restoreVersion, updateFile } from '../lib/api'
import type { Project, RuntimeCapability, RuntimeReadiness, TaskSnapshot, WorkspaceFile, WorkspaceVersion, WorkspaceVersionComparison } from '../types'
import { ComputerTimeline } from './ComputerTimeline'
import { HighlightedCode } from './HighlightedCode'
import { workspaceLocationForTab, workspaceTabFromSearch, type WorkspaceTab } from './workspace-navigation'
import { ValidationReportPane } from './ValidationReport'
import { filterDataRows } from './data-table'
import { parseCsv } from '../lib/csv'
import { providerLabel } from '../lib/runtime-labels'

type Tab = WorkspaceTab
type SlideOutline = { number: number; title: string; summary: string }
type DesignDirection = { id: string; name: string; rationale: string; confidence: number; selected: boolean }
type DesignPhilosophy = { name: string; description: string }

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
const isBinary = (filePath: string) => /\.(pptx|pdf|png|jpe?g|gif|zip)$/i.test(filePath)
const formatElapsed = (milliseconds: number) => milliseconds < 1_000 ? '<1s' : milliseconds < 60_000 ? `${Math.round(milliseconds / 1_000)}s` : `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`
const initialTabFor = (task: TaskSnapshot): Tab => {
  const requested = new URLSearchParams(window.location.search).get('tab')
  if (requested) return workspaceTabFromSearch(window.location.search)
  if (task.mode === 'chat') return 'dashboard'
  return task.events.some((event) => event.type.startsWith('tool_call')) ? 'computer' : 'preview'
}
const activitySummary = (event: TaskSnapshot['events'][number]) => {
  if (event.label) return event.label
  if (event.type === 'tool_call_started') return 'Tool started'
  if (event.type === 'tool_call_completed') return 'Tool completed'
  if (event.type === 'run_started') return 'Agent run started'
  if (event.type === 'run_completed') return 'Agent run completed'
  return event.type.replaceAll('_', ' ')
}
const activityIcon = (event: TaskSnapshot['events'][number]) => {
  if (event.payload.isError === true || event.type.includes('failed')) return <TriangleAlert size={13} />
  if (event.type === 'run_completed' || event.type === 'tool_call_completed' || event.type === 'artifact_created') return <CheckCircle2 size={13} />
  if (event.type === 'run_started' || event.type === 'tool_call_started') return <LoaderCircle className="spin" size={13} />
  return <Activity size={13} />
}

export const Workspace = ({ task, projects, runtime, onMoveProject, onUpdateTags }: { task: TaskSnapshot; projects: Project[]; runtime?: RuntimeReadiness; onMoveProject: (taskId: string, projectId: string) => Promise<void>; onUpdateTags: (taskId: string, tags: string[]) => Promise<void> }) => {
  const [tab, setTab] = useState<Tab>(() => initialTabFor(task))
  const manualTabSelection = useRef(Boolean(new URLSearchParams(window.location.search).get('tab')))
  const [files, setFiles] = useState<WorkspaceFile[]>(task.files)
  const [selectedFile, setSelectedFile] = useState<string | null>(task.files[0]?.path ?? null)
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [contentHash, setContentHash] = useState('')
  const [codeView, setCodeView] = useState<'original' | 'modified' | 'diff'>('original')
  const [editing, setEditing] = useState(false)
  const [chainValid, setChainValid] = useState<boolean | null>(null)
  const [versions, setVersions] = useState<WorkspaceVersion[]>([])
  const [comparison, setComparison] = useState<WorkspaceVersionComparison | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [visualFrame, setVisualFrame] = useState(0)
  const [visualError, setVisualError] = useState(false)
  const [slides, setSlides] = useState<SlideOutline[]>([])
  const [speakerNotes, setSpeakerNotes] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [dataError, setDataError] = useState<string | null>(null)
  const [dataQuery, setDataQuery] = useState('')
  const [designDirections, setDesignDirections] = useState<DesignDirection[]>([])
  const [designPhilosophy, setDesignPhilosophy] = useState<DesignPhilosophy | null>(null)
  const [movingProject, setMovingProject] = useState(false)
  const [projectMoveError, setProjectMoveError] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState(task.tags.join(', '))
  const [savingTags, setSavingTags] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const [workspaceRefresh, setWorkspaceRefresh] = useState(0)
  const runtimeCapabilities = runtime?.providers.find((candidate) => candidate.id === task.provider)?.capabilities
  const hasCapability = (capability: RuntimeCapability) => runtimeCapabilities ? runtimeCapabilities.includes(capability) : true
  const completedSteps = task.plan.filter((step) => step.status === 'completed').length
  const observability = useMemo(() => {
    const startedAt = task.events.find((event) => event.type === 'run_started')?.createdAt ?? task.createdAt
    const endedAt = task.events.at(-1)?.createdAt ?? task.updatedAt
    const tools = task.events.filter((event) => event.type.startsWith('tool_call'))
    const toolCalls = tools.filter((event) => event.type === 'tool_call_started').length
    const toolFailures = tools.filter((event) => event.payload.isError === true).length
    const visualFrames = task.events.filter((event) => event.payload.kind === 'visual_frame').length
    const artifacts = task.events.filter((event) => event.type === 'artifact_created' || event.type === 'artifact_updated').length
    const duration = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
    return { startedAt, duration, toolCalls, toolFailures, visualFrames, artifacts }
  }, [task.createdAt, task.events, task.updatedAt])
  const browserReview = useMemo(() => {
    const event = [...task.events].reverse().find((candidate) => candidate.label === 'Sandbox browser review observed' || candidate.label === 'Sandbox browser review not observed')
    if (event?.label === 'Sandbox browser review observed') return { state: 'observed', detail: 'Allowlisted sandbox browser activity is recorded' }
    if (event?.label === 'Sandbox browser review not observed') return { state: 'not observed', detail: 'Browser was enabled, but no review tool was recorded' }
    return { state: 'not requested', detail: 'No browser-review evidence was requested for this task' }
  }, [task.events])
  const meaningfulActivity = useMemo(() => task.events.filter((event) => {
    if (event.lane === 'transcript' || event.type === 'assistant_text_delta') return false
    return !/^Claude SDK · (init|status|stream event|assistant|prompt suggestion|thinking tokens)$/i.test(event.label ?? '')
  }).slice(-8).reverse(), [task.events])
  const filteredDataRows = useMemo(() => filterDataRows(dataRows, dataQuery), [dataQuery, dataRows])

  const selectTab = (next: Tab) => {
    manualTabSelection.current = true
    setTab(next)
    window.history.pushState(window.history.state, '', workspaceLocationForTab(window.location.href, next))
  }

  useEffect(() => {
    const restore = () => setTab(workspaceTabFromSearch(window.location.search))
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  // Reset only when the conversation changes; event updates are handled by
  // the guarded auto-computer effect below so a reviewer can keep a manual tab.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { manualTabSelection.current = Boolean(new URLSearchParams(window.location.search).get('tab')); setTab(initialTabFor(task)) }, [task.id])
  useEffect(() => {
    if (manualTabSelection.current) return
    if (tab === 'preview' && task.events.some((event) => event.type.startsWith('tool_call'))) setTab('computer')
  }, [tab, task.events])
  useEffect(() => { setTagDraft(task.tags.join(', ')); setTagError(null) }, [task.id, task.tags])
  useEffect(() => {
    if (workspaceTabFromSearch(window.location.search) === tab) return
    window.history.pushState(window.history.state, '', workspaceLocationForTab(window.location.href, tab))
  }, [tab])

  useEffect(() => {
    void getFiles(task.id).then((result) => {
      setFiles(result.files)
      setSelectedFile((current) => current ?? result.files[0]?.path ?? null)
    })
  }, [task.events.length, task.id, workspaceRefresh])
  useEffect(() => {
    if (!selectedFile) return
    if (isBinary(selectedFile)) { setContent(''); setDraft(''); return }
    void getFile(task.id, selectedFile).then((result) => {
      setContent(result.content); setDraft(result.content); setContentHash(result.contentHash); setCodeView('original'); setEditing(false)
    })
  }, [selectedFile, task.id])
  useEffect(() => { if (tab === 'evidence') void getEvidence(task.id).then((result) => setChainValid(result.valid)) }, [tab, task.id, task.events.length])
  useEffect(() => { if (tab === 'history') { setComparison(null); setComparisonError(null); void getVersions(task.id).then((result) => setVersions(result.versions)) } }, [tab, task.id, task.events.length])
  useEffect(() => {
    if (tab !== 'slides' || task.mode !== 'slides') return
    void Promise.all([getFile(task.id, 'outline.json'), getFile(task.id, 'speaker-notes.md')]).then(([outline, notes]) => {
      try { setSlides(JSON.parse(outline.content) as SlideOutline[]); setActiveSlide(0); setSpeakerNotes(notes.content) } catch { setSlides([]); setSpeakerNotes('') }
    })
  }, [tab, task.id, task.mode])
  useEffect(() => {
    if (tab !== 'design' || task.mode !== 'design') return
    void getFile(task.id, 'design-directions.json').then((result) => {
      try { const parsed = JSON.parse(result.content) as { directions?: DesignDirection[]; philosophy?: DesignPhilosophy }; setDesignDirections(Array.isArray(parsed.directions) ? parsed.directions : []); setDesignPhilosophy(parsed.philosophy?.name && parsed.philosophy.description ? parsed.philosophy : null) } catch { setDesignDirections([]); setDesignPhilosophy(null) }
    }).catch(() => { setDesignDirections([]); setDesignPhilosophy(null) })
  }, [tab, task.id, task.mode])
  useEffect(() => {
    if (tab !== 'database' || task.mode !== 'data') return
    setDataQuery('')
    setDataError(null)
    void getFile(task.id, 'data.csv').then((result) => {
      try {
        const parsed = parseCsv(result.content)
        setDataRows([parsed.headers, ...parsed.rows])
      } catch (error) {
        setDataRows([])
        setDataError(error instanceof Error ? error.message : 'CSV could not be parsed safely')
      }
    }).catch((error: unknown) => { setDataRows([]); setDataError(error instanceof Error ? error.message : 'Dataset unavailable') })
  }, [tab, task.id, task.mode])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  useEffect(() => {
    if (tab !== 'visual' || !task.securityContext?.visualRuntimeReady || task.securityContext.sandboxState === 'destroyed') return
    setVisualError(false)
    setVisualFrame(Date.now())
    const timer = window.setInterval(() => setVisualFrame(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [tab, task.securityContext?.sandboxState, task.securityContext?.visualRuntimeReady])

  const activePreview = useMemo(() => `${task.previewPath ?? `/api/tasks/${task.id}/preview`}?v=${task.events.length}`, [task.events.length, task.id, task.previewPath])
  const assetFiles = useMemo(() => files.filter((file) => /\.(svg|png|jpe?g|gif)$/i.test(file.path) && !file.path.startsWith('evidence/')), [files])
  const diff = useMemo(() => {
    const before = content.split('\n'); const after = draft.split('\n'); const lines: string[] = []
    for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
      if (before[index] === after[index]) lines.push(`  ${before[index] ?? ''}`)
      else { if (before[index] !== undefined) lines.push(`- ${before[index]}`); if (after[index] !== undefined) lines.push(`+ ${after[index]}`) }
    }
    return lines.join('\n')
  }, [content, draft])

  const save = async () => {
    if (!selectedFile || !contentHash) return
    const result = await updateFile(task.id, selectedFile, draft, contentHash)
    setContent(result.content); setDraft(result.content); setContentHash(result.contentHash); setEditing(false); setCodeView('original')
  }

  return (
    <section className={`workspace secure-signal-cut ${fullscreen ? 'workspace-fullscreen' : ''}`}>
      <header className="workspace-header">
        <div className="window-controls"><i /><i /><i /></div>
        <div className="workspace-tabs">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => selectTab('dashboard')}><Activity size={14} /> Activity</button>
          <button className={tab === 'computer' ? 'active' : ''} onClick={() => selectTab('computer')}><TerminalSquare size={14} /> Computer</button>
          <button className={tab === 'observe' ? 'active' : ''} onClick={() => selectTab('observe')}><Network size={14} /> Observe</button>
          {files.some((file) => file.path === 'validation-report.json') && <button className={tab === 'validation' ? 'active' : ''} onClick={() => selectTab('validation')}><ClipboardCheck size={14} /> Validate</button>}
          <button className={tab === 'preview' ? 'active' : ''} onClick={() => selectTab('preview')}><Globe2 size={14} /> Preview</button>
          {task.mode === 'slides' && <button className={tab === 'slides' ? 'active' : ''} onClick={() => selectTab('slides')}><Presentation size={14} /> Deck</button>}
          {task.mode === 'design' && <button className={tab === 'design' ? 'active' : ''} onClick={() => selectTab('design')}><Palette size={14} /> Directions</button>}
          {task.mode === 'data' && <button className={tab === 'database' ? 'active' : ''} onClick={() => selectTab('database')}><Table2 size={14} /> Data</button>}
          {assetFiles.length > 0 && <button className={tab === 'assets' ? 'active' : ''} onClick={() => selectTab('assets')}><Image size={14} /> Assets</button>}
          {hasCapability('computer_use') && <button className={tab === 'visual' ? 'active' : ''} onClick={() => selectTab('visual')}><Eye size={14} /> Live X11</button>}
          <button className={tab === 'code' ? 'active' : ''} onClick={() => selectTab('code')}><Code2 size={14} /> Code</button>
          {hasCapability('file_system') && <button className={tab === 'files' ? 'active' : ''} onClick={() => selectTab('files')}><Files size={14} /> Files</button>}
          <button className={tab === 'history' ? 'active' : ''} onClick={() => selectTab('history')}><History size={14} /> History</button>
          <button className={tab === 'evidence' ? 'active' : ''} onClick={() => selectTab('evidence')}><ShieldCheck size={14} /> Evidence</button>
          {task.status === 'completed' && <button className={tab === 'handoff' ? 'active' : ''} onClick={() => selectTab('handoff')}><GitFork size={14} /> Handoff</button>}
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => selectTab('settings')}><Settings2 size={14} /> Settings</button>
        </div>
        <div className="workspace-tools"><button title="Make a provenance-linked copy" aria-label="Make a provenance-linked copy" onClick={() => void copyTask(task.id).then((copy) => window.location.assign(`/tasks/${copy.id}`))}><Copy size={14} /></button><a title="Download source, evidence, and GitHub handoff" aria-label="Download source, evidence, and GitHub handoff" href={`/api/tasks/${task.id}/download`}><Download size={14} /></a><button title="Refresh workspace files" aria-label="Refresh workspace files" onClick={() => setWorkspaceRefresh((value) => value + 1)}><RefreshCw size={14} /></button><button title={fullscreen ? 'Exit fullscreen' : 'Expand workspace'} aria-label={fullscreen ? 'Exit fullscreen' : 'Expand workspace'} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button></div>
      </header>
              <div className="workspace-meta"><span className="live-dot" /> local.onevibe.dev/{task.id.slice(-6)}<span className="workspace-policy"><ShieldCheck size={12} /> {task.securityContext?.gatewayEnforced ? 'ONEComputer gateway enforced' : `${providerLabel(task.provider)} policy`}</span></div>
      <div className="workspace-body">
        <AnimatePresence mode="wait">
          {tab === 'dashboard' && <motion.div key="dashboard" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="dashboard-pane"><header><div><span>Task workspace</span><strong>{task.status.replaceAll('_', ' ')}</strong></div><p>{task.securityContext?.executionBoundary === 'onecomputer_sandbox' ? 'ONEComputer sandbox boundary' : task.securityContext?.executionBoundary === 'remote_runtime' ? 'Remote runtime boundary' : 'Local task workspace'}</p></header><div className="dashboard-grid"><article><span>Plan progress</span><strong>{completedSteps} / {task.plan.length}</strong><small>{task.plan.find((step) => step.status === 'running')?.title ?? 'No active plan step'}</small></article><article><span>Portable artifacts</span><strong>{files.filter((file) => !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/')).length}</strong><small>{files.length} files in workspace</small></article><article><span>Evidence events</span><strong>{task.events.length}</strong><small>{task.activeRunId ? `Active run ${task.activeRunId.slice(-6)}` : 'No active run'}</small></article><article><span>Approval boundary</span><strong>{task.approval?.state ?? 'none'}</strong><small>{task.approval ? 'Decision remains in VTI Wallet' : 'No consequential action pending'}</small></article></div><section className="dashboard-boundary"><ShieldCheck size={17} /><div><strong>{task.securityContext?.gatewayEnforced ? 'Gateway enforcement attested' : 'Policy boundary visible'}</strong><span>{task.securityContext?.gatewayEnforced ? 'Runtime reports gateway enforcement for this task.' : 'This task does not claim production gateway attestation.'}</span></div></section><section className="activity-rail-panel"><header><div><span>Live execution</span><strong>{task.status === 'running' ? 'Agent is working' : 'Execution record'}</strong></div><small>{task.events.length} durable events · replayable</small></header><div className="activity-rail-progress"><div className="activity-rail-progress-label"><span>Plan</span><strong>{completedSteps} / {task.plan.length}</strong></div><div className="activity-rail-progress-track"><motion.span animate={{ width: `${task.plan.length ? (completedSteps / task.plan.length) * 100 : 0}%` }} /></div></div><div className="activity-rail-events">{meaningfulActivity.map((event) => <article key={event.id} className={event.payload.isError === true ? 'error' : ''}><span className="activity-rail-icon">{activityIcon(event)}</span><div><strong>{activitySummary(event)}</strong><small>{event.content ? event.content.slice(0, 150) : event.type.replaceAll('_', ' ')}</small></div><time>{new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}</div><p className="activity-rail-note"><ShieldCheck size={12} /> Activity is projected from the server-owned event ledger. Hidden reasoning and credentials are never shown.</p></section></motion.div>}
          {tab === 'computer' && <motion.div key="computer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="computer-pane"><ComputerTimeline task={task} /></motion.div>}
          {tab === 'observe' && <motion.div key="observe" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="observability-pane"><header><div><span>Task-scoped execution facts</span><strong>Observability</strong></div><em>Derived from recorded events</em></header><div className="observability-grid"><article><span>Observed duration</span><strong>{formatElapsed(observability.duration)}</strong><small>From task start to latest recorded event</small></article><article><span>Tool calls</span><strong>{observability.toolCalls}</strong><small>{observability.toolFailures ? `${observability.toolFailures} reported errors` : 'No reported tool errors'}</small></article><article><span>Visual evidence</span><strong>{observability.visualFrames}</strong><small>{task.securityContext?.visualRuntimeReady ? 'X11 capture enabled' : 'No visual runtime attested'}</small></article><article><span>Browser review</span><strong>{browserReview.state}</strong><small>{browserReview.detail}</small></article><article><span>Artifacts</span><strong>{observability.artifacts}</strong><small>{files.filter((file) => !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/')).length} portable files available</small></article></div><section className="observability-run"><div><Activity size={15} /><span>Run boundary</span></div><strong>{providerLabel(task.provider)}</strong><small>Started {new Date(observability.startedAt).toLocaleString()} · {task.securityContext?.gatewayEnforced ? 'gateway enforcement attested' : 'no gateway attestation claimed'}</small></section><section className="observability-note"><ShieldCheck size={14} /><p>This is a review surface, not an infrastructure control plane. It reports only task evidence available to ONEVibe; provider metrics, network flows, and organization telemetry are intentionally not inferred.</p></section></motion.div>}
          {tab === 'validation' && <motion.div key="validation" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="validation-pane-wrap"><ValidationReportPane taskId={task.id} /></motion.div>}
          {tab === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="preview-pane">
              {task.previewPath ? <iframe title="Generated workspace preview" sandbox="allow-scripts" src={activePreview} /> : <div className="workspace-placeholder"><RefreshCw className="spin" size={20} /><strong>Preparing preview</strong><span>Building the task workspace.</span></div>}
            </motion.div>
          )}
          {tab === 'slides' && <motion.div key="slides" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="deck-pane">{slides.length ? <><aside aria-label="Slide outline thumbnails"><div className="deck-rail-heading"><span>Deck</span><small>{slides.length} slides</small></div>{slides.map((slide, index) => <button key={slide.number} className={index === activeSlide ? 'active' : ''} onClick={() => setActiveSlide(index)} aria-label={`Open slide ${slide.number}: ${slide.title}`}><div className="slide-thumbnail"><span>{String(slide.number).padStart(2, '0')}</span><strong>{slide.title}</strong><i /></div><small>{slide.summary}</small></button>)}</aside><section><div className="deck-review-header"><div><span>ONEVIBE · GOVERNED DECK</span><strong>Slide {String(slides[activeSlide]?.number).padStart(2, '0')} of {String(slides.length).padStart(2, '0')}</strong></div><div className="deck-controls"><button disabled={activeSlide === 0} onClick={() => setActiveSlide((current) => current - 1)} aria-label="Previous slide"><ArrowLeft size={13} /></button><button disabled={activeSlide === slides.length - 1} onClick={() => setActiveSlide((current) => current + 1)} aria-label="Next slide"><ArrowRight size={13} /></button></div></div><div className="deck-slide"><span>Slide {slides[activeSlide]?.number} / {slides.length}</span><h2>{slides[activeSlide]?.title}</h2><p>{slides[activeSlide]?.summary}</p><div className="deck-slide-mark"><Presentation size={15} /><span>Portable PPTX · evidence-bound notes</span></div></div><article className="speaker-notes"><header><div><strong>Speaker notes</strong><span>Reviewable source for this slide</span></div><button onClick={() => { setSelectedFile('speaker-notes.md'); setTab('code') }}>Edit notes <Pencil size={11} /></button></header><p>{speakerNotes.match(new RegExp(`## ${slides[activeSlide]?.number}\\. [^\\n]+\\n\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim() ?? 'No notes for this slide.'}</p></article></section></> : <div className="workspace-placeholder"><Presentation size={20} /><strong>Deck outline unavailable</strong><span>Open the Files tab to inspect the portable slide artifacts.</span></div>}</motion.div>}
          {tab === 'design' && <motion.div key="design" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="design-pane">{designDirections.length ? <><header><div><Palette size={17} /><div><span>Design exploration</span><strong>{designPhilosophy?.name ?? 'Choose a direction to develop'}</strong></div></div><em>Starter heuristic · review required</em></header>{designPhilosophy && <section className="design-philosophy"><span>Design philosophy</span><p>{designPhilosophy.description}</p></section>}<section className="brand-mark-preview"><img src={`/api/tasks/${task.id}/file?path=brand-mark.svg&raw=1`} alt={`Generated brand mark for ${task.title}`} /><div><span>Portable brand mark</span><strong>brand-mark.svg</strong><small>Generated from the selected design direction; review before external use.</small></div></section><div className="design-direction-grid">{designDirections.map((direction) => <article className={direction.selected ? 'selected' : ''} key={direction.id}><div><span>{direction.selected ? 'Selected direction' : 'Alternative direction'}</span><strong>{direction.name}</strong></div><p>{direction.rationale}</p><footer><div><i><b style={{ width: `${Math.round(direction.confidence * 100)}%` }} /></i><small>{Math.round(direction.confidence * 100)}% heuristic fit</small></div>{direction.selected && <Check size={15} />}</footer></article>)}</div><p className="design-note"><ShieldCheck size={13} /> These scores are deterministic starter heuristics for comparison, not model probabilities, user research, or a substitute for design review.</p></> : <div className="workspace-placeholder"><Palette size={20} /><strong>Design directions unavailable</strong><span>Open the Files tab to inspect the portable design artifacts.</span></div>}</motion.div>}
          {tab === 'database' && <motion.div key="database" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="database-pane">{dataError ? <div className="workspace-placeholder"><TriangleAlert size={20} /><strong>Dataset needs review</strong><span>{dataError}</span><button onClick={() => { setSelectedFile('data.csv'); setTab('code') }}>Open CSV source <Code2 size={12} /></button></div> : dataRows.length ? <><header><div><Table2 size={17} /><div><span>Generated dataset</span><strong>{filteredDataRows.length} / {dataRows.length - 1} rows · {dataRows[0]?.length ?? 0} columns</strong></div></div><div className="database-actions"><label><Search size={12} /><input value={dataQuery} onChange={(event) => setDataQuery(event.target.value)} placeholder="Filter rows" aria-label="Filter generated dataset rows" /></label><button onClick={() => { setSelectedFile('data.csv'); setTab('code') }}>Open CSV source <Code2 size={12} /></button></div></header><div className="database-table-wrap"><table><thead><tr>{dataRows[0]?.map((cell, index) => <th key={`${cell}-${index}`}>{cell}</th>)}</tr></thead><tbody>{filteredDataRows.slice(0, 500).map((row, index) => <tr key={`${index}-${row.join('-')}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table>{filteredDataRows.length > 500 && <p className="database-row-limit">Showing the first 500 matching rows. Refine the filter to narrow the local review.</p>}</div><p><ShieldCheck size={13} /> This is the portable CSV artifact rendered for local review. Filters do not mutate the source or query an external data service.</p></> : <div className="workspace-placeholder"><Table2 size={20} /><strong>Dataset unavailable</strong><span>Open the Files tab to inspect the portable data artifacts.</span></div>}</motion.div>}
          {tab === 'assets' && <motion.div key="assets" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="assets-pane"><header><div><Image size={17} /><div><span>Portable visual artifacts</span><strong>{assetFiles.length} generated asset{assetFiles.length === 1 ? '' : 's'}</strong></div></div><small>Path-confined workspace files</small></header><div>{assetFiles.map((file) => <article key={file.path}><img src={`/api/tasks/${task.id}/file?path=${encodeURIComponent(file.path)}&raw=1`} alt={file.path} /><footer><div><strong>{file.path}</strong><small>{formatBytes(file.size)}</small></div><a href={`/api/tasks/${task.id}/file?path=${encodeURIComponent(file.path)}&download=1`} title={`Download ${file.path}`}><Download size={13} /></a></footer></article>)}</div></motion.div>}
          {tab === 'visual' && (
            <motion.div key="visual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="visual-pane">
              {task.securityContext?.sandboxState === 'destroyed' ? <div className="workspace-placeholder"><ShieldCheck size={20} /><strong>Ephemeral display closed</strong><span>The sandbox was destroyed after artifact extraction.</span></div> : task.securityContext?.visualRuntimeReady && !visualError ? <><div className="visual-status"><span className="live-dot" /> Live X11 capture · no VNC · 1 FPS</div><img src={`/api/tasks/${task.id}/visual/screenshot?v=${visualFrame}`} onError={() => setVisualError(true)} alt="Live X11 display from the ONEComputer sandbox" /></> : <div className="workspace-placeholder"><Eye size={20} /><strong>{visualError ? 'Visual frame unavailable' : 'Starting visual runtime'}</strong><span>{visualError ? 'The authenticated capture endpoint did not return a frame.' : 'Xvfb and Chromium are being prepared inside the sandbox.'}</span></div>}
            </motion.div>
          )}
          {tab === 'code' && (
            <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="code-pane">
              <aside>{files.map((file) => <button key={file.path} className={selectedFile === file.path ? 'active' : ''} onClick={() => setSelectedFile(file.path)}><File size={13} />{file.path}</button>)}</aside>
              <div className="editor-surface">
                <div className="editor-toolbar"><span>{selectedFile ?? 'No file selected'}</span>{selectedFile && !isBinary(selectedFile) && <><div className="view-switch"><button className={codeView === 'original' ? 'active' : ''} onClick={() => setCodeView('original')}>Original</button><button className={codeView === 'modified' ? 'active' : ''} onClick={() => setCodeView('modified')}>Modified</button><button className={codeView === 'diff' ? 'active' : ''} onClick={() => setCodeView('diff')}>Diff</button></div>{editing ? <button className="save-source" onClick={() => void save()} disabled={draft === content}><Save size={12} /> Save</button> : <button className="edit-source" onClick={() => { setEditing(true); setCodeView('modified') }}><Pencil size={12} /> Edit</button>}</>}</div>
                {selectedFile && isBinary(selectedFile) ? <pre><code>{`Binary artifact: ${selectedFile}\n\nDownload it from the Files tab.`}</code></pre> : editing && codeView === 'modified' ? <textarea className="source-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /> : codeView === 'diff' ? <pre className="diff-view"><code>{diff}</code></pre> : <HighlightedCode content={codeView === 'modified' ? draft : content || '// Select a generated file'} />}
              </div>
            </motion.div>
          )}
          {tab === 'files' && (
            <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="files-pane">
              <div className="files-heading"><div><strong>Workspace files</strong><span>Portable source · no ambient credentials</span></div><span>{files.length} files</span></div>
              {files.map((file) => isBinary(file.path) ? <a className="file-download-row" key={file.path} href={`/api/tasks/${task.id}/file?path=${encodeURIComponent(file.path)}&download=1`}><Download size={15} /><span><strong>{file.path}</strong><small>Download binary artifact</small></span><em>{formatBytes(file.size)}</em></a> : <button key={file.path} onClick={() => { setSelectedFile(file.path); setTab('code') }}><File size={15} /><span><strong>{file.path}</strong><small>{new Date(file.updatedAt).toLocaleTimeString()}</small></span><em>{formatBytes(file.size)}</em></button>)}
            </motion.div>
          )}
          {tab === 'history' && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="history-pane">
              <div className="files-heading"><div><strong>Workspace history</strong><span>Immutable local snapshots after completed turns</span></div><span>{versions.length} versions</span></div>
              {versions.length === 0 && <div className="workspace-placeholder"><History size={20} /><strong>No snapshots yet</strong><span>A version is captured after each completed turn.</span></div>}
              {versions.map((version) => <div className="version-row" key={version.id}><History size={15} /><div><strong>{version.label}</strong><span>{new Date(version.createdAt).toLocaleString()} · {version.fileCount} files · {version.evidenceHash.slice(0, 10)}</span></div><aside><button onClick={() => { setComparisonError(null); void compareVersion(task.id, version.id).then(setComparison).catch((error: unknown) => setComparisonError(error instanceof Error ? error.message : 'Unable to compare this version')) }}>Compare</button><button onClick={() => void restoreVersion(task.id, version.id)}>Restore</button></aside></div>)}
              {comparison && <section className="version-comparison"><header><div><span>Version comparison</span><strong>{comparison.version.label} → current workspace</strong></div><button onClick={() => setComparison(null)} aria-label="Close version comparison">×</button></header><div className="version-comparison-summary"><span>{comparison.summary.added} added</span><span>{comparison.summary.changed} changed</span><span>{comparison.summary.removed} removed</span></div>{comparison.changes.length === 0 ? <p>No file-content changes from this version.</p> : <ul>{comparison.changes.map((change) => <li key={change.path} className={change.status}><strong>{change.status}</strong><code>{change.path}</code><small>{change.beforeSize ?? 0} B → {change.afterSize ?? 0} B · {change.beforeHash?.slice(0, 8) ?? '—'} → {change.afterHash?.slice(0, 8) ?? '—'}</small></li>)}</ul>}{comparison.truncated && <p>Only the first 200 changed paths are shown.</p>}<footer><ShieldCheck size={12} /> Metadata and hashes only; source contents are not copied into comparison evidence.</footer></section>}
              {comparisonError && <p className="version-comparison-error">{comparisonError}</p>}
            </motion.div>
          )}
          {tab === 'evidence' && (
            <motion.div key="evidence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="evidence-pane">
              <div className={`evidence-verdict ${chainValid ? 'valid' : ''}`}><ShieldCheck size={24} /><div><span>Local evidence chain</span><strong>{chainValid === null ? 'Verifying…' : chainValid ? 'Verified' : 'Integrity failure'}</strong></div>{chainValid && <Check size={18} />}</div>
              <div className="evidence-stats"><div><span>Ordered events</span><strong>{task.events.length}</strong></div><div><span>Security boundary</span><strong>{task.securityContext?.gatewayEnforced ? 'gateway' : 'demo'}</strong></div><div><span>External approvals</span><strong>{task.approval ? 1 : 0}</strong></div></div>
              <div className="evidence-log">{task.events.slice(-6).reverse().map((event) => <div key={event.id}><History size={13} /><span>{event.sequence.toString().padStart(2, '0')}</span><strong>{event.label ?? event.type}</strong><code>{event.eventHash.slice(0, 12)}</code></div>)}</div>
              <p className="evidence-note"><Network size={13} /> Local hashes demonstrate ordering only. Production evidence must be anchored outside the workload through OpenVTC.</p>
            </motion.div>
          )}
          {tab === 'handoff' && <motion.div key="handoff" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="handoff-pane"><header><div><GitFork size={18} /><div><span>Source handoff</span><strong>Prepare a GitHub review</strong></div></div><a href={`/api/tasks/${task.id}/download`}><Download size={13} /> Download handoff</a></header><section><div className="handoff-step"><i>01</i><div><strong>Review portable source</strong><p>Inspect the generated files, `validation-report.json`, and preview before sharing anything externally.</p></div></div><div className="handoff-step"><i>02</i><div><strong>Keep the evidence with the source</strong><p>The download includes `ONEVIBE-EVIDENCE.json` and `GITHUB-HANDOFF.md` so review remains traceable to this task.</p></div></div><div className="handoff-step"><i>03</i><div><strong>Use your approved GitHub identity</strong><p>Create the repository or pull request only after your organization’s review and any required external VTI Wallet approval.</p></div></div></section><footer><ShieldCheck size={14} /><p>ONEVibe does not access GitHub credentials, create repositories, or push code from this browser. The archive is a review-ready handoff, not publication authority.</p></footer></motion.div>}
          {tab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="task-settings-pane">
              <header><div><Settings2 size={17} /><div><span>Task operating settings</span><strong>Read-only runtime and context record</strong></div></div><em>Secrets never render here</em></header>
              <div className="task-settings-grid">
                <article><span>Runtime</span><strong>{providerLabel(task.provider)}</strong><small>{task.securityContext?.executionBoundary?.replaceAll('_', ' ') ?? 'Awaiting run boundary'}</small></article>
                <article><span>Security boundary</span><strong>{task.securityContext?.gatewayEnforced ? 'Gateway attested' : 'No gateway attestation'}</strong><small>{task.securityContext?.sandboxState ? `Sandbox ${task.securityContext.sandboxState}` : 'No sandbox lifecycle recorded'}</small></article>
                <article><span>Approval authority</span><strong>{task.approval?.state ?? 'No approval pending'}</strong><small>{task.approval ? 'Decision remains outside the browser in VTI Wallet' : 'No consequential action has been requested'}</small></article>
                <article><span>Artifact contract</span><strong>{task.mode.replaceAll('_', ' ')} mode</strong><small>Validation reports distinguish static evidence from executed runtime checks.</small></article>
              </div>
              <section className="task-tags-control"><header><div><span>Artifact tags</span><strong>Library classification</strong></div><em>Up to 8</em></header><form onSubmit={(event) => { event.preventDefault(); const tags = [...new Set(tagDraft.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))]; setSavingTags(true); setTagError(null); void onUpdateTags(task.id, tags).catch((error: unknown) => setTagError(error instanceof Error ? error.message : 'Unable to update tags')).finally(() => setSavingTags(false)) }}><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="security, executive-update" maxLength={264} aria-label="Artifact tags separated by commas" /><button type="submit" disabled={savingTags}>{savingTags ? 'Saving…' : 'Save tags'}</button></form>{tagError && <p>{tagError}</p>}</section><section className="task-project-control"><header><div><span>Project placement</span><strong>Future continuations use this project context</strong></div><em>{task.status === 'running' || task.status === 'pending' ? 'Stop task to move' : 'Settled task'}</em></header><select value={task.projectId} disabled={movingProject || task.status === 'running' || task.status === 'pending'} aria-label="Move task to project" onChange={(event) => { const projectId = event.target.value; if (projectId === task.projectId) return; setMovingProject(true); setProjectMoveError(null); void onMoveProject(task.id, projectId).catch((error: unknown) => setProjectMoveError(error instanceof Error ? error.message : 'Unable to move task')).finally(() => setMovingProject(false)) }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>{projectMoveError && <p>{projectMoveError}</p>}</section><section className="task-settings-context"><header><strong>Attached governed context</strong><span>Metadata only · treated as untrusted input</span></header><div>{task.skills.length > 0 ? <article><span>Skill guides</span><p>{task.skills.map((skill) => skill.replaceAll('_', ' ')).join(' · ')}</p></article> : <article><span>Skill guides</span><p>None selected for this task.</p></article>}{task.references.length > 0 ? <article><span>Website references</span><p>{task.references.map((reference) => new URL(reference).hostname).join(' · ')}</p></article> : <article><span>Website references</span><p>None attached.</p></article>}{task.attachments.length > 0 ? <article><span>Local attachments</span><p>{task.attachments.length} bounded file{task.attachments.length === 1 ? '' : 's'} staged under task inputs.</p></article> : <article><span>Local attachments</span><p>None attached.</p></article>}<article><span>Project</span><p>{task.projectId}</p></article></div></section>
              <p className="task-settings-note"><ShieldCheck size={13} /> Runtime credentials, wallet signing keys, X11/VNC/CDP channels, and provider control-plane access are intentionally absent from the browser.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
