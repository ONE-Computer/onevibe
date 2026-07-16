import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANTHROPIC_MAX_BUDGET_USD,
  DEFAULT_ANTHROPIC_MAX_TURNS,
  DEFAULT_LITELLM_MAX_BUDGET_USD,
  DEFAULT_LITELLM_MAX_TURNS,
  resolveClaudeRunLimits,
} from './claude-run-limits.js'

describe('Claude run limits', () => {
  it('uses bounded local LiteLLM defaults', () => {
    expect(resolveClaudeRunLimits('litellm', {})).toEqual({ maxTurns: DEFAULT_LITELLM_MAX_TURNS, maxBudgetUsd: DEFAULT_LITELLM_MAX_BUDGET_USD })
  })

  it('preserves the larger direct Anthropic defaults', () => {
    expect(resolveClaudeRunLimits('anthropic', {})).toEqual({ maxTurns: DEFAULT_ANTHROPIC_MAX_TURNS, maxBudgetUsd: DEFAULT_ANTHROPIC_MAX_BUDGET_USD })
  })

  it('accepts safe overrides and clamps oversized values', () => {
    expect(resolveClaudeRunLimits('litellm', { ONEVIBE_CLAUDE_MAX_TURNS: '18', ONEVIBE_CLAUDE_MAX_BUDGET_USD: '3.5' })).toEqual({ maxTurns: 18, maxBudgetUsd: 3.5 })
    expect(resolveClaudeRunLimits('litellm', { ONEVIBE_CLAUDE_MAX_TURNS: '999', ONEVIBE_CLAUDE_MAX_BUDGET_USD: '999' })).toEqual({ maxTurns: 100, maxBudgetUsd: 100 })
  })

  it('falls back on malformed or non-positive overrides', () => {
    expect(resolveClaudeRunLimits('litellm', { ONEVIBE_CLAUDE_MAX_TURNS: '0', ONEVIBE_CLAUDE_MAX_BUDGET_USD: '-1' })).toEqual({ maxTurns: DEFAULT_LITELLM_MAX_TURNS, maxBudgetUsd: DEFAULT_LITELLM_MAX_BUDGET_USD })
    expect(resolveClaudeRunLimits('litellm', { ONEVIBE_CLAUDE_MAX_TURNS: '1.5', ONEVIBE_CLAUDE_MAX_BUDGET_USD: 'NaN' })).toEqual({ maxTurns: DEFAULT_LITELLM_MAX_TURNS, maxBudgetUsd: DEFAULT_LITELLM_MAX_BUDGET_USD })
  })
})
