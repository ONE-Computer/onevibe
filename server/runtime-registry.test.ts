import { describe, expect, it } from 'vitest'
import type { RuntimeAdapter } from './runtime-adapter.js'
import type { RuntimeCapability } from './types.js'
import { runtimeReadiness } from './runtime-readiness.js'
import { RuntimeRegistry } from './runtime-registry.js'

const adapter = {} as RuntimeAdapter
const healthyAdapter = { health: async () => ({ status: 'online' as const, detail: 'test probe' }), destroy: async () => undefined } as RuntimeAdapter

describe('RuntimeRegistry', () => {
  it('ranks a governed runtime above simulation for compatible work', () => {
    const states = runtimeReadiness({ claudeConfigured: true, claudeTransport: 'litellm', remoteConfigured: false, oneComputerConfigured: false }).providers
    const registry = new RuntimeRegistry({ factories: { demo: () => adapter, claude_sdk: () => adapter } })
    const suggestions = registry.suggest('document', states)

    expect(suggestions[0]).toMatchObject({ id: 'claude_sdk', available: true, compatible: true })
    expect(suggestions.find((candidate) => candidate.id === 'demo')).toMatchObject({ available: true, compatible: true })
    expect(registry.defaultProvider('chat', states)).toBe('claude_sdk')
  })

  it('honors an available operator default but fails over to a compatible provider when unavailable', () => {
    const states = runtimeReadiness({ claudeConfigured: true, claudeTransport: 'litellm', remoteConfigured: false, oneComputerConfigured: true, oneComputerReachable: true }).providers
    const requested = new RuntimeRegistry({ defaultProvider: 'onecomputer', factories: { demo: () => adapter, claude_sdk: () => adapter, onecomputer: () => adapter } })
    expect(requested.defaultProvider('website', states)).toBe('onecomputer')

    const unavailable = new RuntimeRegistry({ defaultProvider: 'remote', factories: { demo: () => adapter, claude_sdk: () => adapter } })
    expect(unavailable.defaultProvider('website', states)).toBe('onecomputer')
  })

  it('explains missing capabilities and exposes a complete readiness snapshot', () => {
    const states = runtimeReadiness({ claudeConfigured: false, remoteConfigured: false, oneComputerConfigured: true, oneComputerReachable: true }).providers.map((state) => state.id === 'remote' ? { ...state, available: true, capabilities: ['streaming'] as RuntimeCapability[] } : state)
    const registry = new RuntimeRegistry({ factories: { demo: () => adapter, onecomputer: () => adapter } })
    const suggestion = registry.suggest('website', states)
    expect(suggestion.find((candidate) => candidate.id === 'remote')).toMatchObject({ compatible: false, reason: expect.stringMatching(/Missing capability/) })
    expect(registry.suggest('website', states).find((candidate) => candidate.id === 'onecomputer')).toMatchObject({ compatible: true, available: true })
    const snapshot = registry.snapshot(states)
    expect(snapshot.defaultProvider).toBe('onecomputer')
    expect(snapshot.suggestions.document?.[0]?.id).toBe('onecomputer')
    expect(snapshot.suggestions.chat?.some((candidate) => candidate.reason.length > 0)).toBe(true)
  })

  it('runs a provider-owned health probe without exposing provider details', async () => {
    const states = runtimeReadiness({ claudeConfigured: true, claudeTransport: 'litellm', remoteConfigured: false, oneComputerConfigured: false }).providers
    const registry = new RuntimeRegistry({ factories: { claude_sdk: () => healthyAdapter } })
    await expect(registry.test('claude_sdk', states)).resolves.toMatchObject({ status: 'online', detail: 'test probe' })
    await expect(registry.test('remote', states)).resolves.toMatchObject({ status: 'not_configured' })
  })
})
