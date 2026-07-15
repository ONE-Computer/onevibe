import { Check, Code2, Download, File, Files, Globe2, History, Maximize2, Minimize2, Network, RefreshCw, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { getEvidence, getFile, getFiles, getVersions, restoreVersion } from '../lib/api'
import type { TaskSnapshot, WorkspaceFile, WorkspaceVersion } from '../types'

type Tab = 'preview' | 'code' | 'files' | 'history' | 'evidence'

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

export const Workspace = ({ task }: { task: TaskSnapshot }) => {
  const [tab, setTab] = useState<Tab>('preview')
  const [files, setFiles] = useState<WorkspaceFile[]>(task.files)
  const [selectedFile, setSelectedFile] = useState<string | null>(task.files[0]?.path ?? null)
  const [content, setContent] = useState('')
  const [chainValid, setChainValid] = useState<boolean | null>(null)
  const [versions, setVersions] = useState<WorkspaceVersion[]>([])
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    void getFiles(task.id).then((result) => {
      setFiles(result.files)
      setSelectedFile((current) => current ?? result.files[0]?.path ?? null)
    })
  }, [task.events.length, task.id])
  useEffect(() => {
    if (!selectedFile) return
    void getFile(task.id, selectedFile).then((result) => setContent(result.content))
  }, [selectedFile, task.id])
  useEffect(() => { if (tab === 'evidence') void getEvidence(task.id).then((result) => setChainValid(result.valid)) }, [tab, task.id, task.events.length])
  useEffect(() => { if (tab === 'history') void getVersions(task.id).then((result) => setVersions(result.versions)) }, [tab, task.id, task.events.length])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const activePreview = useMemo(() => `${task.previewPath ?? `/api/tasks/${task.id}/preview`}?v=${task.events.length}`, [task.events.length, task.id, task.previewPath])

  return (
    <section className={`workspace ${fullscreen ? 'workspace-fullscreen' : ''}`}>
      <header className="workspace-header">
        <div className="window-controls"><i /><i /><i /></div>
        <div className="workspace-tabs">
          <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><Globe2 size={14} /> Preview</button>
          <button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}><Code2 size={14} /> Code</button>
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><Files size={14} /> Files</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={14} /> History</button>
          <button className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}><ShieldCheck size={14} /> Evidence</button>
        </div>
        <div className="workspace-tools"><a title="Download source and evidence" href={`/api/tasks/${task.id}/download`}><Download size={14} /></a><button><RefreshCw size={14} /></button><button title={fullscreen ? 'Exit fullscreen' : 'Expand workspace'} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button></div>
      </header>
      <div className="workspace-meta"><span className="live-dot" /> local.onevibe.dev/{task.id.slice(-6)}<span className="workspace-policy"><ShieldCheck size={12} /> {task.securityContext?.gatewayEnforced ? 'ONEComputer gateway enforced' : 'local policy demo'}</span></div>
      <div className="workspace-body">
        <AnimatePresence mode="wait">
          {tab === 'preview' && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="preview-pane">
              {task.previewPath ? <iframe title="Generated workspace preview" sandbox="" src={activePreview} /> : <div className="workspace-placeholder"><RefreshCw className="spin" size={20} /><strong>Preparing preview</strong><span>The governed workspace is materializing.</span></div>}
            </motion.div>
          )}
          {tab === 'code' && (
            <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="code-pane">
              <aside>{files.map((file) => <button key={file.path} className={selectedFile === file.path ? 'active' : ''} onClick={() => setSelectedFile(file.path)}><File size={13} />{file.path}</button>)}</aside>
              <pre><code>{content || '// Select a generated file'}</code></pre>
            </motion.div>
          )}
          {tab === 'files' && (
            <motion.div key="files" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="files-pane">
              <div className="files-heading"><div><strong>Workspace files</strong><span>Portable source · no ambient credentials</span></div><span>{files.length} files</span></div>
              {files.map((file) => <button key={file.path} onClick={() => { setSelectedFile(file.path); setTab('code') }}><File size={15} /><span><strong>{file.path}</strong><small>{new Date(file.updatedAt).toLocaleTimeString()}</small></span><em>{formatBytes(file.size)}</em></button>)}
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
