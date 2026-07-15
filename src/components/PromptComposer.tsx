import { AppWindow, ArrowUp, BarChart3, Bot, ChevronDown, Cloud, FileText, Gamepad2, Globe2, Info, Link2, Monitor, Palette, Paperclip, Presentation, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import type { RuntimeReadiness, Task, TaskAttachment, TaskMode, TaskSkill } from '../types'

type DraftAttachment = Pick<TaskAttachment, 'name' | 'mimeType'> & { dataBase64: string; size: number }
type Props = { compact?: boolean; busy?: boolean; queueable?: boolean; skills?: TaskSkill[]; runtime?: RuntimeReadiness; onSubmit: (prompt: string, provider: Task['provider'], mode: TaskMode, references?: string[], attachments?: DraftAttachment[], skills?: TaskSkill[]) => Promise<void> }

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
  { title: 'Enterprise site', outcome: 'Responsive site + preview', mode: 'website', prompt: 'Build a polished responsive enterprise landing page for a secure AI workspace. Include clear positioning, product flow, trust signals, accessible FAQ, and mobile layout.' },
  { title: 'SaaS launch', outcome: 'Product narrative + CTA', mode: 'website', prompt: 'Create a focused SaaS launch website with a product story, primary workflow, proof points, pricing-ready CTA, FAQ, and an accessible responsive layout.' },
  { title: 'E-commerce concept', outcome: 'Storefront prototype', mode: 'app', prompt: 'Prototype an e-commerce storefront with a refined product catalogue, product detail, cart interaction, sample inventory, and responsive checkout-ready flow. Use only fictional data.' },
  { title: 'Operations dashboard', outcome: 'Interactive internal app', mode: 'app', prompt: 'Create a clean internal operations dashboard with a priority queue, status indicators, filtering interaction, realistic fictional sample data, and clear action boundaries.' },
  { title: 'Portfolio', outcome: 'Personal work showcase', mode: 'website', prompt: 'Build a modern portfolio website with an editorial hero, selected work, case-study cards, an about section, and an accessible contact CTA. Use fictional placeholder content.' },
  { title: 'Link hub', outcome: 'Compact personal page', mode: 'website', prompt: 'Create a concise personal link hub with a distinctive visual identity, profile summary, grouped links, social/contact actions, and a polished mobile-first layout.' },
  { title: 'Make a briefing', outcome: 'Narrative deck + speaker notes', mode: 'slides', prompt: 'Create an executive update deck: context, decision, delivery plan, risks, and next steps. Keep it concise, evidence-led, and ready to present.' },
  { title: 'Investigate a question', outcome: 'Cited research brief', mode: 'research', prompt: 'Research this question, distinguish evidence from inference, and produce a concise brief with sources, open questions, and recommended next steps.' },
  { title: 'Write a blog', outcome: 'Draft + portable source', mode: 'document', prompt: 'Draft a clear, insightful blog post with a strong opening, structured argument, practical examples, a measured conclusion, and a portable Markdown source for editorial review.' },
  { title: 'Data decision story', outcome: 'Chart + limitations', mode: 'data', prompt: 'Create a decision-oriented data story with a concise narrative, readable charts, stated assumptions, sample data clearly labelled, and a portable CSV source.' },
]

const slideTemplates = [
  { title: 'Executive update', outcome: 'Decision, progress, risks', prompt: 'Create an executive update deck with the decision in view, progress to date, material risks, options, and a recommended next step.' },
  { title: 'Product narrative', outcome: 'Problem, approach, proof', prompt: 'Create a product narrative deck that explains the user problem, proposed experience, operating model, proof points, and the next milestone.' },
  { title: 'Decision brief', outcome: 'Options and recommendation', prompt: 'Create a concise decision brief with context, choices, trade-offs, recommendation, dependencies, and the owner needed for the next decision.' },
] as const

export const PromptComposer = ({ compact = false, busy = false, queueable = false, skills = [], runtime, onSubmit }: Props) => {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<Task['provider']>('demo')
  const [mode, setMode] = useState<TaskMode>('general')
  const [referenceDraft, setReferenceDraft] = useState('')
  const [references, setReferences] = useState<string[]>([])
  const [referencesOpen, setReferencesOpen] = useState(false)
  const [modePickerOpen, setModePickerOpen] = useState(false)
  const [providerPickerOpen, setProviderPickerOpen] = useState(false)
  const [attachments, setAttachments] = useState<DraftAttachment[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const selectedMode = modeCatalog.find((candidate) => candidate.id === mode) ?? modeCatalog[0]!
  const providerStates = runtime?.providers ?? [{ id: 'demo' as const, label: 'Safe demo', boundary: 'Local task workspace', available: true, detail: 'Deterministic UX and evidence contract; not VM isolation.' }]
  const selectedProvider = providerStates.find((candidate) => candidate.id === provider) ?? providerStates[0]!

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
    <motion.div layout className={`composer ${compact ? 'compact' : ''}`}>
      {!compact && <input ref={fileInput} className="file-input" type="file" multiple onChange={(event) => { const selected = [...(event.target.files ?? [])].slice(0, 4 - attachments.length); void Promise.all(selected.map(async (file) => { if (file.size > 256 * 1024) return undefined; const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) }); return { name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: dataUrl.split(',', 2)[1] ?? '', size: file.size } })).then((files) => setAttachments((current) => [...current, ...files.filter((file): file is DraftAttachment => Boolean(file))].slice(0, 4))); event.currentTarget.value = '' }} />}
      {!compact && referencesOpen && <div className="reference-popover"><input value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} placeholder="https://example.com/reference" onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); try { const url = new URL(referenceDraft); if (!/^https?:$/.test(url.protocol) || url.username || url.password || /(?:token|secret|api[_-]?key|password)=/i.test(url.search)) return; setReferences((current) => current.includes(url.toString()) || current.length >= 8 ? current : [...current, url.toString()]); setReferenceDraft('') } catch { /* URL remains editable until valid */ } }} /><span>Press Enter to attach a public reference. ONEVibe does not fetch it automatically.</span></div>}
      {!compact && references.length > 0 && <div className="reference-chips">{references.map((reference) => <span key={reference}>{new URL(reference).hostname}<button aria-label={`Remove ${reference}`} onClick={() => setReferences((current) => current.filter((item) => item !== reference))}><X size={11} /></button></span>)}</div>}
      {!compact && attachments.length > 0 && <div className="reference-chips attachment-chips">{attachments.map((attachment) => <span key={`${attachment.name}-${attachment.size}`}>{attachment.name} · {Math.ceil(attachment.size / 1024)} KB<button aria-label={`Remove ${attachment.name}`} onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))}><X size={11} /></button></span>)}</div>}
      {!compact && !prompt && <motion.div className="template-gallery" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
        <span>Start from a shape</span>
        <div>{starterTemplates.map((template) => <button key={template.title} type="button" onClick={() => { setPrompt(template.prompt); setMode(template.mode) }}><strong>{template.title}</strong><small>{template.outcome}</small></button>)}</div>
      </motion.div>}
      {!compact && !prompt && mode === 'slides' && <motion.div className="template-gallery slide-template-gallery" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}><span>Slide narrative</span><div>{slideTemplates.map((template) => <button key={template.title} type="button" onClick={() => setPrompt(template.prompt)}><strong>{template.title}</strong><small>{template.outcome}</small></button>)}</div></motion.div>}
      {!compact && skills.length > 0 && <div className="selected-skills" aria-label="Selected skill packs">{skills.map((skill) => <span key={skill}><Sparkles size={10} /> {skill.replaceAll('_', ' ')}</span>)}</div>}
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={compact ? (queueable ? 'Guide the next turn — this will queue safely…' : 'Ask ONEVibe to refine or continue…') : 'Assign a task, build an app, or investigate a problem'}
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
          {!compact && <div className="picker-wrap"><button className="mode-button" aria-haspopup="menu" aria-expanded={providerPickerOpen} onClick={() => setProviderPickerOpen((value) => !value)}><span className={`runtime-dot ${selectedProvider.available ? 'ready' : 'unavailable'}`} />{provider === 'demo' ? <Sparkles size={15} /> : <Cloud size={15} />}{selectedProvider.label} <ChevronDown size={13} /></button>{providerPickerOpen && <motion.div className="mode-catalog provider-catalog" role="menu" initial={{ opacity: 0, y: 6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: .98 }}>{providerStates.map((candidate) => <button key={candidate.id} role="menuitem" className={candidate.id === provider ? 'selected' : ''} disabled={!candidate.available} onClick={() => { setProvider(candidate.id); setProviderPickerOpen(false) }}><span className={`runtime-dot ${candidate.available ? 'ready' : 'unavailable'}`} /><Cloud size={15} /><span><strong>{candidate.label}</strong><small>{candidate.boundary} · {candidate.detail}</small></span>{candidate.id === provider && <ShieldCheck size={13} />}</button>)}</motion.div>}</div>}
        </div>
        <div className="composer-right">
          <span className="policy-chip"><ShieldCheck size={13} /> governed</span>
          <button className="send-button" disabled={!prompt.trim() || busy || !selectedProvider.available} onClick={() => void submit()} aria-label={queueable ? 'Queue guidance for next turn' : 'Start task'}><ArrowUp size={17} /></button>
        </div>
      </div>
    </motion.div>
  )
}
