import { mkdir } from 'node:fs/promises'
import type { Task, RuntimeCapability, RuntimeEvent, RuntimeHealth, WorkspaceFile } from './types.js'
import type { TaskStore } from './store.js'

export type McpConfig = {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
}

export type RunContext = {
  task: Task
  store: TaskStore
  continuation: boolean
  /** Stable ONEVibe execution identity for retry/recovery correlation. */
  executionId: string
  /** Stable provider-facing correlation value; this is not proof of provider idempotency. */
  providerRequestId: string
  requestUserInput: (prompt: string, options: string[], signal: AbortSignal) => Promise<string>
  workingDir: string
  mcpConfigs: McpConfig[]
}

/** Internal compatibility context used while adapters migrate their provider logic. */
export type LegacyRuntimeContext = Omit<RunContext, 'workingDir' | 'mcpConfigs'> & {
  prompt: string
  signal: AbortSignal
  workingDir?: string
  mcpConfigs?: McpConfig[]
}

type EventProducer = () => Promise<void>

/**
 * Streams the events already persisted by a legacy adapter without appending
 * them a second time. This is the bridge that keeps the append-only store the
 * event authority while the provider implementations move to the lifecycle
 * contract.
 */
export const streamPersistedRun = (store: TaskStore, taskId: string, producer: EventProducer): AsyncIterable<RuntimeEvent> => (async function* () {
  const queue: RuntimeEvent[] = []
  let wake: (() => void) | undefined
  let closed = false
  let failure: unknown
  const unsubscribe = store.subscribe(taskId, (event) => {
    queue.push(event)
    wake?.()
    wake = undefined
  })
  const execution = producer().catch((error: unknown) => {
    failure = error
  }).finally(() => {
    closed = true
    wake?.()
    wake = undefined
  })

  try {
    while (!closed || queue.length > 0) {
      if (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve })
      while (queue.length > 0) yield queue.shift()!
    }
    await execution
    if (failure) throw failure
  } finally {
    unsubscribe()
  }
})()

export interface RuntimeAdapter {
  readonly name: string
  readonly providerId: Task['provider']
  readonly capabilities: readonly RuntimeCapability[]

  initialize(task: Task, workingDir: string, mcpConfigs: McpConfig[]): Promise<void>
  run(prompt: string, context: RunContext, signal: AbortSignal): AsyncIterable<RuntimeEvent>
  cancel(): Promise<void>
  destroy(): Promise<void>
  health?(): Promise<RuntimeHealth>
  getFiles?(): Promise<WorkspaceFile[]>
  getFile?(path: string): Promise<{ content: string; contentHash: string }>
  writeFile?(path: string, content: string, expectedHash?: string): Promise<{ contentHash: string }>
  getPreviewUrl?(): Promise<string | null>
}

/** Lifecycle base for the current store-backed adapters. */
export abstract class RuntimeAdapterBase implements RuntimeAdapter {
  abstract readonly name: string
  abstract readonly providerId: Task['provider']
  abstract readonly capabilities: readonly RuntimeCapability[]

  protected initializedTask?: Task
  protected initializedStore?: TaskStore
  protected workingDir = ''
  protected mcpConfigs: McpConfig[] = []
  private activeController?: AbortController

  async initialize(task: Task, workingDir: string, mcpConfigs: McpConfig[]) {
    await mkdir(workingDir, { recursive: true })
    this.initializedTask = task
    this.initializedStore = undefined
    this.workingDir = workingDir
    this.mcpConfigs = mcpConfigs.map((config) => ({ ...config, args: [...config.args], env: { ...config.env } }))
  }

  protected abstract execute(context: LegacyRuntimeContext): Promise<void>

  run(prompt: string, context: RunContext, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    this.activeController = controller
    this.bindStore(context.store)
    const legacyContext: LegacyRuntimeContext = { ...context, prompt, signal: controller.signal }
    const events = streamPersistedRun(context.store, context.task.id, () => this.execute(legacyContext))
    return this.cleanupStream(events, signal, abort, controller)
  }

  private async *cleanupStream(events: AsyncIterable<RuntimeEvent>, signal: AbortSignal, abort: () => void, controller: AbortController) {
    try {
      for await (const event of events) yield event
    } finally {
      signal.removeEventListener('abort', abort)
      if (this.activeController === controller) this.activeController = undefined
    }
  }

  async cancel() {
    this.activeController?.abort()
  }

  async destroy() {
    this.activeController?.abort()
    this.activeController = undefined
    this.initializedTask = undefined
    this.initializedStore = undefined
    this.workingDir = ''
    this.mcpConfigs = []
  }

  async health(): Promise<RuntimeHealth> {
    return { status: 'unknown', detail: 'This runtime is registered, but no provider-specific connectivity probe is configured.' }
  }

  protected bindStore(store: TaskStore) {
    this.initializedStore = store
  }

  async getFiles() {
    if (!this.initializedStore || !this.initializedTask) return []
    return this.initializedStore.listWorkspaceFiles(this.initializedTask.id)
  }

  async getPreviewUrl() {
    return this.initializedTask?.previewPath ?? null
  }
}
