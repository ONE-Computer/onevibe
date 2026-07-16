import { AppWindow, ArrowUp, BarChart3, Bot, ChevronDown, Cloud, FileText, Gamepad2, Globe2, Link2, Monitor, Palette, Paperclip, Presentation, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { RuntimeReadiness, Task, TaskAttachment, TaskMode, TaskSkill } from '../types'

type DraftAttachment = Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string; size: number }
type Props = { compact?: boolean; busy?: boolean; queueable?: boolean; skills?: TaskSkill[]; runtime?: RuntimeReadiness; onSubmit: (prompt: string, provider: Task['provider'], mode: TaskMode, references?: string[], attachments?: DraftAttachment[], skills?: TaskSkill[]) => Promise<void> }

const modeCatalog: Array<{ id: TaskMode; label: string; detail: string; icon: typeof Bot }> = [
  { id: 'chat', label: 'Chat', detail: 'Questions and conversation', icon: Bot },
  { id: 'general', label: 'Agent', detail: 'Flexible task with evidence', icon: Bot },
  { id: 'website', label: 'Website', detail: 'Responsive site and preview', icon: Globe2 },
  { id: 'slides', label: 'Slides', detail: 'Deck, notes, and PPTX', icon: Presentation },
  { id: 'document', label: 'Document', detail: 'Brief, report, or memo', icon: FileText },
  { id: 'research', label: 'Research', detail: 'Evidence-led investigation', icon: Search },
  { id: 'data', label: 'Data story', detail: 'Decision narrative and charts', icon: BarChart3 },
  { id: 'design', label: 'Design', detail: 'Directions and design tokens', icon: Palette },
  { id: 'app', label: 'App', detail: 'Interactive React application', icon: AppWindow },
  { id: 'game', label: 'Game', detail: 'Playable web experience', icon: Gamepad2 },
]

const rotatingHomePlaceholders = [
  'Draft a customer briefing on our security posture…',
  'Research the latest agent-runtime landscape and cite sources…',
  'Build a five-slide investor update with speaker notes…',
  'Prototype an internal ops dashboard with sample data…',
  'Turn these notes into a shareable Markdown brief…',
  'Investigate why our latency doubled last week…',
]

export const PromptComposer = ({ compact = false, busy = false, queueable = false, skills = [], runtime, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Task['provider']>('demo')
  const [providerTouched, setProviderTouched] = useState(false)
  const [mode, setMode] = useState<TaskMode>('chat')
  const [referenceDraft, setReferenceDraft] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [referencesOpen, setReferencesOpen] = useState(false)
  const [modePickerOpen, setModePickerOpen] = useState(false)
  const [providerPickerOpen, setProviderPickerOpen] = useState(false)
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (compact || prompt) return
    const id = window.setInterval(() => setPlaceholderIndex((current) => (current + 1) % rotatingHomePlaceholders.length), 4200)
    return () => window.clearInterval(id)
  }, [compact, prompt])

  useEffect(() => {
    if (compact) return
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        textAreaRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compact])
  const selectedMode = modeCatalog.find((candidate) => candidate.id === mode) ?? modeCatalog[0]!
  const providerStates = runtime?.providers ?? [{ id: 'demo' as const, label: 'Simulation · no model call', boundary: 'Local task workspace', available: true, detail: 'Deterministic simulation for UI contracts only; not a provider or VM.' }]
  const selectedProvider = providerStates.find((candidate) => candidate.id === provider) ?? providerStates[0]!

  useEffect(() => {
    if (providerTouched || !runtime) return
    const preferred = runtime.providers.find((candidate) => candidate.id === 'claude_sdk' && candidate.available)
    if (preferred) setProvider(preferred.id)
  }, [providerTouched, runtime])

  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy || !selectedProvider.available) return
    await onSubmit(value, provider, mode, references, attachments, skills)
    setPrompt('')
    setReferences([])
    setReferenceDraft('')
    setAttachments([])
  }

  return (
    <motion.div layout className={`composer secure-signal ${compact ? 'compact' : ''}`}>
      {!compact && <input ref={fileInput} className="file-input" type="file" multiple onChange={(event) => { const selected = [...(event.target.files ?? [])].slice(0, 4 - attachments.length); void Promise.all(selected.map(async (file) => { if (file.size > 256 * 1024) return undefined; const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }); return { name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: dataUrl.split(',', 2)[1] ?? '', size: file.size } })).then((files) => setAttachments((current) => [...current, ...files.filter((file): file is DraftAttachment => Boolean(file))].slice(0, 4))); event.currentTarget.value = '' }} />}
      {!compact && referencesOpen && <div className="reference-popover"><input value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="https://example.com/reference" onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); try { const url = new URL(referenceDraft); if (!/^https?:$/.test(url.protocol) || url.username || url.password || /(?:token|secret|api[_-]?key|password)=/i.test(url.search)) return; setReferences((current) => current.includes(url.toString()) || current.length >= 8 ? current : [...current, url.toString()]); setReferenceDraft('') } catch { /* URL remains editable until valid */ } }} /><span>Press Enter to attach a public reference. ONEVibe does not fetch it automatically.</span></div>}
      {!compact && references.length > 0 && <div className="reference-chips">{references.map((reference) => <span key={reference}>{new URL(reference).hostname}<button aria-label={`Remove ${reference}`} onClick={() => setReferences((current) => current.filter((item) => item !== reference))}><X size={11} /></button></span>)}</div>}
      {!compact && attachments.length > 0 && <div className="reference-chips attachment-chips">{attachments.map((attachment) => <span key={`${attachment.name}-${attachment.size}`}>{attachment.name} · {Math.ceil(attachment.size / 1024)} KB<button aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))}><X size={11} /></button></span>)}</div>}
      {!compact && skills.length > 0 && <div className="selected-skills" aria-label="Selected skill packs">{skills.map((skill) => <span key={skill}><Sparkles size={10} /> {skill.replaceAll('_', ' ')}</span>)}</div>}
      {!compact && provider === 'demo' && <div className="simulation-note" role="status"><Sparkles size={11} /> Simulation only · no model call</div>}
      <textarea
        ref={textAreaRef}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={compact ? (queueable ? 'Guide the next turn — this will queue safely…' : 'Ask ONEVibe to refine or continue…') : rotatingHomePlaceholders[placeholderIndex]}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }}
      />
      {!compact && !prompt && <div className="composer-hint" aria-hidden="true">Press <kbd>⌘</kbd><kbd>K</kbd> to focus · <kbd>↵</kbd> to send · <kbd>⇧↵</kbd> for newline</div>}
      <div className="composer-actions">
        <div className="composer-left">
          {!compact && <button className="composer-icon-action" title="Attach files" aria-label="Attach files" onClick={() => fileInput.current?.click()}><Paperclip size={14} /> Attach</button>}
          {!compact && <button className="composer-icon-action" title="Connect website reference" aria-label="Connect website reference" onClick={() => setReferencesOpen((value) => !value)}><Link2 size={14} /> Reference</button>}
          <span className="composer-divider" />
          {!compact && <div className="picker-wrap"><button className="mode-button" aria-haspopup="menu" aria-expanded={modePickerOpen} onClick={() => setModePickerOpen((value) => !value)}><Monitor size={15} /> {selectedMode.label} <ChevronDown size={13} /></button>{modePickerOpen && <motion.div className="mode-catalog" role="menu" initial={{ opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>{modeCatalog.map((candidate) => { const Icon = candidate.icon; return <button key={candidate.id} role="menuitem" className={candidate.id === mode ? 'selected' : ''} onClick={() => { setMode(candidate.id); setModePickerOpen(false) }}><Icon size={15} /><span><strong>{candidate.label}</strong><small>{candidate.detail}</small></span>{candidate.id === mode && <ShieldCheck size={13} />}</button> })}</motion.div>}</div>}
          {!compact && <div className="picker-wrap"><button className="mode-button" aria-haspopup="menu" aria-expanded={providerPickerOpen} onClick={() => setProviderPickerOpen((value) => !value)}><span className={`runtime-dot ${selectedProvider.available ? 'ready' : 'unavailable'}`} />{provider === 'demo' ? <Sparkles size={15} /> : <Cloud size={15} />}{selectedProvider.label} <ChevronDown size={13} /></button>{providerPickerOpen && <motion.div className="mode-catalog provider-catalog" role="menu" initial={{ opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>{providerStates.map((candidate) => <button key={candidate.id} role="menuitem" className={candidate.id === provider ? 'selected' : ''} disabled={!candidate.available} onClick={() => { setProvider(candidate.id); setProviderTouched(true); setProviderPickerOpen(false) }}><span className={`runtime-dot ${candidate.available ? 'ready' : 'unavailable'}`} />{candidate.id === 'demo' ? <Sparkles size={15} /> : <Cloud size={15} />}<span><strong>{candidate.label}</strong><small>{candidate.boundary} · {candidate.detail}</small></span>{candidate.id === provider && <ShieldCheck size={13} />}</button>)}</motion.div>}</div>}
        </div>
        <div className="composer-right">
          <button className="send-button" disabled={!prompt.trim() || busy || !selectedProvider.available} onClick={() => void submit()} aria-label={queueable ? 'Queue guidance for next turn' : 'Start task'}><ArrowUp size={17} /></button>
        </div>
      </div>
    </motion.div>
  )
}
