export type ClaudeProviderConfig = {
  configured: boolean
  transport: 'litellm' | 'unconfigured'
  model: string
  childEnv: NodeJS.ProcessEnv
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

const withoutUntrustedAnthropicRouting = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const { ANTHROPIC_API_KEY: _apiKey, ANTHROPIC_AUTH_TOKEN: _authToken, ANTHROPIC_BASE_URL: _baseUrl, ...safeEnv } = env
  return safeEnv
}

export const claudeProviderConfig = (env: NodeJS.ProcessEnv = process.env): ClaudeProviderConfig => {
  const model = env.ONEVIBE_LITELLM_MODEL ?? env.ONEVIBE_CLAUDE_MODEL ?? 'claude-sonnet-5'
  const litellmUrl = env.ONEVIBE_LITELLM_URL?.trim()
  const litellmKey = env.ONEVIBE_LITELLM_API_KEY?.trim()

  if (litellmUrl && litellmKey) {
    return {
      configured: true,
      transport: 'litellm',
      model,
      childEnv: {
        ...withoutUntrustedAnthropicRouting(env),
        ANTHROPIC_BASE_URL: trimTrailingSlash(litellmUrl),
        ANTHROPIC_API_KEY: litellmKey,
      },
    }
  }

  return { configured: false, transport: 'unconfigured', model, childEnv: withoutUntrustedAnthropicRouting(env) }
}

export const claudeConfigurationMessage = 'Configure the server-controlled ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY relay credentials.'
