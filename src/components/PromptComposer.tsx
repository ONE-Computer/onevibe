import { AppWindow, ArrowUp, BarChart3, Bot, ChevronDown, Cloud, FileText, Gamepad2, Globe2, Info, Link2, Monitor, Palette, Paperclip, Presentation, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import type { Task, TaskAttachment, TaskMode, TaskSkill } from '../types'

type DraftAttachment = Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string; size: number }
type Props = { compact?: boolean; busy?: boolean; skills?: TaskSkill[]; onSubmit: (prompt: string, provider: Task['provider'], mode: TaskMode, references?: string[], attachments?: DraftAttachment[], skills?: TaskSkill[]) => Promise<void> }

const modeCatalog: Array<{ id: TaskMode; label: string; detail: string; icon: typeof Bot }> = [
  { id: 'general', label: 'Agent', detail: 'Flexible governed task', icon: Bot },
  { id: 'website', label: 'Website', detail: 'Responsive site and preview', icon: Globe2 },
  { id: 'slides', label: 'Slides', detail: 'Deck, notes, and PPTX', icon: Presentation },
  { id: 'document', label: 'Document', detail: 'Brief, report, or memo', icon: FileText },
  { id: 'research', label: 'Research', detail: 'Evidence-led investigation', icon: Search },
  { id: 'data', label: 'Data story', detail: 'Decision narrative and charts', icon: BarChart3 },
  { id: 'design', label: 'Design', detail: 'Directions and design tokens', icon: Palette },
  { id: 'app', label: 'App', detail: 'Interactive React application', icon: AppWindow },
  { id: 'game', label: 'Game', detail: 'Playable web experience', icon: Gamepad2 },
]

const starterTemplates: Array<{ title: string; outcome: string; prompt: string; mode: TaskMode }> = [
  { title: 'Ship a website', outcome: 'Responsive site + preview', mode: 'website', prompt: 'Build a polished responsive landing page for a secure enterprise AI workspace. Include a clear value proposition, product flow, and accessible mobile layout.' },
  { title: 'Make a briefing', outcome: 'Narrative deck + speaker notes', mode: 'slides', prompt: 'Create an executive update deck: context, decision, delivery plan, risks, and next steps. Keep it concise, evidence-led, and ready to present.' },
  { title: 'Investigate a question', outcome: 'Cited research brief', mode: 'research', prompt: 'Research this question, distinguish evidence from inference, and produce a concise brief with sources, open questions, and recommended next steps.' },
  { title: 'Prototype an internal tool', outcome: 'Interactive app', mode: 'app', prompt: 'Create a focused internal tool prototype with a clean workflow, realistic sample data, and a responsive interface. Explain the decisions made.' },
]

export const PromptComposer = ({ compact = false, busy = false, skills = [], onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Task['provider']>('demo')
  const [mode, setMode] = useState<TaskMode>('general')
  const [referenceDraft, setReferenceDraft] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [referencesOpen, setReferencesOpen] = useState(false)
  const [modePickerOpen, setModePickerOpen] = useState(false)
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const providers: Task['provider'][] = ['demo', 'claude_sdk', 'onecomputer', 'remote']
  const selectedMode = modeCatalog.find((candidate) => candidate.id === mode) ?? modeCatalog[0]!

  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    await onSubmit(value, provider, mode, references, attachments, skills)
    setPrompt('')
    setReferences([])
    setReferenceDraft('')
    setAttachments([])
  }

  return (
    <motion.div layout className={`composer ${compact ? 'compact' : ''}`}>
      {!compact && <input ref={fileInput} className="file-input" type="file" multiple onChange={(event) => { const selected = [...(event.target.files ?? [])].slice(0, 4 - attachments.length); void Promise.all(selected.map(async (file) => { if (file.size > 256 * 1024) return undefined; const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }); return { name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: dataUrl.split(',', 2)[1] ?? '', size: file.size } })).then((files) => setAttachments((current) => [...current, ...files.filter((file): file is DraftAttachment => Boolean(file))].slice(0, 4))); event.currentTarget.value = '' }} />}
      {!compact && referencesOpen && <div className="reference-popover"><input value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="https://example.com/reference" onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); try { const url = new URL(referenceDraft); if (!/^https?:$/.test(url.protocol) || url.username || url.password || /(?:token|secret|api[_-]?key|password)=/i.test(url.search)) return; setReferences((current) => current.includes(url.toString()) || current.length >= 8 ? current : [...current, url.toString()]); setReferenceDraft('') } catch { /* URL remains editable until valid */ } }} /><span>Press Enter to attach a public reference. ONEVibe does not fetch it automatically.</span></div>}
      {!compact && references.length > 0 && <div className="reference-chips">{references.map((reference) => <span key={reference}>{new URL(reference).hostname}<button aria-label={`Remove ${reference}`} onClick={() => setReferences((current) => current.filter((item) => item !== reference))}><X size={11} /></button></span>)}</div>}
      {!compact && attachments.length > 0 && <div className="reference-chips attachment-chips">{attachments.map((attachment) => <span key={`${attachment.name}-${attachment.size}`}>{attachment.name} · {Math.ceil(attachment.size / 1024)} KB<button aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))}><X size={11} /></button></span>)}</div>}
      {!compact && !prompt && <motion.div className="template-gallery" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        <span>Start from a shape</span>
        <div>{starterTemplates.map((template) => <button key={template.title} type="button" onClick={() => { setPrompt(template.prompt); setMode(template.mode) }}><strong>{template.title}</strong><small>{template.outcome}</small></button>)}</div>
      </motion.div>}
      {!compact && skills.length > 0 && <div className="selected-skills" aria-label="Selected skill packs">{skills.map((skill) => <span key={skill}><Sparkles size={10} /> {skill.replaceAll('_', ' ')}</span>)}</div>}
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={compact ? 'Ask ONEVibe to refine or continue…' : 'Assign a task, build an app, or investigate a problem'}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }}
      />
      {!compact && <details className="prompt-safety"><summary><Info size={12} /> Before you delegate</summary><p>Do not paste passwords, access tokens, or private keys. Attached files and website references are treated as untrusted context; policy applies at the workspace boundary, and consequential actions require a separate VTI Wallet approval.</p></details>}
      <div className="composer-actions">
        <div className="composer-left">
          {!compact && <button title="Attach files" aria-label="Attach files" onClick={() => fileInput.current?.click()}><Paperclip size={16} /></button>}
          {!compact && <button title="Connect website reference" aria-label="Connect website reference" onClick={() => setReferencesOpen((value) => !value)}><Link2 size={16} /></button>}
          <span className="composer-divider" />
          {!compact && <div className="picker-wrap"><button className="mode-button" aria-haspopup="menu" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen((value) => !value)}><Monitor size={15} /> {selectedMode.label} <ChevronDown size={13} /></button>{modePickerOpen && <motion.div className="mode-catalog" role="menu" initial={{ opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: .98 }}>{modeCatalog.map((candidate) => { const Icon = candidate.icon; return <button key={candidate.id} role="menuitem" className={candidate.id === mode ? 'selected' : ''} onClick={() => { setMode(candidate.id); setModePickerOpen(false) }}><Icon size={15} /><span><strong>{candidate.label}</strong><small>{candidate.detail}</small></span>{candidate.id === mode && <ShieldCheck size={13} />}</button> })}</motion.div>}</div>}
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
