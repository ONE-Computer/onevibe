import type { ClaudeProviderConfig } from './claude-provider-config.js'

export const DEFAULT_LITELLM_MAX_TURNS = 12
export const DEFAULT_LITELLM_MAX_BUDGET_USD = 2
export const DEFAULT_ANTHROPIC_MAX_TURNS = 24
export const DEFAULT_ANTHROPIC_MAX_BUDGET_USD = 5
const MAX_TURNS = 100
const MAX_BUDGET_USD = 100

export type ClaudeRunLimits = { maxTurns: number; maxBudgetUsd: number }

const positiveInteger = (value: string | undefined, fallback: number) => {
  if (!value?.trim() || !/^\d+$/.test(value.trim())) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_TURNS) : fallback
}

const positiveBudget = (value: string | undefined, fallback: number) => {
  if (!value?.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim())) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_BUDGET_USD) : fallback
}

export const resolveClaudeRunLimits = (transport: ClaudeProviderConfig['transport'], env: NodeJS.ProcessEnv = process.env): ClaudeRunLimits => {
  const defaults = transport === 'litellm'
    ? { maxTurns: DEFAULT_LITELLM_MAX_TURNS, maxBudgetUsd: DEFAULT_LITELLM_MAX_BUDGET_USD }
    : { maxTurns: DEFAULT_ANTHROPIC_MAX_TURNS, maxBudgetUsd: DEFAULT_ANTHROPIC_MAX_BUDGET_USD }
  return {
    maxTurns: positiveInteger(env.ONEVIBE_CLAUDE_MAX_TURNS, defaults.maxTurns),
    maxBudgetUsd: positiveBudget(env.ONEVIBE_CLAUDE_MAX_BUDGET_USD, defaults.maxBudgetUsd),
  }
}
