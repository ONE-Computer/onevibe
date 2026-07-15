import type { Task } from './types.js'

export type RuntimeProviderState = {
  id: Task['provider']
  label: string
  boundary: string
  available: boolean
  detail: string
}

export const runtimeReadiness = (configuration: { remoteConfigured: boolean; oneComputerConfigured: boolean }): { providers: RuntimeProviderState[] } => ({
  providers: [
    { id: 'demo', label: 'Safe demo', boundary: 'Local task workspace', available: true, detail: 'Deterministic UX and evidence contract; not VM isolation.' },
    { id: 'claude_sdk', label: 'Claude SDK', boundary: 'Governed host workspace', available: true, detail: 'Native Claude Agent SDK. Server-side Claude authentication is required at run time.' },
    { id: 'onecomputer', label: 'ONEComputer', boundary: 'Ephemeral sandbox', available: configuration.oneComputerConfigured, detail: configuration.oneComputerConfigured ? 'Authenticated sandbox runtime with evidence checkpoints.' : 'Configure the ONEComputer service endpoint and server-only credentials.' },
    { id: 'remote', label: 'Remote runtime', boundary: 'Remote governed runtime', available: configuration.remoteConfigured, detail: configuration.remoteConfigured ? 'Configured remote task runtime.' : 'Configure ONEVIBE_RUNTIME_URL to enable this provider.' },
  ],
})
