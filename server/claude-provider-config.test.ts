import { describe, expect, it } from 'vitest'
import { claudeProviderConfig } from './claude-provider-config.js'

describe('Claude provider configuration', () => {
  it('routes Claude through LiteLLM without changing the parent environment', () => {
    const env = {
      ONEVIBE_LITELLM_URL: 'http://127.0.0.1:4000/',
      ONEVIBE_LITELLM_API_KEY: 'server-only-key',
      ONEVIBE_LITELLM_MODEL: 'claude-sonnet-5',
    }
    const config = claudeProviderConfig(env)
    expect(config).toMatchObject({ configured: true, transport: 'litellm', model: 'claude-sonnet-5' })
    expect(config.childEnv).toMatchObject({ ANTHROPIC_BASE_URL: 'http://127.0.0.1:4000', ANTHROPIC_API_KEY: 'server-only-key' })
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY')
  })

  it('supports direct Anthropic configuration as a fallback', () => {
    expect(claudeProviderConfig({ ANTHROPIC_API_KEY: 'direct-key', ONEVIBE_CLAUDE_MODEL: 'claude-test' })).toMatchObject({
      configured: true, transport: 'anthropic', model: 'claude-test',
    })
  })

  it('requires both LiteLLM endpoint and credential', () => {
    expect(claudeProviderConfig({ ONEVIBE_LITELLM_URL: 'http://127.0.0.1:4000' })).toMatchObject({ configured: false, transport: 'unconfigured' })
  })
})
