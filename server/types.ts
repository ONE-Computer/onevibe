export type RunStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_approval'
  | 'waiting_for_user_input'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type EventLane = 'transcript' | 'activity' | 'control' | 'artifact' | 'approval'

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
  | 'artifact_created'
  | 'artifact_updated'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled'

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'blocked'
export type TaskMode = 'general' | 'website' | 'slides' | 'research' | 'design' | 'app' | 'game'

export type PlanStep = {
  id: string
  title: string
  status: PlanStepStatus
}

export type RuntimeEvent = {
  id: string
  taskId: string
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

export type WorkspaceVersion = {
  id: string
  taskId: string
  label: string
  createdAt: string
  fileCount: number
  evidenceHash: string
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
  status: RunStatus
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
    state: 'pending' | 'approved' | 'denied' | 'expired'
    walletUrl: string
    expiresAt: string
    receipt?: { decision: 'approved' | 'denied'; signer: string; decidedAt: string; signature: string }
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

export type EventInput = Omit<RuntimeEvent, 'id' | 'taskId' | 'sequence' | 'createdAt' | 'previousHash' | 'eventHash'>
