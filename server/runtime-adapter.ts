import type { Task } from './types.js'
import type { TaskStore } from './store.js'

export type RuntimeCapability = 'streaming' | 'tool_use' | 'file_system' | 'sandboxed' | 'preview_url' | 'computer_use' | 'fork'

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
  readonly providerId: Task['provider']
  readonly capabilities: readonly RuntimeCapability[]
  run(context: RuntimeContext): Promise<void>
}
