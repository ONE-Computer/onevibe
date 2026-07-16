import { describe, expect, it } from 'vitest'
import { toAssistantMessage } from '../lib/assistant-message.js'
import type { ChatMessage } from '../types.js'

const message = (status: ChatMessage['status']): ChatMessage => ({
  id: 'message-1', taskId: 'task-1', turnId: 'turn-1', role: 'assistant', content: 'Durable response', status,
  provider: 'onecomputer', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:00.000Z',
})

describe('assistant-ui transcript conversion', () => {
  it('preserves durable identity, text, provenance, and streaming state', () => {
    expect(toAssistantMessage(message('streaming'))).toMatchObject({
      id: 'message-1', role: 'assistant', content: [{ type: 'text', text: 'Durable response' }], status: { type: 'running' },
      metadata: { custom: { taskId: 'task-1', turnId: 'turn-1', provider: 'onecomputer' } },
    })
  })

  it('maps terminal backend status without inventing browser-owned history', () => {
    expect(toAssistantMessage(message('completed')).status).toEqual({ type: 'complete', reason: 'stop' })
    expect(toAssistantMessage(message('cancelled')).status).toEqual({ type: 'incomplete', reason: 'cancelled' })
    expect(toAssistantMessage(message('failed')).status).toEqual({ type: 'incomplete', reason: 'error' })
  })
})
