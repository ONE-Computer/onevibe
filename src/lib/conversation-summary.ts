import type { ConversationSummary, Task, TaskSnapshot } from '../types'

export const conversationSummaryFromTask = (task: Task | TaskSnapshot): ConversationSummary => {
  const messages = 'messages' in task ? task.messages.filter((message) => message.role !== 'system') : []
  const last = messages.at(-1)
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    provider: task.provider,
    mode: task.mode,
    projectId: task.projectId,
    ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
    ...(task.forkedFromMessageId ? { forkedFromMessageId: task.forkedFromMessageId } : {}),
    messageCount: messages.length,
    ...(last ? { lastMessage: { role: last.role, preview: last.content.replace(/\s+/g, ' ').trim().slice(0, 180) || (last.status === 'cancelled' ? 'Run cancelled before a response.' : last.status === 'failed' ? 'Run failed before a response.' : 'Response pending…'), status: last.status, createdAt: last.createdAt } } : {}),
    createdAt: task.createdAt,
    updatedAt: last && last.updatedAt > task.updatedAt ? last.updatedAt : task.updatedAt,
  }
}

export const upsertConversation = (items: ConversationSummary[], incoming: ConversationSummary) =>
  [incoming, ...items.filter((item) => item.id !== incoming.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
