import type { Task } from './types.js'
import type { RuntimeCapability } from './runtime-adapter.js'

export type RuntimeProviderState = {
  id: Task['provider']
  label: string
  boundary: string
  available: boolean
  detail: string
  capabilities: RuntimeCapability[]
}

export const runtimeReadiness = (configuration: { claudeConfigured: boolean; claudeTransport?: 'anthropic' | 'litellm' | 'unconfigured'; remoteConfigured: boolean; oneComputerConfigured: boolean; oneComputerReachable?: boolean }): { providers: RuntimeProviderState[] } => ({
  providers: [
    { id: 'demo', label: 'Simulation · no model call', boundary: 'Local task workspace', available: true, detail: 'Deterministic simulation for UI contracts only; never a provider or VM claim.', capabilities: ['streaming', 'file_system', 'preview_url'] },
    { id: 'claude_sdk', label: configuration.claudeTransport === 'litellm' ? 'Claude SDK · LiteLLM' : 'Claude SDK', boundary: 'Governed host workspace', available: configuration.claudeConfigured, detail: configuration.claudeConfigured ? `Native Claude Agent SDK using a server-side ${configuration.claudeTransport === 'litellm' ? 'LiteLLM gateway' : 'credential'}.` : 'Configure the protected LiteLLM gateway to enable this runtime.', capabilities: ['streaming', 'tool_use', 'file_system', 'preview_url'] },
    { id: 'onecomputer', label: 'ONEComputer', boundary: 'Conversation development sandbox', available: configuration.oneComputerConfigured && configuration.oneComputerReachable !== false, detail: !configuration.oneComputerConfigured ? 'Configure the ONEComputer service endpoint and server-only credentials.' : configuration.oneComputerReachable === false ? 'Configured provider is currently unreachable from the ONEVibe API.' : 'Authenticated retained sandbox runtime with one fenced lease per conversation.', capabilities: ['streaming', 'tool_use', 'file_system', 'sandboxed', 'preview_url', 'computer_use'] },
    { id: 'remote', label: 'Remote runtime', boundary: 'Remote governed runtime', available: configuration.remoteConfigured, detail: configuration.remoteConfigured ? 'Configured remote task runtime.' : 'Configure ONEVIBE_RUNTIME_URL to enable this provider.', capabilities: ['streaming', 'tool_use', 'file_system'] },
  ],
})
