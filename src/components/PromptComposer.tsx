import { ArrowUp, ChevronDown, Cloud, Link2, Monitor, Paperclip, ShieldCheck, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import type { Task, TaskMode } from '../types'

type Props = { compact?: boolean; busy?: boolean; onSubmit: (prompt: string, provider: Task['provider'], mode: TaskMode) => Promise<void> }

export const PromptComposer = ({ compact = false, busy = false, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Task['provider']>('demo')
  const [mode, setMode] = useState<TaskMode>('general')
  const providers: Task['provider'][] = ['demo', 'claude_sdk', 'onecomputer', 'remote']
  const modes: TaskMode[] = ['general', 'website', 'slides', 'research', 'design', 'app', 'game']

  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    await onSubmit(value, provider, mode)
    setPrompt('')
  }

  return (
    <motion.div layout className={`composer ${compact ? 'compact' : ''}`}>
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
          <button title="Connect context"><Link2 size={16} /></button>
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
