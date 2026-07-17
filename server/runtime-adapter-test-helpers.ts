import type { RuntimeAdapter, RunContext } from './runtime-adapter.js'
import type { Task, RuntimeEvent } from './types.js'
import type { TaskStore } from './store.js'

export const runtimeContextFor = (task: Task, store: TaskStore, prompt: string, continuation: boolean): RunContext => ({
  task,
  store,
  continuation,
  executionId: `test-execution-${task.id}`,
  providerRequestId: `test-provider-request-${task.id}`,
  workingDir: store.workspacePath(task.id),
  mcpConfigs: [],
  requestUserInput: async () => 'unused',
})

export const startRuntime = async (adapter: RuntimeAdapter, task: Task, store: TaskStore, prompt = task.prompt, continuation = false, signal = new AbortController().signal) => {
  const workingDir = store.workspacePath(task.id)
  await adapter.initialize(task, workingDir, [])
  return adapter.run(prompt, runtimeContextFor(task, store, prompt, continuation), signal)
}

export const consumeRuntime = async (adapter: RuntimeAdapter, task: Task, store: TaskStore, prompt = task.prompt, continuation = false, signal = new AbortController().signal) => {
  return consumeStream(await startRuntime(adapter, task, store, prompt, continuation, signal))
}

export const consumeStream = async (stream: AsyncIterable<RuntimeEvent>) => {
  const events: RuntimeEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}
