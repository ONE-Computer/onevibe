export type OneComputerSandbox = {
  id: string
  name?: string
  state?: string
  provider?: string
  bootstrapped?: boolean
  desktopReady?: boolean
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

  async createSandbox(name: string, signal?: AbortSignal): Promise<OneComputerSandbox> {
    return this.request<OneComputerSandbox>('/v1/sandboxes', {
      method: 'POST',
      body: JSON.stringify({ name }),
      signal,
    })
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
