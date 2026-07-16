import type { RuntimeAdapter } from './runtime-adapter.js'
import type { RuntimeProviderState } from './runtime-readiness.js'
import type { RuntimeCapability, RuntimeHealth, RuntimeReadiness, RuntimeSuggestion, Task, TaskMode } from './types.js'

export type RuntimeFactoryMap = Partial<Record<Task['provider'], () => RuntimeAdapter>>

type ModeRequirement = { capabilities: RuntimeCapability[]; reason: string }

const modeRequirements: Record<TaskMode, ModeRequirement> = {
  chat: { capabilities: ['streaming'], reason: 'streams conversational responses' },
  general: { capabilities: ['streaming', 'tool_use'], reason: 'supports a live task conversation with governed tools' },
  website: { capabilities: ['streaming', 'tool_use', 'file_system'], reason: 'can stream, use governed tools, and write portable workspace files' },
  slides: { capabilities: ['streaming', 'tool_use', 'file_system'], reason: 'can stream, use governed tools, and create portable slide outputs' },
  document: { capabilities: ['streaming', 'file_system'], reason: 'can stream and write document outputs' },
  research: { capabilities: ['streaming', 'tool_use'], reason: 'can stream research with governed tools' },
  data: { capabilities: ['streaming', 'tool_use', 'file_system'], reason: 'can stream, use governed tools, and write data outputs' },
  design: { capabilities: ['streaming', 'tool_use'], reason: 'can stream design work with governed tools' },
  app: { capabilities: ['streaming', 'tool_use', 'file_system'], reason: 'can stream, use governed tools, and write an application workspace' },
  game: { capabilities: ['streaming', 'tool_use', 'file_system'], reason: 'can stream, use governed tools, and write a game workspace' },
}

const missingCapabilities = (state: RuntimeProviderState, required: RuntimeCapability[]) => required.filter((capability) => !state.capabilities.includes(capability))

export class RuntimeRegistry {
  constructor(private readonly options: { defaultProvider?: string; factories: RuntimeFactoryMap }) {}

  providers(states: RuntimeProviderState[]) {
    return states.map((state) => ({ ...state, capabilities: [...state.capabilities] }))
  }

  suggest(mode: TaskMode, states: RuntimeProviderState[]): RuntimeSuggestion[] {
    const requirement = modeRequirements[mode]
    return states.map((state) => {
      const missing = missingCapabilities(state, requirement.capabilities)
      const compatible = missing.length === 0
      let score = state.available && compatible ? 100 : state.available ? 20 : -100
      if (compatible && state.capabilities.includes('sandboxed')) score += 10
      if (compatible && state.capabilities.includes('tool_use')) score += 5
      if (state.id === 'demo') score -= 25
      const reason = !state.available
        ? state.detail
        : compatible
          ? requirement.reason
          : `Missing capability: ${missing.join(', ')}`
      return {
        id: state.id,
        score,
        available: state.available,
        compatible,
        reason,
        capabilities: [...state.capabilities],
      }
    }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  }

  defaultProvider(mode: TaskMode, states: RuntimeProviderState[]) {
    const suggestions = this.suggest(mode, states)
    const requested = this.options.defaultProvider
    const requestedSuggestion = requested ? suggestions.find((candidate) => candidate.id === requested) : undefined
    if (requestedSuggestion?.available && requestedSuggestion.compatible) return requestedSuggestion.id
    return suggestions.find((candidate) => candidate.available && candidate.compatible && candidate.id !== 'demo')?.id
      ?? suggestions.find((candidate) => candidate.available && candidate.compatible)?.id
      ?? 'demo'
  }

  create(provider: Task['provider']) {
    const factory = this.options.factories[provider]
    if (!factory) throw new Error(`Runtime provider '${provider}' is not registered`)
    return factory()
  }

  async test(provider: Task['provider'], states: RuntimeProviderState[]): Promise<RuntimeHealth> {
    const state = states.find((candidate) => candidate.id === provider)
    if (!state?.available) return { status: 'not_configured', detail: state?.detail ?? 'Runtime is not registered.' }
    const adapter = this.create(provider)
    const started = Date.now()
    try {
      const health = await adapter.health?.()
      return health ? { ...health, latencyMs: health.latencyMs ?? Date.now() - started } : { status: 'unknown', latencyMs: Date.now() - started, detail: 'Runtime is configured, but no provider-specific health probe is available.' }
    } catch {
      return { status: 'offline', latencyMs: Date.now() - started, detail: 'The runtime health probe failed.' }
    } finally {
      await adapter.destroy().catch(() => undefined)
    }
  }

  snapshot(states: RuntimeProviderState[]): RuntimeReadiness {
    const providers = this.providers(states)
    const modes: TaskMode[] = ['chat', 'general', 'website', 'slides', 'document', 'research', 'data', 'design', 'app', 'game']
    const suggestions = Object.fromEntries(modes.map((mode) => [mode, this.suggest(mode, providers)])) as Record<TaskMode, RuntimeSuggestion[]>
    return { providers, defaultProvider: this.defaultProvider('chat', providers), suggestions }
  }
}
