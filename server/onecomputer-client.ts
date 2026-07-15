export type OneComputerSandbox = {
  id: string
  name?: string
  state?: string
  provider?: string
}

export type OneComputerClientOptions = {
  baseUrl: string
  serviceToken: string
  fetcher?: typeof fetch
}

export type OneComputerExecResult = { exitCode: number; output: string }

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

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.options.serviceToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(4 * 60_000)]) : AbortSignal.timeout(4 * 60_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`ONEComputer ${pathname} returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}
