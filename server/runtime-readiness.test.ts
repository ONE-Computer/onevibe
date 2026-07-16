import { describe, expect, it } from 'vitest'
import { runtimeReadiness } from './runtime-readiness.js'

describe('runtime readiness', () => {
  it('never presents unconfigured remote or sandbox runtimes as available', () => {
    const states = runtimeReadiness({ claudeConfigured: false, remoteConfigured: false, oneComputerConfigured: false }).providers
    expect(states.find((state) => state.id === 'demo')?.available).toBe(true)
    expect(states.find((state) => state.id === 'claude_sdk')).toMatchObject({ available: false, detail: expect.stringMatching(/LiteLLM/i) })
    expect(states.find((state) => state.id === 'onecomputer')?.available).toBe(false)
    expect(states.find((state) => state.id === 'remote')?.available).toBe(false)
  })

  it('reports configured boundaries without credential material', () => {
    const states = runtimeReadiness({ claudeConfigured: true, claudeTransport: 'litellm', remoteConfigured: true, oneComputerConfigured: true }).providers
    expect(states.find((state) => state.id === 'claude_sdk')).toMatchObject({ available: true, boundary: 'Governed host workspace' })
    expect(states.find((state) => state.id === 'onecomputer')).toMatchObject({ available: true, boundary: 'Conversation development sandbox' })
    expect(states.find((state) => state.id === 'claude_sdk')?.capabilities).toEqual(expect.arrayContaining(['streaming', 'tool_use', 'file_system']))
    expect(states.find((state) => state.id === 'claude_sdk')?.capabilities).not.toContain('computer_use')
    expect(states.find((state) => state.id === 'onecomputer')?.capabilities).toEqual(expect.arrayContaining(['sandboxed', 'computer_use']))
    expect(JSON.stringify(states)).not.toMatch(/token|secret|api[_-]?key/i)
  })

  it('does not present an unreachable configured sandbox as available', () => {
    const state = runtimeReadiness({ claudeConfigured: false, remoteConfigured: false, oneComputerConfigured: true, oneComputerReachable: false }).providers.find((provider) => provider.id === 'onecomputer')
    expect(state).toMatchObject({ available: false, detail: expect.stringMatching(/unreachable/i) })
  })

  it('identifies LiteLLM without exposing endpoint or credentials', () => {
    const state = runtimeReadiness({ claudeConfigured: true, claudeTransport: 'litellm', remoteConfigured: false, oneComputerConfigured: false }).providers.find((provider) => provider.id === 'claude_sdk')
    expect(state).toMatchObject({ available: true, label: 'Claude SDK · LiteLLM', detail: expect.stringMatching(/LiteLLM gateway/) })
    expect(JSON.stringify(state)).not.toMatch(/127\.0\.0\.1|credential.*value/i)
  })

  it('exposes the Codex-compatible LiteLLM route only when the relay is configured', () => {
    const unavailable = runtimeReadiness({ claudeConfigured: false, remoteConfigured: false, oneComputerConfigured: false }).providers.find((provider) => provider.id === 'codex')
    expect(unavailable).toMatchObject({ available: false, detail: expect.stringMatching(/LiteLLM/i) })
    const available = runtimeReadiness({ claudeConfigured: true, claudeTransport: 'litellm', codexConfigured: true, remoteConfigured: false, oneComputerConfigured: false }).providers.find((provider) => provider.id === 'codex')
    expect(available).toMatchObject({ available: true, label: expect.stringMatching(/Codex.*LiteLLM/), capabilities: expect.arrayContaining(['tool_use', 'file_system']) })
  })
})
