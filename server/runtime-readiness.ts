import type { Task } from './types.js'

export type RuntimeProviderState = {
  id: Task['provider']
  label: string
  boundary: string
  available: boolean
  detail: string
}

export const runtimeReadiness = (configuration: { claudeConfigured: boolean; claudeTransport?: 'anthropic' | 'litellm' | 'unconfigured'; remoteConfigured: boolean; oneComputerConfigured: boolean; oneComputerReachable?: boolean }): { providers: RuntimeProviderState[] } => ({
  providers: [
    { id: 'demo', label: 'Safe demo', boundary: 'Local task workspace', available: true, detail: 'Deterministic UX and evidence contract; not VM isolation.' },
    { id: 'claude_sdk', label: configuration.claudeTransport === 'litellm' ? 'Claude SDK · LiteLLM' : 'Claude SDK', boundary: 'Governed host workspace', available: configuration.claudeConfigured, detail: configuration.claudeConfigured ? `Native Claude Agent SDK using a server-side ${configuration.claudeTransport === 'litellm' ? 'LiteLLM gateway' : 'credential'}.` : 'Configure a server-only Anthropic credential or LiteLLM gateway to enable this runtime.' },
    { id: 'onecomputer', label: 'ONEComputer', boundary: 'Conversation development sandbox', available: configuration.oneComputerConfigured && configuration.oneComputerReachable !== false, detail: !configuration.oneComputerConfigured ? 'Configure the ONEComputer service endpoint and server-only credentials.' : configuration.oneComputerReachable === false ? 'Configured provider is currently unreachable from the ONEVibe API.' : 'Authenticated retained sandbox runtime with one fenced lease per conversation.' },
    { id: 'remote', label: 'Remote runtime', boundary: 'Remote governed runtime', available: configuration.remoteConfigured, detail: configuration.remoteConfigured ? 'Configured remote task runtime.' : 'Configure ONEVIBE_RUNTIME_URL to enable this provider.' },
  ],
})
