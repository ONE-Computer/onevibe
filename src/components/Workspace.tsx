import { Activity, ArrowLeft, ArrowRight, Check, Code2, Copy, Download, Eye, File, Files, Globe2, History, Maximize2, Minimize2, Network, Palette, Pencil, Presentation, RefreshCw, Save, Settings2, ShieldCheck, Table2, TerminalSquare } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { copyTask, getEvidence, getFile, getFiles, getVersions, restoreVersion, updateFile } from '../lib/api'
import type { TaskSnapshot, WorkspaceFile, WorkspaceVersion } from '../types'
import { ComputerTimeline } from './ComputerTimeline'
import { HighlightedCode } from './HighlightedCode'

type Tab = 'dashboard' | 'computer' | 'observe' | 'preview' | 'visual' | 'slides' | 'design' | 'database' | 'code' | 'files' | 'history' | 'evidence' | 'settings'
type SlideOutline = { number: number; title: string; summary: string }
type DesignDirection = { id: string; name: string; rationale: string; confidence: number; selected: boolean }
type DesignPhilosophy = { name: string; description: string }

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
const isBinary = (filePath: string) => /\.(pptx|pdf|png|jpe?g|gif|zip)$/i.test(filePath)
const formatElapsed = (milliseconds: number) => milliseconds < 1_000 ? '<1s' : milliseconds < 60_000 ? `${Math.round(milliseconds / 1_000)}s` : `${Math.floor(milliseconds / 60_000)}m ${Math.round((milliseconds % 60_000) / 1_000)}s`

export const Workspace = ({ task }: { task: TaskSnapshot }) => {
  const [tab, setTab] = useState<Tab>('preview')
  const [files, setFiles] = useState<WorkspaceFile[]>(task.files)
  const [selectedFile, setSelectedFile] = useState<string | null>(task.files[0]?.path ?? null)
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [contentHash, setContentHash] = useState('')
  const [codeView, setCodeView] = useState<'original' | 'modified' | 'diff'>('original')
  const [editing, setEditing] = useState(false)
  const [chainValid, setChainValid] = useState<boolean | null>(null)
  const [versions, setVersions] = useState<WorkspaceVersion[]>([])
  const [fullscreen, setFullscreen] = useState(false)
  const [visualFrame, setVisualFrame] = useState(0)
  const [visualError, setVisualError] = useState(false)
  const [slides, setSlides] = useState<SlideOutline[]>([])
  const [speakerNotes, setSpeakerNotes] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [designDirections, setDesignDirections] = useState<DesignDirection[]>([])
  const [designPhilosophy, setDesignPhilosophy] = useState<DesignPhilosophy | null>(null)
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

  useEffect(() => {
    void getFiles(task.id).then((result) => {
      setFiles(result.files)
      setSelectedFile((current) => current ?? result.files[0]?.path ?? null)
    })
  }, [task.events.length, task.id])
  useEffect(() => {
    if (!selectedFile) return
    if (isBinary(selectedFile)) { setContent(''); setDraft(''); return }
    void getFile(task.id, selectedFile).then((result) => {
      setContent(result.content); setDraft(result.content); setContentHash(result.contentHash); setCodeView('original'); setEditing(false)
    })
  }, [selectedFile, task.id])
  useEffect(() => { if (tab === 'evidence') void getEvidence(task.id).then((result) => setChainValid(result.valid)) }, [tab, task.id, task.events.length])
  useEffect(() => { if (tab === 'history') void getVersions(task.id).then((result) => setVersions(result.versions)) }, [tab, task.id, task.events.length])
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
    void getFile(task.id, 'data.csv').then((result) => setDataRows(result.content.trim().split('\n').filter(Boolean).map((line) => line.split(',')))).catch(() => setDataRows([]))
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
    <section className={`workspace ${fullscreen ? 'workspace-fullscreen' : ''}`}>
      <header className="workspace-header">
        <div className="window-controls"><i /><i /><i /></div>
        <div className="workspace-tabs">
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><Activity size={14} /> Dashboard</button>
          <button className={tab === 'computer' ? 'active' : ''} onClick={() => setTab('computer')}><TerminalSquare size={14} /> Computer</button>
          <button className={tab === 'observe' ? 'active' : ''} onClick={() => setTab('observe')}><Network size={14} /> Observe</button>
          <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><Globe2 size={14} /> Preview</button>
          {task.mode === 'slides' && <button className={tab === 'slides' ? 'active' : ''} onClick={() => setTab('slides')}><Presentation size={14} /> Deck</button>}
          {task.mode === 'design' && <button className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}><Palette size={14} /> Directions</button>}
          {task.mode === 'data' && <button className={tab === 'database' ? 'active' : ''} onClick={() => setTab('database')}><Table2 size={14} /> Data</button>}
          {task.securityContext?.executionBoundary === 'onecomputer_sandbox' && <button className={tab === 'visual' ? 'active' : ''} onClick={() => setTab('visual')}><Eye size={14} /> Live X11</button>}
          <button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}><Code2 size={14} /> Code</button>
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><Files size={14} /> Files</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={14} /> History</button>
          <button className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}><ShieldCheck size={14} /> Evidence</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings2 size={14} /> Settings</button>
        </div>
        <div className="workspace-tools"><button title="Make a provenance-linked copy" onClick={() => void copyTask(task.id).then((copy) => window.location.assign(`/tasks/${copy.id}`))}><Copy size={14} /></button><a title="Download source, evidence, and GitHub handoff" href={`/api/tasks/${task.id}/download`}><Download size={14} /></a><button><RefreshCw size={14} /></button><button title={fullscreen ? 'Exit fullscreen' : 'Expand workspace'} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button></div>
      </header>
      <div className="workspace-meta"><span className="live-dot" /> local.onevibe.dev/{task.id.slice(-6)}<span className="workspace-policy"><ShieldCheck size={12} /> {task.securityContext?.gatewayEnforced ? 'ONEComputer gateway enforced' : 'local policy demo'}</span></div>
      <div className="workspace-body">
        <AnimatePresence mode="wait">
          {tab === 'dashboard' && <motion.div key="dashboard" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="dashboard-pane"><header><div><span>Task workspace</span><strong>{task.status.replaceAll('_', ' ')}</strong></div><p>{task.securityContext?.executionBoundary === 'onecomputer_sandbox' ? 'ONEComputer sandbox boundary' : task.securityContext?.executionBoundary === 'remote_runtime' ? 'Remote runtime boundary' : 'Local task workspace'}</p></header><div className="dashboard-grid"><article><span>Plan progress</span><strong>{completedSteps} / {task.plan.length}</strong><small>{task.plan.find((step) => step.status === 'running')?.title ?? 'No active plan step'}</small></article><article><span>Portable artifacts</span><strong>{files.filter((file) => !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/')).length}</strong><small>{files.length} files in workspace</small></article><article><span>Evidence events</span><strong>{task.events.length}</strong><small>{task.activeRunId ? `Active run ${task.activeRunId.slice(-6)}` : 'No active run'}</small></article><article><span>Approval boundary</span><strong>{task.approval?.state ?? 'none'}</strong><small>{task.approval ? 'Decision remains in VTI Wallet' : 'No consequential action pending'}</small></article></div><section className="dashboard-boundary"><ShieldCheck size={17} /><div><strong>{task.securityContext?.gatewayEnforced ? 'Gateway enforcement attested' : 'Policy boundary visible'}</strong><span>{task.securityContext?.gatewayEnforced ? 'Runtime reports gateway enforcement for this task.' : 'This task does not claim production gateway attestation.'}</span></div></section></motion.div>}
          {tab === 'computer' && <motion.div key="computer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="computer-pane"><ComputerTimeline task={task} /></motion.div>}
          {tab === 'observe' && <motion.div key="observe" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="observability-pane"><header><div><span>Task-scoped execution facts</span><strong>Observability</strong></div><em>Derived from recorded events</em></header><div className="observability-grid"><article><span>Observed duration</span><strong>{formatElapsed(observability.duration)}</strong><small>From task start to latest recorded event</small></article><article><span>Tool calls</span><strong>{observability.toolCalls}</strong><small>{observability.toolFailures ? `${observability.toolFailures} reported errors` : 'No reported tool errors'}</small></article><article><span>Visual evidence</span><strong>{observability.visualFrames}</strong><small>{task.securityContext?.visualRuntimeReady ? 'X11 capture enabled' : 'No visual runtime attested'}</small></article><article><span>Artifacts</span><strong>{observability.artifacts}</strong><small>{files.filter((file) => !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/')).length} portable files available</small></article></div><section className="observability-run"><div><Activity size={15} /><span>Run boundary</span></div><strong>{task.provider === 'onecomputer' ? 'ONEComputer sandbox' : task.provider === 'claude_sdk' ? 'Claude Agent SDK' : task.provider === 'remote' ? 'Remote runtime' : 'Local demo runtime'}</strong><small>Started {new Date(observability.startedAt).toLocaleString()} · {task.securityContext?.gatewayEnforced ? 'gateway enforcement attested' : 'no gateway attestation claimed'}</small></section><section className="observability-note"><ShieldCheck size={14} /><p>This is a review surface, not an infrastructure control plane. It reports only task evidence available to ONEVibe; provider metrics, network flows, and organization telemetry are intentionally not inferred.</p></section></motion.div>}
          {tab === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="preview-pane">
              {task.previewPath ? <iframe title="Generated workspace preview" sandbox="allow-scripts" src={activePreview} /> : <div className="workspace-placeholder"><RefreshCw className="spin" size={20} /><strong>Preparing preview</strong><span>The governed workspace is materializing.</span></div>}
            </motion.div>
          )}
          {tab === 'slides' && <motion.div key="slides" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="deck-pane">{slides.length ? <><aside aria-label="Slide outline thumbnails"><div className="deck-rail-heading"><span>Deck</span><small>{slides.length} slides</small></div>{slides.map((slide, index) => <button key={slide.number} className={index === activeSlide ? 'active' : ''} onClick={() => setActiveSlide(index)} aria-label={`Open slide ${slide.number}: ${slide.title}`}><div className="slide-thumbnail"><span>{String(slide.number).padStart(2, '0')}</span><strong>{slide.title}</strong><i /></div><small>{slide.summary}</small></button>)}</aside><section><div className="deck-review-header"><div><span>ONEVIBE · GOVERNED DECK</span><strong>Slide {String(slides[activeSlide]?.number).padStart(2, '0')} of {String(slides.length).padStart(2, '0')}</strong></div><div className="deck-controls"><button disabled={activeSlide === 0} onClick={() => setActiveSlide((current) => current - 1)} aria-label="Previous slide"><ArrowLeft size={13} /></button><button disabled={activeSlide === slides.length - 1} onClick={() => setActiveSlide((current) => current + 1)} aria-label="Next slide"><ArrowRight size={13} /></button></div></div><div className="deck-slide"><span>Slide {slides[activeSlide]?.number} / {slides.length}</span><h2>{slides[activeSlide]?.title}</h2><p>{slides[activeSlide]?.summary}</p><div className="deck-slide-mark"><Presentation size={15} /><span>Portable PPTX · evidence-bound notes</span></div></div><article className="speaker-notes"><header><div><strong>Speaker notes</strong><span>Reviewable source for this slide</span></div><button onClick={() => { setSelectedFile('speaker-notes.md'); setTab('code') }}>Edit notes <Pencil size={11} /></button></header><p>{speakerNotes.match(new RegExp(`## ${slides[activeSlide]?.number}\\. [^\\n]+\\n\\n([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim() ?? 'No notes for this slide.'}</p></article></section></> : <div className="workspace-placeholder"><Presentation size={20} /><strong>Deck outline unavailable</strong><span>Open the Files tab to inspect the portable slide artifacts.</span></div>}</motion.div>}
          {tab === 'design' && <motion.div key="design" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="design-pane">{designDirections.length ? <><header><div><Palette size={17} /><div><span>Design exploration</span><strong>{designPhilosophy?.name ?? 'Choose a direction to develop'}</strong></div></div><em>Starter heuristic · review required</em></header>{designPhilosophy && <section className="design-philosophy"><span>Design philosophy</span><p>{designPhilosophy.description}</p></section>}<div className="design-direction-grid">{designDirections.map((direction) => <article className={direction.selected ? 'selected' : ''} key={direction.id}><div><span>{direction.selected ? 'Selected direction' : 'Alternative direction'}</span><strong>{direction.name}</strong></div><p>{direction.rationale}</p><footer><div><i><b style={{ width: `${Math.round(direction.confidence * 100)}%` }} /></i><small>{Math.round(direction.confidence * 100)}% heuristic fit</small></div>{direction.selected && <Check size={15} />}</footer></article>)}</div><p className="design-note"><ShieldCheck size={13} /> These scores are deterministic starter heuristics for comparison, not model probabilities, user research, or a substitute for design review.</p></> : <div className="workspace-placeholder"><Palette size={20} /><strong>Design directions unavailable</strong><span>Open the Files tab to inspect the portable design artifacts.</span></div>}</motion.div>}
          {tab === 'database' && <motion.div key="database" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="database-pane">{dataRows.length ? <><header><div><Table2 size={17} /><div><span>Generated dataset</span><strong>{dataRows.length - 1} rows · {dataRows[0]?.length ?? 0} columns</strong></div></div><button onClick={() => { setSelectedFile('data.csv'); setTab('code') }}>Open CSV source <Code2 size={12} /></button></header><div className="database-table-wrap"><table><thead><tr>{dataRows[0]?.map((cell, index) => <th key={`${cell}-${index}`}>{cell}</th>)}</tr></thead><tbody>{dataRows.slice(1).map((row, index) => <tr key={`${index}-${row.join('-')}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div><p><ShieldCheck size={13} /> This is the portable CSV artifact rendered for review. It is not a live connector or external data source.</p></> : <div className="workspace-placeholder"><Table2 size={20} /><strong>Dataset unavailable</strong><span>Open the Files tab to inspect the portable data artifacts.</span></div>}</motion.div>}
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
              {versions.map((version) => <div className="version-row" key={version.id}><History size={15} /><div><strong>{version.label}</strong><span>{new Date(version.createdAt).toLocaleString()} · {version.fileCount} files · {version.evidenceHash.slice(0, 10)}</span></div><button onClick={() => void restoreVersion(task.id, version.id)}>Restore</button></div>)}
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
          {tab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="task-settings-pane">
              <header><div><Settings2 size={17} /><div><span>Task operating settings</span><strong>Read-only runtime and context record</strong></div></div><em>Secrets never render here</em></header>
              <div className="task-settings-grid">
                <article><span>Runtime</span><strong>{task.provider === 'demo' ? 'Safe demo' : task.provider === 'claude_sdk' ? 'Claude Agent SDK' : task.provider === 'onecomputer' ? 'ONEComputer sandbox' : 'Remote runtime'}</strong><small>{task.securityContext?.executionBoundary?.replaceAll('_', ' ') ?? 'Awaiting run boundary'}</small></article>
                <article><span>Security boundary</span><strong>{task.securityContext?.gatewayEnforced ? 'Gateway attested' : 'No gateway attestation'}</strong><small>{task.securityContext?.sandboxState ? `Sandbox ${task.securityContext.sandboxState}` : 'No sandbox lifecycle recorded'}</small></article>
                <article><span>Approval authority</span><strong>{task.approval?.state ?? 'No approval pending'}</strong><small>{task.approval ? 'Decision remains outside the browser in VTI Wallet' : 'No consequential action has been requested'}</small></article>
                <article><span>Artifact contract</span><strong>{task.mode.replaceAll('_', ' ')} mode</strong><small>Validation reports distinguish static evidence from executed runtime checks.</small></article>
              </div>
              <section className="task-settings-context"><header><strong>Attached governed context</strong><span>Metadata only · treated as untrusted input</span></header><div>{task.skills.length > 0 ? <article><span>Skill guides</span><p>{task.skills.map((skill) => skill.replaceAll('_', ' ')).join(' · ')}</p></article> : <article><span>Skill guides</span><p>None selected for this task.</p></article>}{task.references.length > 0 ? <article><span>Website references</span><p>{task.references.map((reference) => new URL(reference).hostname).join(' · ')}</p></article> : <article><span>Website references</span><p>None attached.</p></article>}{task.attachments.length > 0 ? <article><span>Local attachments</span><p>{task.attachments.length} bounded file{task.attachments.length === 1 ? '' : 's'} staged under task inputs.</p></article> : <article><span>Local attachments</span><p>None attached.</p></article>}<article><span>Project</span><p>{task.projectId}</p></article></div></section>
              <p className="task-settings-note"><ShieldCheck size={13} /> Runtime credentials, wallet signing keys, X11/VNC/CDP channels, and provider control-plane access are intentionally absent from the browser.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
