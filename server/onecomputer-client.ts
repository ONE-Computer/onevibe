export type OneComputerSandbox = {
  id: string
  name?: string
  state?: string
  provider?: string
  bootstrapped?: boolean
  desktopReady?: boolean
  allocationOperationId?: string
  allocationIdempotencyKey?: string
  metadata?: Record<string, string>
}

export type OneComputerSandboxAllocation = {
  allocationOperationId: string
  allocationIdempotencyKey: string
}

export type OneComputerAllocationOperation = {
  operationId: string
  idempotencyKey: string
  status: 'pending' | 'completed' | 'unknown'
  sandboxId?: string
  provider?: string
  errorCode?: string
  createdAt?: string
  updatedAt?: string
}

export type OneComputerClientOptions = {
  baseUrl: string
  serviceToken: string
  projectId?: string
  fetcher?: typeof fetch
}

export type OneComputerExecResult = { exitCode: number; output: string }
export type OneComputerVisualFrame = { png: Uint8Array; capturedAt?: string }

const SANDBOX_STATUS_POLL_TIMEOUT_MS = 15_000
const SANDBOX_EXEC_TIMEOUT_MS = 30_000

export class OneComputerApiError extends Error {
  constructor(readonly operation: string, readonly status: number) {
    super(`ONEComputer ${operation} returned HTTP ${status}`)
    this.name = 'OneComputerApiError'
  }
}

export class OneComputerClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(private readonly options: OneComputerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetcher = options.fetcher ?? fetch
  }

  async createSandbox(name: string, allocationOrSignal?: OneComputerSandboxAllocation | AbortSignal, signal?: AbortSignal): Promise<OneComputerSandbox> {
    const allocation = allocationOrSignal instanceof AbortSignal ? undefined : allocationOrSignal
    const requestSignal = allocationOrSignal instanceof AbortSignal ? allocationOrSignal : signal
    const result = await this.request<OneComputerSandbox | OneComputerAllocationOperation>('/v1/sandboxes', {
      method: 'POST',
      body: JSON.stringify({ name }),
      headers: allocation ? {
        'Idempotency-Key': allocation.allocationIdempotencyKey,
        'X-Allocation-Operation-Id': allocation.allocationOperationId,
      } : undefined,
      signal: requestSignal,
    })
    if ('id' in result && typeof result.id === 'string') return result as OneComputerSandbox
    return this.waitForSandboxOperation(result as OneComputerAllocationOperation, requestSignal)
  }

  async health(signal?: AbortSignal): Promise<{ status?: string; version?: string }> {
    const response = await this.fetcher(`${this.baseUrl}/v1/health`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${this.options.serviceToken}`, ...(this.options.projectId ? { 'X-Project-Id': this.options.projectId } : {}) },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`ONEComputer health returned HTTP ${response.status}`)
    const body = await response.json().catch(() => ({})) as { status?: unknown; version?: unknown }
    return { status: typeof body.status === 'string' ? body.status : undefined, version: typeof body.version === 'string' ? body.version : undefined }
  }

  async getSandbox(id: string, signal?: AbortSignal): Promise<OneComputerSandbox> {
    const pollTimeout = AbortSignal.timeout(SANDBOX_STATUS_POLL_TIMEOUT_MS)
    return this.request<OneComputerSandbox>(`/v1/sandboxes/${encodeURIComponent(id)}`, {
      signal: signal ? AbortSignal.any([signal, pollTimeout]) : pollTimeout,
    })
  }

  async listSandboxes(signal?: AbortSignal): Promise<OneComputerSandbox[]> {
    return this.request<OneComputerSandbox[]>('/v1/sandboxes', { signal })
  }

  async getSandboxOperation(id: string, signal?: AbortSignal): Promise<OneComputerAllocationOperation> {
    return this.request<OneComputerAllocationOperation>(`/v1/sandbox-operations/${encodeURIComponent(id)}`, { signal })
  }

  private async waitForSandboxOperation(operation: OneComputerAllocationOperation, signal?: AbortSignal): Promise<OneComputerSandbox> {
    const deadline = Date.now() + SANDBOX_STATUS_POLL_TIMEOUT_MS
    let current = operation
    while (Date.now() < deadline) {
      if (current.status === 'completed' && current.sandboxId) return this.getSandbox(current.sandboxId, signal)
      if (current.status === 'unknown') throw new Error(`ONEComputer allocation operation ${current.operationId} has an unknown outcome`)
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, 250)
        signal?.addEventListener('abort', () => { clearTimeout(timeout); reject(signal.reason) }, { once: true })
      })
      current = await this.getSandboxOperation(current.operationId, signal)
    }
    throw new Error(`ONEComputer allocation operation ${current.operationId} did not complete within ${SANDBOX_STATUS_POLL_TIMEOUT_MS}ms`)
  }

  async triggerGovernedAction(id: string): Promise<{ approvalId: string; status: string }> {
    return this.request(`/v1/sandboxes/${encodeURIComponent(id)}/trigger-governed-action`, { method: 'POST' })
  }

  async exec(id: string, command: string, signal?: AbortSignal): Promise<OneComputerExecResult> {
    return this.request(`/v1/sandboxes/${encodeURIComponent(id)}/exec`, { method: 'POST', body: JSON.stringify({ command }), signal }, SANDBOX_EXEC_TIMEOUT_MS)
  }

  async deleteSandbox(id: string): Promise<void> {
    await this.request<void>(`/v1/sandboxes/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async startVisualRuntime(id: string, signal?: AbortSignal): Promise<{ display: string; width: number; height: number; browserReady: boolean }> {
    return this.request(`/v1/sandboxes/${encodeURIComponent(id)}/visual/start`, { method: 'POST', signal })
  }

  async getVisualScreenshot(id: string, signal?: AbortSignal): Promise<OneComputerVisualFrame> {
    const response = await this.fetcher(`${this.baseUrl}/v1/sandboxes/${encodeURIComponent(id)}/visual/screenshot`, {
      headers: { Accept: 'image/png', Authorization: `Bearer ${this.options.serviceToken}`, ...(this.options.projectId ? { 'X-Project-Id': this.options.projectId } : {}) },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new Error(`ONEComputer visual screenshot returned HTTP ${response.status}`)
    return { png: new Uint8Array(await response.arrayBuffer()), capturedAt: response.headers.get('X-OneComputer-Captured-At') || undefined }
  }

  private async request<T>(pathname: string, init: RequestInit = {}, timeoutMs = 4 * 60_000): Promise<T> {
    const timeoutController = new AbortController()
    const requestSignal = init.signal ? AbortSignal.any([init.signal, timeoutController.signal]) : timeoutController.signal
    let rejectTimeout: ((reason?: unknown) => void) | undefined
    const timeoutPromise = new Promise<never>((_, reject) => { rejectTimeout = reject })
    const timeout = setTimeout(() => {
      timeoutController.abort()
      rejectTimeout?.(new Error(`ONEComputer ${pathname} request timed out`))
    }, timeoutMs)
    try {
      const response = await Promise.race([
        this.fetcher(`${this.baseUrl}${pathname}`, {
          ...init,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.options.serviceToken}`,
            ...(this.options.projectId ? { 'X-Project-Id': this.options.projectId } : {}),
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
          },
          signal: requestSignal,
        }),
        timeoutPromise,
      ])
      if (!response.ok) {
        // Provider bodies can contain upstream topology, diagnostics, or reflected
        // secrets. They are deliberately not propagated into task evidence/logs.
        throw new OneComputerApiError(pathname, response.status)
      }
      if (response.status === 204) return undefined as T
      return await Promise.race([response.json() as Promise<T>, timeoutPromise])
    } finally {
      clearTimeout(timeout)
    }
  }
}
