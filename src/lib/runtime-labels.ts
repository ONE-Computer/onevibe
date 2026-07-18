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

const STEP_LABEL_MAP: Record<string, string> = {
  bash: 'Running command',
  shell: 'Running command',
  run_command: 'Running command',
  execute: 'Running command',
  file_read: 'Reading file',
  read_file: 'Reading file',
  read: 'Reading file',
  file_write: 'Writing file',
  write_file: 'Writing file',
  write: 'Writing file',
  create_file: 'Writing file',
  edit_file: 'Editing file',
  web_search: 'Searching the web',
  search: 'Searching the web',
  tavily_search: 'Searching the web',
  browser: 'Browsing page',
  screenshot: 'Browsing page',
  computer_use: 'Browsing page',
  navigate: 'Browsing page',
  click: 'Browsing page',
  think: 'Thinking',
  thinking: 'Thinking',
  reasoning: 'Thinking',
  list_files: 'Listing files',
  list_directory: 'Listing files',
  grep: 'Searching files',
  find: 'Searching files',
  code_search: 'Searching files',
  run_tests: 'Running tests',
  test: 'Running tests',
  git_commit: 'Committing changes',
  git: 'Running git',
}

export const stepLabel = (toolName: string): string =>
  STEP_LABEL_MAP[toolName.toLowerCase()] ?? STEP_LABEL_MAP[toolName.toLowerCase().split('_')[0] ?? ''] ?? 'Working'
