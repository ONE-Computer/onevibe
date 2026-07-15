export type ClaudeProviderConfig = {
  configured: boolean
  transport: 'anthropic' | 'litellm' | 'unconfigured'
  model: string
  childEnv: NodeJS.ProcessEnv
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '')

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
        ...env,
        ANTHROPIC_BASE_URL: trimTrailingSlash(litellmUrl),
        ANTHROPIC_API_KEY: litellmKey,
      },
    }
  }

  if (env.ANTHROPIC_API_KEY) {
    return { configured: true, transport: 'anthropic', model, childEnv: { ...env } }
  }

  return { configured: false, transport: 'unconfigured', model, childEnv: { ...env } }
}

export const claudeConfigurationMessage = 'Configure a server-only Anthropic credential or ONEVIBE_LITELLM_URL and ONEVIBE_LITELLM_API_KEY.'
