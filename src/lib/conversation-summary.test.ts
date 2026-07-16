import { describe, expect, it } from 'vitest'
import { conversationSummaryFromTask, upsertConversation } from './conversation-summary'
import type { TaskSnapshot } from '../types'

const task = (id: string, updatedAt: string): TaskSnapshot => ({
  id, title: `Conversation ${id}`, prompt: 'Prompt', provider: 'claude_sdk', mode: 'general', skills: [], tags: [], queuedGuidance: [], projectId: 'project_onevibe', references: [], attachments: [], status: 'completed', plan: [], createdAt: '2026-07-16T00:00:00.000Z', updatedAt, events: [], files: [],
  messages: [{ id: `message_${id}`, taskId: id, turnId: `turn_${id}`, role: 'assistant', content: '  Durable   answer  ', status: 'completed', provider: 'claude_sdk', createdAt: updatedAt, updatedAt }],
})

describe('conversation summaries', () => {
  it('derives the sidebar summary from the authoritative snapshot', () => {
    expect(conversationSummaryFromTask(task('a', '2026-07-16T01:00:00.000Z'))).toMatchObject({ id: 'a', messageCount: 1, lastMessage: { role: 'assistant', preview: 'Durable answer' } })
  })

  it('upserts and reorders a conversation after a live update', () => {
    const older = conversationSummaryFromTask(task('a', '2026-07-16T01:00:00.000Z'))
    const newer = conversationSummaryFromTask(task('b', '2026-07-16T02:00:00.000Z'))
    expect(upsertConversation([newer], older).map((item) => item.id)).toEqual(['b', 'a'])
    expect(upsertConversation([older, newer], { ...older, updatedAt: '2026-07-16T03:00:00.000Z' }).map((item) => item.id)).toEqual(['a', 'b'])
  })
})
