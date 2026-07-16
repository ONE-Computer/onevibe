export type ClaudeProviderConfig = {
  configured: boolean
  transport: 'litellm' | 'unconfigured'
  model: string
  childEnv: NodeJS.ProcessEnv
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

/**
 * A relay variable is not permission to call a provider directly. Keep the
 * first-party endpoint check here so every Claude-compatible child process —
 * including the ONEComputer worker — shares the same fail-closed boundary.
 */
export const isLiteLlmRelayUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase()
    return hostname !== 'api.anthropic.com' && !hostname.endsWith('.anthropic.com')
  } catch {
    return false
  }
}

const withoutUntrustedAnthropicRouting = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const { ANTHROPIC_API_KEY: _apiKey, ANTHROPIC_AUTH_TOKEN: _authToken, ANTHROPIC_BASE_URL: _baseUrl, ...safeEnv } = env
  return safeEnv
}

export const claudeProviderConfig = (env: NodeJS.ProcessEnv = process.env): ClaudeProviderConfig => {
  const model = env.ONEVIBE_LITELLM_MODEL ?? env.ONEVIBE_CLAUDE_MODEL ?? 'claude-sonnet-5'
  const litellmUrl = env.ONEVIBE_LITELLM_URL?.trim()
  const litellmKey = env.ONEVIBE_LITELLM_API_KEY?.trim()

  if (litellmUrl && litellmKey && isLiteLlmRelayUrl(litellmUrl)) {
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
