import { Check, Code2, File, Files, Globe2, History, Maximize2, Network, RefreshCw, ShieldCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { getEvidence, getFile, getFiles } from '../lib/api'
import type { TaskSnapshot, WorkspaceFile } from '../types'

type Tab = 'preview' | 'code' | 'files' | 'evidence'

const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`

export const Workspace = ({ task }: { task: TaskSnapshot }) => {
  const [tab, setTab] = useState<Tab>('preview')
  const [files, setFiles] = useState<WorkspaceFile[]>(task.files)
  const [selectedFile, setSelectedFile] = useState<string | null>(task.files[0]?.path ?? null)
  const [content, setContent] = useState('')
  const [chainValid, setChainValid] = useState<boolean | null>(null)

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

  const activePreview = useMemo(() => `${task.previewPath ?? `/api/tasks/${task.id}/preview`}?v=${task.events.length}`, [task.events.length, task.id, task.previewPath])

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div className="window-controls"><i /><i /><i /></div>
        <div className="workspace-tabs">
          <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><Globe2 size={14} /> Preview</button>
          <button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}><Code2 size={14} /> Code</button>
          <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><Files size={14} /> Files</button>
          <button className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}><ShieldCheck size={14} /> Evidence</button>
        </div>
        <div className="workspace-tools"><button><RefreshCw size={14} /></button><button><Maximize2 size={14} /></button></div>
      </header>
      <div className="workspace-meta"><span className="live-dot" /> local.onevibe.dev/{task.id.slice(-6)}<span className="workspace-policy"><ShieldCheck size={12} /> policy attached</span></div>
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
          {tab === 'evidence' && (
            <motion.div key="evidence" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="evidence-pane">
              <div className={`evidence-verdict ${chainValid ? 'valid' : ''}`}><ShieldCheck size={24} /><div><span>Local evidence chain</span><strong>{chainValid === null ? 'Verifying…' : chainValid ? 'Verified' : 'Integrity failure'}</strong></div>{chainValid && <Check size={18} />}</div>
              <div className="evidence-stats"><div><span>Ordered events</span><strong>{task.events.length}</strong></div><div><span>Runtime route</span><strong>{task.provider}</strong></div><div><span>External approvals</span><strong>{task.approval ? 1 : 0}</strong></div></div>
              <div className="evidence-log">{task.events.slice(-6).reverse().map((event) => <div key={event.id}><History size={13} /><span>{event.sequence.toString().padStart(2, '0')}</span><strong>{event.label ?? event.type}</strong><code>{event.eventHash.slice(0, 12)}</code></div>)}</div>
              <p className="evidence-note"><Network size={13} /> Local hashes demonstrate ordering only. Production evidence must be anchored outside the workload through OpenVTC.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
