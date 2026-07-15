import { describe, expect, it } from 'vitest'
import { runtimeReadiness } from './runtime-readiness.js'

describe('runtime readiness', () => {
  it('never presents unconfigured remote or sandbox runtimes as available', () => {
    const states = runtimeReadiness({ claudeConfigured: false, remoteConfigured: false, oneComputerConfigured: false }).providers
    expect(states.find((state) => state.id === 'demo')?.available).toBe(true)
    expect(states.find((state) => state.id === 'claude_sdk')).toMatchObject({ available: false, detail: expect.stringMatching(/server-only/i) })
    expect(states.find((state) => state.id === 'onecomputer')?.available).toBe(false)
    expect(states.find((state) => state.id === 'remote')?.available).toBe(false)
  })

  it('reports configured boundaries without credential material', () => {
    const states = runtimeReadiness({ claudeConfigured: true, remoteConfigured: true, oneComputerConfigured: true }).providers
    expect(states.find((state) => state.id === 'claude_sdk')).toMatchObject({ available: true, boundary: 'Governed host workspace' })
    expect(states.find((state) => state.id === 'onecomputer')).toMatchObject({ available: true, boundary: 'Ephemeral sandbox' })
    expect(JSON.stringify(states)).not.toMatch(/token|secret|api[_-]?key/i)
  })
})
