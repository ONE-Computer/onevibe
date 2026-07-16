import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowUp, CheckCircle2, Copy, LoaderCircle, Paperclip, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import {
  AssistantRuntimeProvider,
  ActionBarPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import type { TaskSnapshot } from '../types'
import { toAssistantMessage } from '../lib/assistant-message'
import { projectAssistantToolCalls } from '../lib/assistant-tool-projection'

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

const AssistantMessage = () => {
  const createdAt = useAuiState((state) => state.message.createdAt)
  const running = useAuiState((state) => state.message.status?.type === 'running')
  return <MessagePrimitive.Root className="aui-assistant-message"><div className="assistant-orb">O</div><div><strong>ONEVibe <small>{running ? '· writing' : `· ${timestamp(createdAt)}`}</small></strong><MessagePrimitive.Parts components={{ tools: { Fallback: ToolCallCard } }} />{running && <span className="typing-indicator" aria-label="ONEVibe is writing"><i /><i /><i /></span>}<MessageActions /></div></MessagePrimitive.Root>
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
    isRunning: false,
    isSendDisabled: busy || Boolean(task.inputRequest),
  })

  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="aui-thread"><ThreadPrimitive.Viewport className="aui-thread-viewport"><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /><ThreadPrimitive.ViewportFooter className="aui-thread-footer"><ComposerPrimitive.Root className="aui-composer"><input ref={fileInput} className="file-input" type="file" multiple onChange={(event) => { void chooseFiles(event.target.files); event.currentTarget.value = '' }} />{attachments.length > 0 && <div className="aui-composer-files">{attachments.map((file) => <span key={`${file.name}-${file.size}`}><Paperclip size={10} />{file.name}<small>{Math.ceil(file.size / 1024)} KB</small><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((item) => item !== file))}><X size={10} /></button></span>)}</div>}{attachmentError && <p className="aui-attachment-error">{attachmentError}</p>}<ComposerPrimitive.Input aria-label="Continue this governed task" placeholder={task.status === 'running' ? 'Add guidance for the next provider turn…' : 'Continue this task…'} rows={1} /><div className="aui-composer-meta"><span><ShieldCheck size={11} /> {task.status === 'running' ? 'Durably queued while this turn runs' : 'Bound to this conversation workspace'}</span><div><button type="button" className="aui-attach" aria-label="Attach files to this turn" title="Attach files to this turn" disabled={attachments.length >= 4 || busy} onClick={() => fileInput.current?.click()}><Paperclip size={14} /></button><ComposerPrimitive.Send className="aui-send" aria-label="Send message"><ArrowUp size={15} /></ComposerPrimitive.Send></div></div></ComposerPrimitive.Root></ThreadPrimitive.ViewportFooter></ThreadPrimitive.Viewport></ThreadPrimitive.Root></AssistantRuntimeProvider>
}
