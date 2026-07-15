import { randomUUID } from 'node:crypto'
import type { TaskStore } from './store.js'

export class UserInputBroker {
  private pending = new Map<string, { taskId: string; ready: Promise<void>; resolve: (answer: string) => void }>()

  constructor(private readonly store: TaskStore) {}

  async request(taskId: string, prompt: string, options: string[], signal: AbortSignal) {
    const id = `input_${randomUUID().replaceAll('-', '').slice(0, 14)}`
    let resolveAnswer!: (answer: string) => void
    let rejectAnswer!: (error: Error) => void
    const answer = new Promise<string>((resolve, reject) => { resolveAnswer = resolve; rejectAnswer = reject })
    void answer.catch(() => undefined)
    let markReady!: () => void
    const ready = new Promise<void>((resolve) => { markReady = resolve })
    const abort = () => {
      this.pending.delete(id)
      rejectAnswer(new DOMException('Task cancelled while waiting for input', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    this.pending.set(id, {
      taskId,
      ready,
      resolve: (value) => { signal.removeEventListener('abort', abort); this.pending.delete(id); resolveAnswer(value) },
    })
    if (signal.aborted) abort()
    await this.store.updateTask(taskId, { status: 'waiting_for_user_input', inputRequest: { id, prompt, options: options.slice(0, 8), createdAt: new Date().toISOString() } })
    await this.store.appendEvent(taskId, {
      type: 'user_input_requested', lane: 'control', status: 'waiting_for_user_input', label: 'Waiting for user',
      content: prompt, payload: { inputRequestId: id, options: options.slice(0, 8) },
    })
    markReady()
    return answer
  }

  async resolve(taskId: string, requestId: string, answer: string) {
    const pending = this.pending.get(requestId)
    if (!pending || pending.taskId !== taskId) throw new Error('Input request not found or no longer active')
    await pending.ready
    await this.store.appendEvent(taskId, {
      type: 'user_input_resolved', lane: 'control', status: 'running', label: 'User input received',
      content: answer, payload: { inputRequestId: requestId },
    })
    await this.store.updateTask(taskId, { status: 'running', inputRequest: undefined })
    pending.resolve(answer)
  }
}
