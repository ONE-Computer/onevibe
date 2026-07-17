// Display metadata for models registered on the server-controlled LiteLLM relay.
// The relay remains the only inference boundary; this module only decorates
// the relay's model list for the composer model picker.

export type ModelInfo = {
  id: string
  label: string
  provider: string
  contextK: number | null
  tags: string[]
}

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-opus-4-6': 'Claude Opus 4',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'kimi-k3': 'Kimi K3 (Reasoning)',
  'kimi-k2.7-code': 'Kimi K2.7 Code',
  'kimi': 'Kimi',
}

const MODEL_CONTEXT: Record<string, number> = {
  'claude-sonnet-5': 1000,
  'claude-opus-4-6': 1000,
  'claude-haiku-4-5': 1000,
  'kimi-k3': 131,
  'kimi-k2.7-code': 262,
}

const MODEL_TAGS: Record<string, string[]> = {
  'claude-sonnet-5': ['fast', 'smart', 'recommended'],
  'claude-opus-4-6': ['most capable', 'slow'],
  'claude-haiku-4-5': ['fastest', 'cheap'],
  'kimi-k3': ['reasoning', 'coding'],
  'kimi-k2.7-code': ['coding', 'fast'],
}

export const providerFromId = (id: string): string => {
  if (id.startsWith('claude')) return 'Anthropic'
  if (id.startsWith('kimi')) return 'Moonshot'
  if (id.startsWith('gpt')) return 'OpenAI'
  if (id.startsWith('gemini')) return 'Google'
  return 'Other'
}

export const describeModel = (id: string): ModelInfo => ({
  id,
  label: MODEL_LABELS[id] ?? id,
  provider: providerFromId(id),
  contextK: MODEL_CONTEXT[id] ?? null,
  tags: MODEL_TAGS[id] ?? [],
})
