import { describe, expect, it } from 'vitest'
import { projectAssistantToolCalls } from './assistant-tool-projection'
import type { ChatMessage, RuntimeEvent } from '../types'

const message: ChatMessage = { id: 'message_a', taskId: 'task_a', turnId: 'turn_a', role: 'assistant', content: 'Finished.', status: 'completed', provider: 'onecomputer', createdAt: '2026-07-16T00:00:00.000Z', updatedAt: '2026-07-16T00:00:02.000Z' }
const event = (sequence: number, type: RuntimeEvent['type'], payload: Record<string, unknown>, content?: string): RuntimeEvent => ({ id: `task_a:event:${sequence}`, taskId: 'task_a', runId: 'turn_a', sequence, type, lane: 'activity', label: sequence ? 'Tool result' : 'Write', content, payload, createdAt: `2026-07-16T00:00:0${sequence}.000Z`, previousHash: sequence ? 'a' : 'GENESIS', eventHash: String(sequence) })

describe('assistant tool projection', () => {
  it('pairs durable tool events by turn and invocation without exposing raw input values', () => {
    const [projected] = projectAssistantToolCalls([message], [
      event(0, 'tool_call_started', { toolUseId: 'tool_1', executionRoute: 'onecomputer_sandbox', input: { command: 'secret command', path: '/tmp/work' } }),
      event(1, 'tool_call_completed', { toolUseId: 'tool_1', isError: false }, 'Created the requested artifact.'),
    ])
    expect(projected?.toolParts?.[0]).toMatchObject({ toolCallId: 'tool_1', toolName: 'Write', args: { executionRoute: 'onecomputer_sandbox', inputKeys: ['command', 'path'] }, result: { summary: 'Created the requested artifact.' }, isError: false })
    expect(JSON.stringify(projected)).not.toContain('secret command')
  })

  it('leaves an uncompleted invocation visibly running and ignores operational wrapper calls', () => {
    const [projected] = projectAssistantToolCalls([message], [event(0, 'tool_call_started', { toolUseId: 'tool_1' }), event(1, 'tool_call_started', { parentToolCallId: 'wrapper' })])
    expect(projected?.toolParts).toHaveLength(1)
    expect(projected?.toolParts?.[0]?.result).toBeUndefined()
  })

  it('binds durable turn input evidence to the matching user message', () => {
    const user = { ...message, role: 'user' as const }
    const attached = event(0, 'artifact_created', { kind: 'task_input', files: [{ name: 'brief.txt', path: 'inputs/02-brief.txt', size: 42, mimeType: 'text/plain' }] })
    expect(projectAssistantToolCalls([user], [attached])[0]?.inputFiles).toEqual([{ name: 'brief.txt', path: 'inputs/02-brief.txt', size: 42, mimeType: 'text/plain' }])
  })
})
