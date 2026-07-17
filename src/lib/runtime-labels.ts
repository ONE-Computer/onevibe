import type { RunStatus, Task } from '../types'

const labels: Record<Task['provider'], string> = {
  demo: 'Safe demo',
  claude_sdk: 'Claude Agent SDK · LiteLLM',
  codex: 'Codex-compatible · LiteLLM',
  agentcore: 'AWS AgentCore · LiteLLM route',
  onecomputer: 'ONEComputer sandbox',
  remote: 'Remote runtime',
  a2a: 'A2A Agent',
  kimi: 'Kimi Code CLI',
}

export const providerLabel = (provider: Task['provider']) => labels[provider]

const statusLabels: Record<RunStatus, string> = {
  pending: 'Queued',
  running: 'Running',
  waiting_for_approval: 'Awaiting wallet approval',
  waiting_for_user_input: 'Awaiting your input',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const statusLabel = (status: RunStatus) => statusLabels[status]
export const tokenLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
