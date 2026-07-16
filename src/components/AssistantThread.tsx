import { useCallback, useMemo } from 'react'
import { ArrowUp, CheckCircle2, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  AssistantRuntimeProvider,
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

const UserMessage = () => {
  const createdAt = useAuiState((state) => state.message.createdAt)
  return <MessagePrimitive.Root className="aui-user-message"><span>You · {timestamp(createdAt)}</span><MessagePrimitive.Parts /></MessagePrimitive.Root>
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
  return <MessagePrimitive.Root className="aui-assistant-message"><div className="assistant-orb">O</div><div><strong>ONEVibe <small>{running ? '· writing' : `· ${timestamp(createdAt)}`}</small></strong><MessagePrimitive.Parts components={{ tools: { Fallback: ToolCallCard } }} />{running && <span className="typing-indicator" aria-label="ONEVibe is writing"><i /><i /><i /></span>}</div></MessagePrimitive.Root>
}

type Props = { task: TaskSnapshot; busy: boolean; onSubmit: (prompt: string) => Promise<void> }

export const AssistantThread = ({ task, busy, onSubmit }: Props) => {
  const messages = useMemo(() => projectAssistantToolCalls(task.messages, task.events), [task.events, task.messages])
  const send = useCallback(async (message: AppendMessage) => {
    const prompt = message.content.filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n').trim()
    if (prompt) await onSubmit(prompt)
  }, [onSubmit])
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: toAssistantMessage,
    onNew: send,
    // The backend, not browser memory, owns durable guidance queueing while a
    // provider turn runs, so this external thread stays sendable.
    isRunning: false,
    isSendDisabled: busy || Boolean(task.inputRequest),
  })

  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root className="aui-thread"><ThreadPrimitive.Viewport className="aui-thread-viewport"><ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} /><ThreadPrimitive.ViewportFooter className="aui-thread-footer"><ComposerPrimitive.Root className="aui-composer"><ComposerPrimitive.Input aria-label="Continue this governed task" placeholder={task.status === 'running' ? 'Add guidance for the next provider turn…' : 'Continue this task…'} rows={1} /><div className="aui-composer-meta"><span><ShieldCheck size={11} /> {task.status === 'running' ? 'Durably queued while this turn runs' : 'Bound to this conversation workspace'}</span><ComposerPrimitive.Send className="aui-send" aria-label="Send message"><ArrowUp size={15} /></ComposerPrimitive.Send></div></ComposerPrimitive.Root></ThreadPrimitive.ViewportFooter></ThreadPrimitive.Viewport></ThreadPrimitive.Root></AssistantRuntimeProvider>
}
