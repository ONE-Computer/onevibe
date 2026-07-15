export type RunStatus = 'pending' | 'running' | 'waiting_for_approval' | 'waiting_for_user_input' | 'completed' | 'failed' | 'cancelled'
export type TaskMode = 'general' | 'website' | 'slides' | 'research' | 'design' | 'app' | 'game'
export type EventLane = 'transcript' | 'activity' | 'control' | 'artifact' | 'approval'

export type RuntimeEvent = {
  id: string
  taskId: string
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

export type PlanStep = { id: string; title: string; status: 'pending' | 'running' | 'completed' | 'blocked' }
export type WorkspaceFile = { path: string; size: number; updatedAt: string }
export type WorkspaceVersion = { id: string; taskId: string; label: string; createdAt: string; fileCount: number; evidenceHash: string }

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
  }
  approval?: {
    id: string
    action: string
    state: 'pending' | 'approved' | 'denied' | 'expired'
    walletUrl: string
    expiresAt: string
    receipt?: { decision: 'approved' | 'denied'; signer: string; decidedAt: string; signature: string }
  }
  inputRequest?: { id: string; prompt: string; options: string[]; createdAt: string }
  share?: { id: string; createdAt: string; approvalId: string }
}

export type TaskSnapshot = Task & { events: RuntimeEvent[]; files: WorkspaceFile[] }
