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

export class OneComputerClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof fetch

  constructor(private readonly options: OneComputerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetcher = options.fetcher ?? fetch
  }

  async createSandbox(name: string): Promise<OneComputerSandbox> {
    return this.request<OneComputerSandbox>('/v1/sandboxes', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  async getSandbox(id: string): Promise<OneComputerSandbox> {
    return this.request<OneComputerSandbox>(`/v1/sandboxes/${encodeURIComponent(id)}`)
  }

  async triggerGovernedAction(id: string): Promise<{ approvalId: string; status: string }> {
    return this.request(`/v1/sandboxes/${encodeURIComponent(id)}/trigger-governed-action`, { method: 'POST' })
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
      signal: AbortSignal.timeout(4 * 60_000),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`ONEComputer ${pathname} returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
    }
    return response.json() as Promise<T>
  }
}
