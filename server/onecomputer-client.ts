export type OneComputerSandbox = {
  id: string
  name?: string
  state?: string
  provider?: string
}

export type OneComputerClientOptions = {
  baseUrl: string
  serviceToken: string
  projectId?: string
  fetcher?: typeof fetch
}

export type OneComputerExecResult = { exitCode: number; output: string }
export type OneComputerVisualFrame = { png: Uint8Array; capturedAt?: string }

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
    return this.request<OneComputerSandbox>(`/v1/sandboxes/${encodeURIComponent(id)}`, { signal })
  }

  async triggerGovernedAction(id: string): Promise<{ approvalId: string; status: string }> {
    return this.request(`/v1/sandboxes/${encodeURIComponent(id)}/trigger-governed-action`, { method: 'POST' })
  }

  async exec(id: string, command: string, signal?: AbortSignal): Promise<OneComputerExecResult> {
    return this.request(`/v1/sandboxes/${encodeURIComponent(id)}/exec`, { method: 'POST', body: JSON.stringify({ command }), signal })
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

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.options.serviceToken}`,
        ...(this.options.projectId ? { 'X-Project-Id': this.options.projectId } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(4 * 60_000)]) : AbortSignal.timeout(4 * 60_000),
    })
    if (!response.ok) {
      // Provider bodies can contain upstream topology, diagnostics, or reflected
      // secrets. They are deliberately not propagated into task evidence/logs.
      throw new OneComputerApiError(pathname, response.status)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}
