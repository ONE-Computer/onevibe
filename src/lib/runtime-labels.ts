import type { Task } from '../types'

const labels: Record<Task['provider'], string> = {
  demo: 'Safe demo',
  claude_sdk: 'Claude Agent SDK · LiteLLM',
  codex: 'Codex-compatible · LiteLLM',
  onecomputer: 'ONEComputer sandbox',
  remote: 'Remote runtime',
}

export const providerLabel = (provider: Task['provider']) => labels[provider]
