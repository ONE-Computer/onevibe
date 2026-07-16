import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type FC, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, CheckCircle2, Copy, Download, Eye, FileText, LoaderCircle, Paperclip, Presentation, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import {
  AssistantRuntimeProvider,
  ActionBarPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { TaskSnapshot } from '../types'
import { toAssistantMessage } from '../lib/assistant-message'
import { projectAssistantToolCalls } from '../lib/assistant-tool-projection'
import type { AssistantArtifact, AssistantTraceItem } from '../lib/assistant-tool-projection'

const timestamp = (value?: Date) => value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? ''

type DraftFollowUpAttachment = { name: string; mimeType: string; dataBase64: string; size: number }

const MessageActions = () => <ActionBarPrimitive.Root className="aui-message-actions" autohide="not-last"><ActionBarPrimitive.Copy aria-label="Copy message" title="Copy message"><Copy size={11} /></ActionBarPrimitive.Copy></ActionBarPrimitive.Root>

const UserMessage = () => {
  const createdAt = useAuiState((state) => state.message.createdAt)
  const inputFiles = useAuiState((state) => (state.message.metadata.custom as { inputFiles?: Array<{ name: string; size: number }> } | undefined)?.inputFiles ?? [])
  return <MessagePrimitive.Root className="aui-user-message"><span>You · {timestamp(createdAt)}</span><MessagePrimitive.Parts />{inputFiles.length > 0 && <div className="aui-message-files">{inputFiles.map((file) => <span key={file.name}><Paperclip size={10} />{file.name}<small>{Math.ceil(file.size / 1024)} KB</small></span>)}</div>}<MessageActions /></MessagePrimitive.Root>
}

const ToolCallCard = ({ toolName, args, result, isError, timing }: ToolCallMessagePartProps) => {
  const details = args as { executionRoute?: string; inputKeys?: string[]; browserTool?: boolean }
  const outcome = result && typeof result === 'object' ? result as { summary?: string } : undefined
  const running = result === undefined
  const elapsed = timing?.completedAt && timing.startedAt ? `${Math.max(0, (timing.completedAt - timing.startedAt) / 1000).toFixed(1)}s` : undefined
  return <div className={`aui-tool-call ${running ? 'running' : isError ? 'failed' : 'completed'}`}><span>{running ? <LoaderCircle size={14} /> : isError ? <TriangleAlert size={14} /> : <CheckCircle2 size={14} />}</span><div><strong>{toolName}</strong><small>{details.browserTool ? 'Browser in sandbox' : details.executionRoute?.replaceAll('_', ' ') ?? 'Governed runtime'}{details.inputKeys?.length ? ` · ${details.inputKeys.join(', ')}` : ''}</small>{outcome?.summary && <p>{outcome.summary}</p>}</div><em>{running ? 'Running' : isError ? 'Failed' : elapsed ?? 'Done'}</em></div>
}

const readableBytes = (size?: number) => size === undefined ? undefined : size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`

const ArtifactCards = ({ artifacts }: { artifacts: AssistantArtifact[] }) => artifacts.length ? <div className="aui-artifacts">{artifacts.map((artifact) => {
  const deck = artifact.kind === 'slide_deck' || /\.(pptx|pdf)$/i.test(artifact.path)
  return <article key={artifact.path} className="aui-artifact-card"><span>{deck ? <Presentation size={16} /> : <FileText size={16} />}</span><div><strong>{artifact.path.split('/').at(-1)}</strong><small>{artifact.label} · {readableBytes(artifact.size) ?? 'portable file'}</small><em><ShieldCheck size={9} /> ONEComputer evidence {artifact.eventId.split(':').at(-1)}</em></div><a href={artifact.uri} target={artifact.action === 'preview' ? '_blank' : undefined} rel="noreferrer" download={artifact.action === 'download' ? '' : undefined} aria-label={`${artifact.action === 'preview' ? 'Preview' : 'Download'} ${artifact.path}`}>{artifact.action === 'preview' ? <Eye size={14} /> : <Download size={14} />}</a></article>
})}</div> : null

const WorkingTrace = () => {
  const trace = useAuiState((state) => (state.message.metadata.custom as { trace?: AssistantTraceItem[] } | undefined)?.trace ?? [])
  if (!trace.length) return null
  return <details className="aui-working-trace" open><summary><span><ShieldCheck size={12} /> Working trace</span><em>{trace.length} recorded step{trace.length === 1 ? '' : 's'}</em></summary><p className="aui-working-trace-note">Operational summaries and tool evidence from the provider stream. Hidden chain-of-thought is not exposed.</p><ol>{trace.map((item) => <li key={item.id} className={item.status}><span>{item.status === 'running' ? <LoaderCircle className="spin" size={12} /> : item.status === 'failed' ? <TriangleAlert size={12} /> : <CheckCircle2 size={12} />}</span><div><strong>{item.label}</strong>{item.detail && <small>{item.detail.replace(/\s+/g, ' ').slice(0, 240)}</small>}</div><em>{item.status === 'running' ? 'Working' : item.status === 'failed' ? 'Failed' : 'Done'}</em></li>)}</ol></details>
}

const ToolGroup = ({ children, count, active }: { children: ReactNode; count: number; active: boolean }) => <details className="aui-tool-group" open={active || undefined}><summary><span><ShieldCheck size={11} /> Tool activity</span><em>{count} call{count === 1 ? '' : 's'}</em></summary><div className="aui-tool-group-content">{children}</div></details>

const AssistantMessage = () => {
  const createdAt = useAuiState((state) => state.message.createdAt)
  const running = useAuiState((state) => state.message.status?.type === 'running')
  const artifacts = useAuiState((state) => (state.message.metadata.custom as { artifacts?: AssistantArtifact[] } | undefined)?.artifacts ?? [])
  return <MessagePrimitive.Root className="aui-assistant-message"><div className="assistant-orb">O</div><div><strong>ONEVibe <small>{running ? '· writing' : `· ${timestamp(createdAt)}`}</small></strong><WorkingTrace /><MessagePrimitive.GroupedParts groupBy={groupPartByType({ 'tool-call': ['group-tool'] })}>{({ part, children }) => {
    if (part.type === 'group-tool') return <ToolGroup count={part.indices.length} active={part.status.type === 'running'}>{children}</ToolGroup>
    if (part.type === 'tool-call') return <ToolCallCard {...part} />
    if (part.type === 'text') return <p>{part.text}</p>
    if (part.type === 'indicator') return <span className="typing-indicator" aria-label="ONEVibe is writing"><i /><i /><i /></span>
    return null
  }}</MessagePrimitive.GroupedParts><ArtifactCards artifacts={artifacts} />{running && <span className="typing-indicator" aria-label="ONEVibe is writing"><i /><i /><i /></span>}<MessageActions /></div></MessagePrimitive.Root>
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

const MESSAGE_COMPONENTS: MessageComponents = { UserMessage, AssistantMessage }

const VirtualizedMessages: FC<{ taskId: string }> = ({ taskId }) => {
  const rows = useThreadMessageRows()
  const turns = useMemo(() => turnsFor(rows), [rows])
  const isRunning = useAuiState((state) => state.thread.isRunning)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const sticky = useRef(true)
  const previousRunning = useRef(false)
  const didInitialJump = useRef<string | undefined>(undefined)
  const [atBottom, setAtBottom] = useState(true)
  const virtualizer = useVirtualizer({
    count: turns.length,
    estimateSize: () => 180,
    getItemKey: (index) => turns[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 600, width: 600 },
    overscan: 5,
  })
  const jumpToBottom = useCallback(() => {
    sticky.current = true
    if (turns.length > 0) virtualizer.scrollToIndex(turns.length - 1, { align: 'end' })
    requestAnimationFrame(() => { if (scrollRef.current && sticky.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight })
  }, [turns.length, virtualizer])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const onScroll = () => {
      const bottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 8
      if (bottom) sticky.current = true
      setAtBottom(bottom)
    }
    const stopFollowing = () => { sticky.current = false }
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) stopFollowing() }
    element.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('wheel', onWheel, { passive: true })
    element.addEventListener('touchmove', stopFollowing, { passive: true })
    return () => { element.removeEventListener('scroll', onScroll); element.removeEventListener('wheel', onWheel); element.removeEventListener('touchmove', stopFollowing) }
  }, [])

  useEffect(() => {
    const element = scrollRef.current
    const content = contentRef.current
    if (!element || !content) return
    const observer = new ResizeObserver(() => { if (sticky.current) element.scrollTop = element.scrollHeight })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (taskId !== didInitialJump.current && turns.length > 0) { didInitialJump.current = taskId; jumpToBottom() }
    if (isRunning && !previousRunning.current) jumpToBottom()
    previousRunning.current = isRunning
  }, [isRunning, jumpToBottom, taskId, turns.length])

  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems[0]?.start ?? 0
  const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0))
  return <div className="aui-thread-scroll" ref={scrollRef}><div className="aui-thread-content" ref={contentRef} style={{ paddingTop, paddingBottom }}>{virtualItems.map((item) => <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="aui-thread-turn">{turns[item.index]?.messageIds.map((messageId) => <ThreadPrimitive.Unstable_MessageById key={messageId} messageId={messageId} components={MESSAGE_COMPONENTS} />)}</div>)} </div>{!atBottom && <button type="button" className="aui-thread-jump" onClick={jumpToBottom} aria-label="Scroll to latest activity" title="Scroll to latest activity"><ArrowDown size={14} /></button>}</div>
}

type Props = { task: TaskSnapshot; busy: boolean; onSubmit: (prompt: string, attachments?: DraftFollowUpAttachment[]) => Promise<void> }

export const AssistantThread = ({ task, busy, onSubmit }: Props) => {
  const [attachments, setAttachments] = useState<DraftFollowUpAttachment[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const messages = useMemo(() => projectAssistantToolCalls(task.messages, task.events), [task.events, task.messages])
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
    isRunning: task.status === 'pending' || task.status === 'running' || task.status === 'waiting_for_user_input',
    isSendDisabled: busy || Boolean(task.inputRequest),
  })

  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="aui-thread"><VirtualizedMessages taskId={task.id} /><div className="aui-thread-footer"><ComposerPrimitive.Root className="aui-composer"><input ref={fileInput} className="file-input" type="file" multiple onChange={(event) => { void chooseFiles(event.target.files); event.currentTarget.value = '' }} />{attachments.length > 0 && <div className="aui-composer-files">{attachments.map((file) => <span key={`${file.name}-${file.size}`}><Paperclip size={10} />{file.name}<small>{Math.ceil(file.size / 1024)} KB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((item) => item !== file))}><X size={10} /></button></span>)}</div>}{attachmentError && <p className="aui-attachment-error">{attachmentError}</p>}<ComposerPrimitive.Input aria-label="Continue this governed task" placeholder={task.status === 'running' ? 'Add guidance for the next provider turn…' : 'Continue this task…'} rows={1} /><div className="aui-composer-meta"><span><ShieldCheck size={11} /> {task.status === 'running' ? 'Durably queued while this turn runs' : 'Bound to this conversation workspace'}</span><div><button type="button" className="aui-attach" aria-label="Attach files to this turn" title="Attach files to this turn" disabled={attachments.length >= 4 || busy} onClick={() => fileInput.current?.click()}><Paperclip size={14} /></button><ComposerPrimitive.Send className="aui-send" aria-label="Send message"><ArrowUp size={15} /></ComposerPrimitive.Send></div></div></ComposerPrimitive.Root></div></ThreadPrimitive.Root></AssistantRuntimeProvider>
}
