export type RunStatus = 'pending' | 'running' | 'waiting_for_approval' | 'waiting_for_user_input' | 'completed' | 'failed' | 'cancelled'
export type TaskMode = 'chat' | 'general' | 'website' | 'slides' | 'document' | 'research' | 'data' | 'design' | 'app' | 'game'
export type TaskSkill = 'research' | 'web_build' | 'slides' | 'data_analysis' | 'document' | 'product_design' | 'security_review' | 'browser_testing'
export type RuntimeCapability = 'streaming' | 'tool_use' | 'file_system' | 'sandboxed' | 'preview_url' | 'computer_use' | 'fork'
export type PresentationPanel = 'terminal' | 'screenshot' | 'preview' | 'file' | 'diff' | 'slide' | 'approval'
export type PresentationDescriptor = { panel: PresentationPanel; uri?: string; artifactPath?: string }

export type ProjectFile = { name: string; path: string; size: number; mimeType: string; createdAt: string }
export type ProjectFileVersion = { id: string; path: string; createdAt: string; size: number; contentHash: string }
export type Project = { id: string; name: string; context: string; files: ProjectFile[]; fileVersions?: Record<string, ProjectFileVersion[]>; createdAt: string; updatedAt: string }
export type TaskSchedule = { id: string; name: string; prompt: string; provider: Task['provider']; mode: TaskMode; projectId: string; intervalMinutes: number; enabled: boolean; nextRunAt: string; lastRunAt?: string; createdAt: string; updatedAt: string }
export type EventLane = 'transcript' | 'activity' | 'control' | 'artifact' | 'approval'

export type RuntimeEvent = {
  id: string
  taskId: string
  runId?: string
  sequence: number
  type: string
  lane: EventLane
  status?: RunStatus
  label?: string
  content?: string
  payload: Record<string, unknown>
  createdAt: string
  previousHash: string
  eventHash: string
}

export type PlanStep = { id: string; title: string; status: 'pending' | 'running' | 'completed' | 'blocked'; startedAt?: string; completedAt?: string }
export type WorkspaceFile = { path: string; size: number; updatedAt: string }
export type LibraryItem = { task: Task; files: WorkspaceFile[] }
export type TaskAttachment = { name: string; path: string; size: number; mimeType: string }
export type WorkspaceVersion = { id: string; taskId: string; label: string; createdAt: string; fileCount: number; evidenceHash: string }
export type WorkspaceVersionComparison = { version: WorkspaceVersion; comparedAt: string; summary: { added: number; changed: number; removed: number }; changes: Array<{ path: string; status: 'added' | 'changed' | 'removed'; beforeSize?: number; afterSize?: number; beforeHash?: string; afterHash?: string }>; truncated: boolean }
export type ChatMessage = { id: string; taskId: string; turnId: string; role: 'user' | 'assistant' | 'system'; content: string; status: 'streaming' | 'completed' | 'failed' | 'cancelled'; provider?: Task['provider']; createdAt: string; updatedAt: string }

export type ConversationSummary = {
  id: string
  title: string
  status: RunStatus
  provider: Task['provider']
  mode: TaskMode
  projectId: string
  messageCount: number
  lastMessage?: { role: ChatMessage['role']; preview: string; status: ChatMessage['status']; createdAt: string }
  createdAt: string
  updatedAt: string
}

export type Task = {
  id: string
  title: string
  prompt: string
  provider: 'demo' | 'claude_sdk' | 'codex' | 'agentcore' | 'onecomputer' | 'remote'
  mode: TaskMode
  skills: TaskSkill[]
  tags: string[]
  queuedGuidance: Array<{ id: string; prompt: string; attachmentPaths: string[]; createdAt: string }>
  projectId: string
  scheduleId?: string
  references: string[]
  attachments: TaskAttachment[]
  status: RunStatus
  activeRunId?: string
  plan: PlanStep[]
  createdAt: string
  updatedAt: string
  previewPath?: string
  securityContext?: {
    mode: 'local_demo' | 'onecomputer'
    sandboxId?: string
    provider?: string
    gatewayEnforced: boolean
    runtimeSessionId?: string
    executionBoundary?: 'host_process' | 'onecomputer_sandbox' | 'remote_runtime'
    sandboxState?: string
    destroyedAt?: string
    visualRuntimeReady?: boolean
  }
  approval?: {
    id: string
    action: string
    intentHash?: string
    evidenceHash?: string
    state: 'pending' | 'approved' | 'denied' | 'expired'
    walletUrl: string
    expiresAt: string
    receipt?: { decision: 'approved' | 'denied'; signer: string; decidedAt: string; signature: string; intentHash?: string }
  }
  inputRequest?: { id: string; prompt: string; options: string[]; createdAt: string }
  share?: { id: string; createdAt: string; approvalId: string }
}

export type TaskSnapshot = Task & { events: RuntimeEvent[]; files: WorkspaceFile[]; messages: ChatMessage[] }
export type RuntimeProviderState = { id: Task['provider']; label: string; boundary: string; available: boolean; detail: string; capabilities: RuntimeCapability[]; healthStatus?: RuntimeHealth['status']; healthLatencyMs?: number; healthCheckedAt?: string }
export type RuntimeSuggestion = { id: Task['provider']; score: number; available: boolean; compatible: boolean; reason: string; capabilities: RuntimeCapability[] }
export type RuntimeReadiness = { providers: RuntimeProviderState[]; defaultProvider?: Task['provider']; suggestions?: Partial<Record<TaskMode, RuntimeSuggestion[]>> }
export type RuntimeHealth = { status: 'online' | 'offline' | 'not_configured' | 'unknown'; latencyMs?: number; detail: string }
