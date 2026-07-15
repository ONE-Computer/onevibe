import { Check, Code2, Copy, Download, Eye, File, Files, Globe2, History, Maximize2, Minimize2, Network, Pencil, RefreshCw, Save, ShieldCheck, TerminalSquare } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { copyTask, getEvidence, getFile, getFiles, getVersions, restoreVersion, updateFile } from '../lib/api'
import type { TaskSnapshot, WorkspaceFile, WorkspaceVersion } from '../types'
import { ComputerTimeline } from './ComputerTimeline'

type Tab = 'computer' | 'preview' | 'visual' | 'code' | 'files' | 'history' | 'evidence'

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
const isBinary = (filePath: string) => /\.(pptx|pdf|png|jpe?g|gif|zip)$/i.test(filePath)

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
          <button className={tab === 'computer' ? 'active' : ''} onClick={() => setTab('computer')}><TerminalSquare size={14} /> Computer</button>
          <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><Globe2 size={14} /> Preview</button>
          {task.securityContext?.executionBoundary === 'onecomputer_sandbox' && <button className={tab === 'visual' ? 'active' : ''} onClick={() => setTab('visual')}><Eye size={14} /> Live X11</button>}
          <button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}><Code2 size={14} /> Code</button>
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><Files size={14} /> Files</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={14} /> History</button>
          <button className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}><ShieldCheck size={14} /> Evidence</button>
        </div>
        <div className="workspace-tools"><button title="Make a provenance-linked copy" onClick={() => void copyTask(task.id).then((copy) => window.location.assign(`/tasks/${copy.id}`))}><Copy size={14} /></button><a title="Download source and evidence" href={`/api/tasks/${task.id}/download`}><Download size={14} /></a><button><RefreshCw size={14} /></button><button title={fullscreen ? 'Exit fullscreen' : 'Expand workspace'} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button></div>
      </header>
      <div className="workspace-meta"><span className="live-dot" /> local.onevibe.dev/{task.id.slice(-6)}<span className="workspace-policy"><ShieldCheck size={12} /> {task.securityContext?.gatewayEnforced ? 'ONEComputer gateway enforced' : 'local policy demo'}</span></div>
      <div className="workspace-body">
        <AnimatePresence mode="wait">
          {tab === 'computer' && <motion.div key="computer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="computer-pane"><ComputerTimeline task={task} /></motion.div>}
          {tab === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="preview-pane">
              {task.previewPath ? <iframe title="Generated workspace preview" sandbox="allow-scripts" src={activePreview} /> : <div className="workspace-placeholder"><RefreshCw className="spin" size={20} /><strong>Preparing preview</strong><span>The governed workspace is materializing.</span></div>}
            </motion.div>
          )}
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
                {selectedFile && isBinary(selectedFile) ? <pre><code>{`Binary artifact: ${selectedFile}\n\nDownload it from the Files tab.`}</code></pre> : editing && codeView === 'modified' ? <textarea className="source-editor" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} /> : <pre className={codeView === 'diff' ? 'diff-view' : ''}><code>{codeView === 'diff' ? diff : codeView === 'modified' ? draft : content || '// Select a generated file'}</code></pre>}
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
        </AnimatePresence>
      </div>
    </section>
  )
}
