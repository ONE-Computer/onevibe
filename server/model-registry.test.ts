import { describe, expect, it } from 'vitest'
import { describeModel, providerFromId } from './model-registry.js'

describe('model registry display metadata', () => {
  it('decorates known LiteLLM aliases with label, provider, context, and tags', () => {
    expect(describeModel('claude-sonnet-5')).toEqual({
      id: 'claude-sonnet-5',
      label: 'Claude Sonnet 5',
      provider: 'Anthropic',
      contextK: 1000,
      tags: ['fast', 'smart', 'recommended'],
    })
    expect(describeModel('kimi-k3')).toEqual({
      id: 'kimi-k3',
      label: 'Kimi K3 (Reasoning)',
      provider: 'Moonshot',
      contextK: 131,
      tags: ['reasoning', 'coding'],
    })
  })

  it('falls back to the raw id for unknown models', () => {
    expect(describeModel('deepseek-v4-flash')).toEqual({
      id: 'deepseek-v4-flash',
      label: 'deepseek-v4-flash',
      provider: 'Other',
      contextK: null,
      tags: [],
    })
  })

  it('derives the provider badge from the model id prefix', () => {
    expect(providerFromId('claude-opus-4-6')).toBe('Anthropic')
    expect(providerFromId('kimi-k2.7-code')).toBe('Moonshot')
    expect(providerFromId('gpt-5.2')).toBe('OpenAI')
    expect(providerFromId('gemini-3-pro')).toBe('Google')
    expect(providerFromId('deepseek-v4-flash')).toBe('Other')
  })
})
