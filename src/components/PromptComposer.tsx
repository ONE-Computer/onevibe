import { ArrowUp, ChevronDown, Cloud, Link2, Monitor, Paperclip, ShieldCheck, Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import type { Task, TaskMode } from '../types'

type Props = { compact?: boolean; busy?: boolean; onSubmit: (prompt: string, provider: Task['provider'], mode: TaskMode, references?: string[]) => Promise<void> }

export const PromptComposer = ({ compact = false, busy = false, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Task['provider']>('demo')
  const [mode, setMode] = useState<TaskMode>('general')
  const [referenceDraft, setReferenceDraft] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [referencesOpen, setReferencesOpen] = useState(false)
  const providers: Task['provider'][] = ['demo', 'claude_sdk', 'onecomputer', 'remote']
  const modes: TaskMode[] = ['general', 'website', 'slides', 'document', 'research', 'data', 'design', 'app', 'game']

  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    await onSubmit(value, provider, mode, references)
    setPrompt('')
    setReferences([])
    setReferenceDraft('')
  }

  return (
    <motion.div layout className={`composer ${compact ? 'compact' : ''}`}>
      {!compact && referencesOpen && <div className="reference-popover"><input value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="https://example.com/reference" onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); try { const url = new URL(referenceDraft); if (!/^https?:$/.test(url.protocol) || url.username || url.password || /(?:token|secret|api[_-]?key|password)=/i.test(url.search)) return; setReferences((current) => current.includes(url.toString()) || current.length >= 8 ? current : [...current, url.toString()]); setReferenceDraft('') } catch { /* URL remains editable until valid */ } }} /><span>Press Enter to attach a public reference. ONEVibe does not fetch it automatically.</span></div>}
      {!compact && references.length > 0 && <div className="reference-chips">{references.map((reference) => <span key={reference}>{new URL(reference).hostname}<button aria-label={`Remove ${reference}`} onClick={() => setReferences((current) => current.filter((item) => item !== reference))}><X size={11} /></button></span>)}</div>}
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={compact ? 'Ask ONEVibe to refine or continue…' : 'Assign a task, build an app, or investigate a problem'}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }}
      />
      <div className="composer-actions">
        <div className="composer-left">
          <button title="Attach files"><Paperclip size={16} /></button>
          {!compact && <button title="Connect website reference" aria-label="Connect website reference" onClick={() => setReferencesOpen((value) => !value)}><Link2 size={16} /></button>}
          <span className="composer-divider" />
          {!compact && <button className="mode-button" onClick={() => setMode(modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'general')}><Monitor size={15} /> {mode === 'general' ? 'Agent' : mode[0]?.toUpperCase() + mode.slice(1)} <ChevronDown size={13} /></button>}
          {!compact && <button className="mode-button" onClick={() => setProvider(providers[(providers.indexOf(provider) + 1) % providers.length] ?? 'demo')}>
            {provider === 'demo' ? <Sparkles size={15} /> : <Cloud size={15} />}
            {provider === 'demo' ? 'Safe demo' : provider === 'claude_sdk' ? 'Claude SDK' : provider === 'onecomputer' ? 'ONEComputer' : 'AgentCore'} <ChevronDown size={13} />
          </button>}
        </div>
        <div className="composer-right">
          <span className="policy-chip"><ShieldCheck size={13} /> governed</span>
          <button className="send-button" disabled={!prompt.trim() || busy} onClick={() => void submit()} aria-label="Start task"><ArrowUp size={17} /></button>
        </div>
      </div>
    </motion.div>
  )
}
