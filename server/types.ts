export type RunStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_user_input'
  | 'completed'
  | 'failed'
  | 'cancelled'

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

export type EventLane = 'transcript' | 'activity' | 'control' | 'artifact' | 'approval'
export type PresentationPanel = 'terminal' | 'screenshot' | 'preview' | 'file' | 'diff' | 'slide' | 'approval'
export type PresentationDescriptor = { panel: PresentationPanel; uri?: string; artifactPath?: string }

export type EventType =
  | 'run_started'
  | 'run_status_changed'
  | 'user_message'
  | 'assistant_text_delta'
  | 'activity_delta'
  | 'tool_call_started'
  | 'tool_call_progress'
  | 'tool_call_completed'
  | 'approval_requested'
  | 'approval_resolved'
  | 'user_input_requested'
  | 'user_input_resolved'
  | 'guidance_queued'
  | 'guidance_cancelled'
  | 'guidance_applied'
  | 'artifact_created'
  | 'artifact_updated'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled'

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'blocked'
export type TaskMode = 'chat' | 'general' | 'website' | 'slides' | 'document' | 'research' | 'data' | 'design' | 'app' | 'game'
export type TaskSkill = 'research' | 'web_build' | 'slides' | 'data_analysis' | 'document' | 'product_design' | 'security_review' | 'browser_testing'

export type Project = {
  id: string
  name: string
  context: string
  files: ProjectFile[]
  fileVersions?: Record<string, ProjectFileVersion[]>
  createdAt: string
  updatedAt: string
}

export type ProjectFile = { name: string; path: string; size: number; mimeType: string; createdAt: string }
export type ProjectFileVersion = { id: string; path: string; createdAt: string; size: number; contentHash: string }

export type TaskSchedule = {
  id: string
  name: string
  prompt: string
  provider: Task['provider']
  mode: TaskMode
  projectId: string
  intervalMinutes: number
  enabled: boolean
  nextRunAt: string
  lastRunAt?: string
  createdAt: string
  updatedAt: string
}

export type PlanStep = {
  id: string
  title: string
  status: PlanStepStatus
  startedAt?: string
  completedAt?: string
}

export type RuntimeEvent = {
  id: string
  taskId: string
  runId?: string
  sequence: number
  type: EventType
  lane: EventLane
  status?: RunStatus
  label?: string
  content?: string
  payload: Record<string, unknown>
  createdAt: string
  previousHash: string
  eventHash: string
}

export type WorkspaceFile = {
  path: string
  size: number
  updatedAt: string
}

export type TaskAttachment = { name: string; path: string; size: number; mimeType: string }

export type WorkspaceVersion = {
  id: string
  taskId: string
  label: string
  createdAt: string
  fileCount: number
  evidenceHash: string
}

export type WorkspaceVersionComparison = {
  version: WorkspaceVersion
  comparedAt: string
  summary: { added: number; changed: number; removed: number }
  changes: Array<{ path: string; status: 'added' | 'changed' | 'removed'; beforeSize?: number; afterSize?: number; beforeHash?: string; afterHash?: string }>
  truncated: boolean
}

export type ChatMessage = {
  id: string
  taskId: string
  turnId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: 'streaming' | 'completed' | 'failed' | 'cancelled'
  provider?: Task['provider']
  createdAt: string
  updatedAt: string
}

export type Task = {
  id: string
  title: string
  prompt: string
  provider: 'demo' | 'claude_sdk' | 'onecomputer' | 'remote'
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
    runtimeSessionLeaseId?: string
    runtimeSessionLeaseGeneration?: number
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
  inputRequest?: {
    id: string
    prompt: string
    options: string[]
    createdAt: string
  }
  share?: { id: string; createdAt: string; approvalId: string }
}

export type TaskSnapshot = Task & {
  events: RuntimeEvent[]
  files: WorkspaceFile[]
  messages: ChatMessage[]
}

export type EventInput = Omit<RuntimeEvent, 'id' | 'taskId' | 'runId' | 'sequence' | 'createdAt' | 'previousHash' | 'eventHash'>
