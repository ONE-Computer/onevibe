import type { Task } from './types.js'
import type { TaskStore } from './store.js'

export type RuntimeContext = {
  task: Task
  store: TaskStore
  signal: AbortSignal
  prompt: string
  continuation: boolean
  requestUserInput: (prompt: string, options: string[], signal: AbortSignal) => Promise<string>
}

export interface RuntimeAdapter {
  readonly name: string
  run(context: RuntimeContext): Promise<void>
}
