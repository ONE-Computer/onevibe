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

  it('binds safe portable artifacts to the exact assistant turn and deduplicates updates', () => {
    const created = { ...event(2, 'artifact_created', { kind: 'slide_deck', size: 1200, uri: '/api/tasks/task_a/file?path=deck.pptx&download=1' }, 'deck.pptx'), label: 'Slide export' }
    const updated = { ...event(3, 'artifact_updated', { kind: 'slide_deck', size: 1400, uri: '/api/tasks/task_a/file?path=deck.pptx&download=1' }, 'deck.pptx'), label: 'Revised slide export' }
    const [projected] = projectAssistantToolCalls([message], [created, updated])
    expect(projected?.artifacts).toEqual([expect.objectContaining({ eventId: 'task_a:event:3', path: 'deck.pptx', label: 'Revised slide export', kind: 'slide_deck', size: 1400, action: 'download' })])
  })

  it('excludes visual/input evidence and never projects an arbitrary artifact URI', () => {
    const events = [
      event(1, 'artifact_created', { kind: 'visual_frame', uri: 'https://attacker.example/frame' }, 'evidence/frame.png'),
      event(2, 'artifact_created', { kind: 'task_input' }, 'inputs/brief.txt'),
      event(3, 'artifact_created', { kind: 'source_file', uri: 'https://attacker.example/file' }, 'notes.md'),
    ]
    const [projected] = projectAssistantToolCalls([message], events)
    expect(projected?.artifacts).toEqual([expect.objectContaining({ path: 'notes.md', uri: '/api/tasks/task_a/file?path=notes.md&download=1' })])
  })

  it('projects a safe, turn-scoped operational trace without raw tool input', () => {
    const events = [
      event(0, 'run_started', { executionRoute: 'claude_agent_sdk' }, 'Provider stream opened.'),
      event(1, 'activity_delta', { executionRoute: 'claude_agent_sdk' }, 'Answering conversationally.'),
      { ...event(2, 'tool_call_started', { toolUseId: 'tool_trace', executionRoute: 'claude_agent_sdk', input: { command: 'secret --token abc' } }, 'Bash'), label: 'Bash' },
      event(3, 'tool_call_completed', { toolUseId: 'tool_trace', isError: false }, 'Command completed.'),
      event(4, 'run_completed', { executionRoute: 'claude_agent_sdk' }, 'Done.'),
    ]
    const [projected] = projectAssistantToolCalls([message], events)
    expect(projected?.trace).toHaveLength(2)
    expect(projected?.trace?.find((item) => item.kind === 'tool')).toBeUndefined()
    expect(projected?.toolParts).toHaveLength(1)
    expect(projected?.toolParts?.[0]).toMatchObject({ toolName: 'Bash', isError: false })
    expect(JSON.stringify(projected?.trace)).not.toContain('secret')
  })

  it('does not present provider thinking-token telemetry as user-facing reasoning', () => {
    const thinking = { ...event(1, 'activity_delta', { executionRoute: 'claude_agent_sdk' }), label: 'Claude SDK · thinking tokens' }
    const [projected] = projectAssistantToolCalls([message], [thinking])
    expect(projected?.trace).toEqual([])
  })
})
