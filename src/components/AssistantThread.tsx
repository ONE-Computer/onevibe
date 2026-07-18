import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type FC, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, Download, Eye, FileText, LoaderCircle, Paperclip, Pencil, Presentation, ShieldCheck, Square, TriangleAlert, X } from 'lucide-react'
import {
  AssistantRuntimeProvider,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  unstable_useComposerInputHistory,
  unstable_useMessageStallDetection,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { TaskSnapshot } from '../types'
import { toAssistantMessage } from '../lib/assistant-message'
import { projectAssistantToolCalls } from '../lib/assistant-tool-projection'
import { providerLabel, stepLabel } from '../lib/runtime-labels'
import type { AssistantArtifact, AssistantTraceItem } from '../lib/assistant-tool-projection'
import { readableBytes } from '../lib/format'
import { t, type Locale } from '../lib/i18n'
import { useSidePanelStore } from '../lib/stores'
import { MarkdownText } from './MarkdownText'

const timestamp = (value?: Date) => value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? ''

type DraftFollowUpAttachment = { name: string; mimeType: string; dataBase64: string; size: number }

const MessageActions = () => <ActionBarPrimitive.Root className="aui-message-actions" autohide="not-last"><ActionBarPrimitive.Copy aria-label="Copy message" title="Copy message"><Copy size={11} /></ActionBarPrimitive.Copy></ActionBarPrimitive.Root>

// Branch navigation stays hidden for single-branch conversations; it appears
// once the runtime exposes multiple branches for one message (edit/fork flow).
const BranchNav = () => <BranchPickerPrimitive.Root className="aui-branch-nav" hideWhenSingleBranch><BranchPickerPrimitive.Previous className="aui-branch-btn" aria-label="Previous response" title="Previous response"><ChevronLeft size={11} /></BranchPickerPrimitive.Previous><span className="aui-branch-count"><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span><BranchPickerPrimitive.Next className="aui-branch-btn" aria-label="Next response" title="Next response"><ChevronRight size={11} /></BranchPickerPrimitive.Next></BranchPickerPrimitive.Root>

// Input history lives inside the composer scope, so the hook needs a child
// component under AssistantRuntimeProvider rather than the thread body.
const ComposerInput = (props: ComponentProps<typeof ComposerPrimitive.Input>) => {
  const history = unstable_useComposerInputHistory()
  return <ComposerPrimitive.Input {...history} {...props} />
}

type ForkMessage = (messageId: string, newPrompt: string) => Promise<void>

const UserMessage = ({ content, onEdit }: { content: string; onEdit: ForkMessage }) => {
  const messageId = useAuiState((state) => state.message.id)
  const createdAt = useAuiState((state) => state.message.createdAt)
  const inputFiles = useAuiState((state) => (state.message.metadata.custom as { inputFiles?: Array<{ name: string; size: number }> } | undefined)?.inputFiles ?? [])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDraft(content) }, [content])
  const submitBranch = async () => {
    const next = draft.trim()
    if (!next || saving) return
    setSaving(true)
    try { await onEdit(messageId, next); setEditing(false) } finally { setSaving(false) }
  }
  return <MessagePrimitive.Root className="aui-user-message"><span>You · {timestamp(createdAt)}</span>{editing ? <div className="aui-message-editor"><textarea aria-label="Edit message and create branch" value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} autoFocus /><div><button type="button" onClick={() => { setDraft(content); setEditing(false) }} disabled={saving}>Cancel</button><button type="button" onClick={() => void submitBranch()} disabled={!draft.trim() || saving}>{saving ? 'Creating branch…' : 'Branch with edit'}</button></div></div> : <MessagePrimitive.Parts components={{ Text: MarkdownText }} />}{inputFiles.length > 0 && <div className="aui-message-files">{inputFiles.map((file) => <span key={file.name}><Paperclip size={10} />{file.name}<small>{Math.ceil(file.size / 1024)} KB</small></span>)}</div>}<MessageActions />{!editing && <button type="button" className="aui-edit-message" onClick={() => setEditing(true)} aria-label="Edit message and create branch" title="Edit message and create branch"><Pencil size={11} /> Edit</button>}</MessagePrimitive.Root>
}

const ToolCallCard = ({ toolName, args, result, isError, timing }: ToolCallMessagePartProps) => {
  const details = args as { executionRoute?: string; inputKeys?: string[]; browserTool?: boolean }
  const outcome = result && typeof result === 'object' ? result as { summary?: string } : undefined
  const running = result === undefined
  const elapsed = timing?.completedAt && timing.startedAt ? `${Math.max(0, (timing.completedAt - timing.startedAt) / 1000).toFixed(1)}s` : undefined
  return <div className={`aui-tool-call ${running ? 'running' : isError ? 'failed' : 'completed'}`}><span>{running ? <LoaderCircle size={14} /> : isError ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}</span><div><strong>{stepLabel(toolName)}</strong><small>{details.browserTool ? 'Browser in sandbox' : details.executionRoute?.replaceAll('_', ' ') ?? 'Secure runtime'}{details.inputKeys?.length ? ` · ${details.inputKeys.join(', ')}` : ''}</small>{outcome?.summary && <p>{outcome.summary}</p>}</div><em>{running ? 'Running' : isError ? 'Failed' : elapsed ?? 'Done'}</em></div>
}

const ArtifactCards = ({ artifacts }: { artifacts: AssistantArtifact[] }) => artifacts.length ? <div className="aui-artifacts">{artifacts.map((artifact) => {
  const deck = artifact.kind === 'slide_deck' || /\.(pptx|pdf)$/i.test(artifact.path)
  return <article key={artifact.path} className="aui-artifact-card"><span>{deck ? <Presentation size={16} /> : <FileText size={16} />}</span><div><strong>{artifact.path.split('/').at(-1)}</strong><small>{artifact.label} · {readableBytes(artifact.size) ?? 'portable file'}</small><em><ShieldCheck size={9} /> ONEComputer evidence {artifact.eventId.split(':').at(-1)}</em></div><a href={artifact.uri} target={artifact.action === 'preview' ? '_blank' : undefined} rel="noreferrer" download={artifact.action === 'download' ? '' : undefined} aria-label={`${artifact.action === 'preview' ? 'Preview' : 'Download'} ${artifact.path}`}>{artifact.action === 'preview' ? <Eye size={14} /> : <Download size={14} />}</a></article>
})}</div> : null

const TraceDetail = ({ detail }: { detail: string }) => {
  const normalized = detail.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 240) return <small>{normalized}</small>
  return <details className="aui-trace-detail"><summary>{normalized.slice(0, 240)}… <span>Show more</span></summary><p>{normalized}</p></details>
}

const WorkingTrace = () => {
  const trace = useAuiState((state) => (state.message.metadata.custom as { trace?: AssistantTraceItem[] } | undefined)?.trace ?? [])
  const running = useAuiState((state) => state.message.status?.type === 'running')
  if (!trace.length) return null
  // Live traces stay open so the user can watch the current step; completed
  // traces collapse to a single review link so the calm assistant narrative
  // is not competing with an operational checklist by default.
  return <details className="aui-working-trace" open={running || undefined}><summary><span><ChevronDown className="aui-trace-chevron" size={12} /><ShieldCheck size={12} /> {running ? 'Working' : `Review working trace (${trace.length} step${trace.length === 1 ? '' : 's'})`}</span>{running && <em>live</em>}</summary><p className="aui-working-trace-note">Operational summaries and tool evidence from the provider stream. Hidden chain-of-thought is not exposed.</p><ol>{trace.map((item) => <li key={item.id} className={item.status}><span>{item.status === 'running' ? <LoaderCircle className="spin" size={12} /> : item.status === 'failed' ? <TriangleAlert size={12} /> : <CheckCircle2 size={12} />}</span><div><strong>{item.label}</strong>{item.detail && <TraceDetail detail={item.detail} />}</div><em>{item.status === 'running' ? 'Working' : item.status === 'failed' ? 'Failed' : 'Done'}</em></li>)}</ol></details>
}

// Consecutive tool-call parts consolidate into one collapsible group (P9-16).
// The body animates via grid-template-rows — never a max-height hack — and its
// content stays inert while collapsed. The group follows the run state (open
// while any call runs, closed once all settle) and remains manually toggleable.
const ToolGroup = ({ children, count, active, locale }: { children: ReactNode; count: number; active: boolean; locale: Locale }) => {
  const [open, setOpen] = useState(active)
  useEffect(() => { setOpen(active) }, [active])
  return <div className={`aui-tool-group${open ? ' open' : ''}`}><button type="button" className="aui-tool-group-header" onClick={() => setOpen((current) => !current)} aria-expanded={open}><i className={`aui-tool-group-dot${active ? ' running' : ''}`} /><span>{t('toolCalls', locale).replace('{count}', String(count))}</span><ChevronDown size={11} /></button><div className="aui-tool-group-window"><div className="aui-tool-group-window-inner" inert={!open || undefined}><div className="aui-tool-group-content">{children}</div></div></div></div>
}

// Provider reasoning streams into a five-line live window; once the message
// settles, the window collapses into a teaser that opens the full trace in
// the side panel. Hidden chain-of-thought is never fabricated here: the block
// renders only when the runtime emits a reasoning part.
const ThinkingBlock = ({ text, streaming, locale }: { text: string; streaming: boolean; locale: Locale }) => {
  const messageId = useAuiState((state) => state.message.id)
  const openPanel = useSidePanelStore((state) => state.openPanel)
  if (!text.trim()) return null
  const teaser = text.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean).at(-1) ?? ''
  return <div className={`aui-thinking${streaming ? ' live' : ''}`}><div className="aui-thinking-label"><i />{t('thinking', locale)}</div><div className="aui-thinking-window"><div className="aui-thinking-window-inner" inert={!streaming || undefined}>{streaming && <p className="aui-thinking-live">{text}</p>}</div></div>{!streaming && <button type="button" className="aui-thinking-teaser" onClick={() => openPanel({ kind: 'reasoning', messageId, text })}><span>{teaser}</span><em>{t('openReasoningTrace', locale)}</em></button>}</div>
}

const AssistantMessage = ({ locale = 'en' }: { locale?: Locale }) => {
  const createdAt = useAuiState((state) => state.message.createdAt)
  const running = useAuiState((state) => state.message.status?.type === 'running')
  const { stalled } = unstable_useMessageStallDetection({ thresholdMs: 15_000 })
  const artifacts = useAuiState((state) => (state.message.metadata.custom as { artifacts?: AssistantArtifact[] } | undefined)?.artifacts ?? [])
  return <MessagePrimitive.Root className="aui-assistant-message"><div className="assistant-orb" aria-hidden="true">O</div><div className="aui-assistant-message-body"><header><small>{running ? 'Writing…' : timestamp(createdAt)}</small>{running && <span className="aui-live-label"><i /> Live</span>}</header>{stalled && <div className="aui-stall-warning"><Clock size={11} /> Taking longer than expected…</div>}<WorkingTrace /><MessagePrimitive.GroupedParts groupBy={groupPartByType({ 'tool-call': ['group-tool'] })}>{({ part, children }) => {
    if (part.type === 'group-tool') return <ToolGroup count={part.indices.length} active={part.status.type === 'running'} locale={locale}>{children}</ToolGroup>
    if (part.type === 'tool-call') return <ToolCallCard {...part} />
    if (part.type === 'text') return <><MarkdownText />{part.status?.type === 'running' && <span className="streaming-cursor" aria-hidden="true" />}</>
    if (part.type === 'reasoning') return <ThinkingBlock text={part.text} streaming={running} locale={locale} />
    if (part.type === 'indicator') return <span className="typing-indicator" aria-label="ONEVibe is writing"><i /><i /><i /></span>
    return null
  }}</MessagePrimitive.GroupedParts><MessagePrimitive.Error><div className="aui-message-error"><TriangleAlert size={14} /><ErrorPrimitive.Message /></div></MessagePrimitive.Error><ArtifactCards artifacts={artifacts} /><MessageActions /><BranchNav /></div></MessagePrimitive.Root>
}

type MessageRow = { id: string; role: 'user' | 'assistant' | 'system' }
type Turn = { id: string; messageIds: string[] }
type MessageComponents = ComponentProps<typeof ThreadPrimitive.Unstable_MessageById>['components']

const useThreadMessageRows = (): readonly MessageRow[] => {
  const previous = useRef<readonly MessageRow[]>([])
  return useAuiState((state) => {
    const messages = state.thread.messages
    const cached = previous.current
    if (cached.length === messages.length && cached.every((row, index) => row.id === messages[index]?.id && row.role === messages[index]?.role)) return cached
    const next = messages.map(({ id, role }) => ({ id, role }))
    previous.current = next
    return next
  })
}

const turnsFor = (messages: readonly MessageRow[]): Turn[] => {
  const turns: Turn[] = []
  for (const message of messages) {
    const last = turns.at(-1)
    if (message.role === 'user' || !last) turns.push({ id: message.id, messageIds: [message.id] })
    else last.messageIds.push(message.id)
  }
  return turns
}

const VirtualizedMessages: FC<{ taskId: string; components: MessageComponents }> = ({ taskId, components }) => {
  const rows = useThreadMessageRows()
  const turns = useMemo(() => turnsFor(rows), [rows])
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const didInitialJump = useRef<string | undefined>(undefined)
  const virtualizer = useVirtualizer({
    count: turns.length,
    estimateSize: () => 180,
    getItemKey: (index) => turns[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 600, width: 600 },
    overscan: 5,
  })
  const jumpToBottom = useCallback(() => {
    if (turns.length > 0) virtualizer.scrollToIndex(turns.length - 1, { align: 'end' })
    requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight })
  }, [turns.length, virtualizer])

  // Ongoing auto-scroll (follow while at bottom, yield on user scroll, jump on
  // run start) is owned by ThreadPrimitive.Viewport's built-in behavior; this
  // effect only covers the first jump when opening a task with history.
  useLayoutEffect(() => {
    if (taskId !== didInitialJump.current && turns.length > 0) { didInitialJump.current = taskId; jumpToBottom() }
  }, [jumpToBottom, taskId, turns.length])

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems[0]?.start ?? 0
  const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0))
  return <ThreadPrimitive.Viewport className="aui-thread-scroll" ref={scrollRef} autoScroll scrollToBottomOnRunStart><div className="aui-thread-content" ref={contentRef} style={{ paddingTop, paddingBottom }}>{virtualItems.map((item) => <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="aui-thread-turn">{turns[item.index]?.messageIds.map((messageId) => <ThreadPrimitive.Unstable_MessageById key={messageId} messageId={messageId} components={components} />)}</div>)} </div><ThreadPrimitive.ScrollToBottom className="aui-thread-jump" aria-label="Scroll to latest activity" title="Scroll to latest activity"><ArrowDown size={14} /></ThreadPrimitive.ScrollToBottom></ThreadPrimitive.Viewport>
}

type Props = { task: TaskSnapshot; busy: boolean; onSubmit: (prompt: string, attachments?: DraftFollowUpAttachment[]) => Promise<void>; onSwitchRuntime: (provider: TaskSnapshot['provider']) => Promise<void>; onEditMessage: ForkMessage; locale?: Locale }

const fallbackProviderFor = (task: TaskSnapshot): TaskSnapshot['provider'] | undefined => {
  const knownProviders = new Set<TaskSnapshot['provider']>(['demo', 'claude_sdk', 'codex', 'agentcore', 'onecomputer', 'remote'])
  for (const event of [...task.events].reverse()) {
    if (event.type !== 'runtime_fallback_available' && event.type !== 'run_failed') continue
    const candidate = event.payload.fallbackProvider
    if (typeof candidate === 'string' && knownProviders.has(candidate as TaskSnapshot['provider'])) return candidate as TaskSnapshot['provider']
  }
  return undefined
}

export const AssistantThread = ({ task, busy, onSubmit, onSwitchRuntime, onEditMessage, locale = 'en' }: Props) => {
  const [attachments, setAttachments] = useState<DraftFollowUpAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const messages = useMemo(() => projectAssistantToolCalls(task.messages, task.events), [task.events, task.messages])
  const messageContent = useMemo(() => new Map(task.messages.filter((message) => message.role === 'user').map((message) => [message.id, message.content])), [task.messages])
  const messageComponents = useMemo<MessageComponents>(() => ({
    UserMessage: () => {
      const messageId = useAuiState((state) => state.message.id)
      return <UserMessage content={messageContent.get(messageId) ?? ''} onEdit={onEditMessage} />
    },
    AssistantMessage: () => <AssistantMessage locale={locale} />,
  }), [messageContent, onEditMessage, locale])
  const fallbackProvider = useMemo(() => fallbackProviderFor(task), [task])
  const send = useCallback(async (message: AppendMessage) => {
    const prompt = message.content.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n').trim()
    if (prompt) { await onSubmit(prompt, attachments); setAttachments([]); setAttachmentError('') }
  }, [attachments, onSubmit])
  const chooseFiles = async (files: FileList | null) => {
    if (!files) return
    const selected = [...files].slice(0, 4 - attachments.length)
    const total = selected.reduce((sum, file) => sum + file.size, attachments.reduce((sum, file) => sum + file.size, 0))
    if (selected.some((file) => file.size <= 0 || file.size > 256 * 1024) || total > 1_000_000) { setAttachmentError('Up to four files per turn, 256 KB each and 1 MB total.'); return }
    const encoded = await Promise.all(selected.map(async (file): Promise<DraftFollowUpAttachment> => {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file) })
      return { name: file.name, mimeType: file.type || 'application/octet-stream', dataBase64: dataUrl.split(',', 2)[1] ?? '', size: file.size }
    }))
    setAttachments((current) => [...current, ...encoded].slice(0, 4)); setAttachmentError('')
  }
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: toAssistantMessage,
    onNew: send,
    // The backend, not browser memory, owns durable guidance queueing while a
    // provider turn runs, so this external thread stays sendable.
    isRunning: task.status === 'pending' || task.status === 'running',
    isSendDisabled: busy || Boolean(task.inputRequest),
  })

  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="aui-thread"><VirtualizedMessages taskId={task.id} components={messageComponents} />{fallbackProvider && task.status === 'failed' && <div className="aui-runtime-fallback" role="alert"><div><TriangleAlert size={14} /><span><strong>Try another runtime?</strong><small>The selected runtime failed. Switching is explicit and starts a new retry on a different execution boundary.</small></span></div><button type="button" onClick={() => void onSwitchRuntime(fallbackProvider)}>Switch to {providerLabel(fallbackProvider)} and retry</button></div>}<ThreadPrimitive.ViewportFooter className="aui-thread-footer"><ComposerPrimitive.Root className="aui-composer"><input ref={fileInput} className="file-input" type="file" multiple onChange={(event) => { void chooseFiles(event.target.files); event.currentTarget.value = '' }} />{attachments.length > 0 && <div className="aui-composer-files">{attachments.map((file) => <span key={`${file.name}-${file.size}`}><Paperclip size={10} />{file.name}<small>{Math.ceil(file.size / 1024)} KB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((item) => item !== file))}><X size={10} /></button></span>)}</div>}{attachmentError && <p className="aui-attachment-error">{attachmentError}</p>}<ComposerInput aria-label="Continue this task" placeholder={task.inputRequest ? 'Choose an answer above to resume…' : task.status === 'running' ? 'Add guidance for the next provider turn…' : 'Continue this task…'} rows={1} /><div className="aui-composer-meta"><span><ShieldCheck size={11} /> {task.inputRequest ? 'Waiting for your answer' : task.status === 'running' ? 'Durably queued while this turn runs' : 'Bound to this conversation workspace'}</span><div><button type="button" className="aui-attach" aria-label="Attach files to this turn" title="Attach files to this turn" disabled={attachments.length >= 4 || busy || Boolean(task.inputRequest)} onClick={() => fileInput.current?.click()}><Paperclip size={14} /></button><AuiIf condition={(state) => state.thread.isRunning}><ComposerPrimitive.Cancel className="aui-cancel" aria-label="Stop generation" title="Stop generation"><Square size={13} /></ComposerPrimitive.Cancel></AuiIf><ComposerPrimitive.Send className="aui-send" aria-label="Send message"><ArrowUp size={15} /></ComposerPrimitive.Send></div></div></ComposerPrimitive.Root></ThreadPrimitive.ViewportFooter></ThreadPrimitive.Root></AssistantRuntimeProvider>
}
