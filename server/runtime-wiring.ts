import { OneComputerClient } from './onecomputer-client.js'
import { runtimeReadiness } from './runtime-readiness.js'
import type { RuntimeRegistry } from './runtime-registry.js'
import type { claudeProviderConfig } from './claude-provider-config.js'
import type { Task } from './types.js'

export interface RuntimeWiringDeps {
  runtimeRegistry: RuntimeRegistry
  claudeProvider: ReturnType<typeof claudeProviderConfig>
  oneComputerConfigured: boolean
  env: {
    AGENTCORE_RUNTIME_URL: string | undefined
    AGENTCORE_LITELLM_ROUTED: boolean
    REMOTE_RUNTIME_URL: string | undefined
    A2A_BASE_URL: string | undefined
    KIMI_SERVER_URL: string | undefined
    ONECOMPUTER_API_URL: string | undefined
    ONECOMPUTER_SERVICE_TOKEN: string | undefined
    ONECOMPUTER_PROJECT_ID: string | undefined
  }
}

export const createRuntimeWiring = (deps: RuntimeWiringDeps) => {
  const { runtimeRegistry, claudeProvider, oneComputerConfigured } = deps
  const { AGENTCORE_RUNTIME_URL, AGENTCORE_LITELLM_ROUTED, REMOTE_RUNTIME_URL, A2A_BASE_URL, KIMI_SERVER_URL, ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN, ONECOMPUTER_PROJECT_ID } = deps.env
  const claudeConfigured = claudeProvider.configured
  let oneComputerHealthCache: { checkedAt: number; reachable: boolean } | undefined

  const oneComputerReachability = async () => {
    if (!oneComputerConfigured) return undefined
    const now = Date.now()
    if (oneComputerHealthCache && now - oneComputerHealthCache.checkedAt < 15_000) return oneComputerHealthCache.reachable
    try {
      const client = new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL!, serviceToken: ONECOMPUTER_SERVICE_TOKEN!, projectId: ONECOMPUTER_PROJECT_ID })
      await client.health()
      oneComputerHealthCache = { checkedAt: now, reachable: true }
    } catch {
      // Do not send endpoint, credential, or provider error material to the UI.
      oneComputerHealthCache = { checkedAt: now, reachable: false }
    }
    return oneComputerHealthCache.reachable
  }

  const runtimeSnapshot = async () => {
    const states = runtimeReadiness({
      claudeConfigured,
      claudeTransport: claudeProvider.transport,
      codexConfigured: claudeProvider.configured,
      agentCoreConfigured: Boolean(AGENTCORE_RUNTIME_URL && AGENTCORE_LITELLM_ROUTED),
      remoteConfigured: Boolean(REMOTE_RUNTIME_URL),
      a2aConfigured: Boolean(A2A_BASE_URL),
      kimiConfigured: Boolean(KIMI_SERVER_URL),
      oneComputerConfigured,
      oneComputerReachable: await oneComputerReachability(),
    }).providers
    await runtimeRegistry.refreshHealth(states)
    return runtimeRegistry.snapshot(states)
  }

  const providerAvailability = async (provider: Task['provider']) => {
    const readiness = await runtimeSnapshot()
    const state = readiness.providers.find((candidate) => candidate.id === provider)
    return { readiness, state }
  }

  const fallbackRuntimeFor = async (task: Task) => {
    const readiness = await runtimeSnapshot()
    return runtimeRegistry.suggest(task.mode, readiness.providers).find((candidate) => candidate.id !== task.provider && candidate.available && candidate.compatible)
  }

  return { oneComputerReachability, runtimeSnapshot, providerAvailability, fallbackRuntimeFor }
}

export type RuntimeWiring = ReturnType<typeof createRuntimeWiring>
