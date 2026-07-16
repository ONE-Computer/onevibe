import type { ThreadMessageLike } from '@assistant-ui/react'
import type { ChatMessage } from '../types'
import type { AssistantConversationMessage } from './assistant-tool-projection'

const statusFor = (message: ChatMessage): ThreadMessageLike['status'] => {
  if (message.status === 'streaming') return { type: 'running' }
  if (message.status === 'completed') return { type: 'complete', reason: 'stop' }
  if (message.status === 'cancelled') return { type: 'incomplete', reason: 'cancelled' }
  return { type: 'incomplete', reason: 'error' }
}

export const toAssistantMessage = (message: AssistantConversationMessage): ThreadMessageLike => ({
  id: message.id,
  role: message.role,
  content: [...(message.toolParts ?? []), ...(message.content ? [{ type: 'text' as const, text: message.content }] : [])],
  createdAt: new Date(message.createdAt),
  ...(message.role === 'assistant' ? { status: statusFor(message) } : {}),
  metadata: { custom: { taskId: message.taskId, turnId: message.turnId, provider: message.provider } },
})
