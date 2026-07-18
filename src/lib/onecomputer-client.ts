// Typed client for the ONEComputer ↔ ONEVibe middleware contract v1 (P11-11).
// Contract of record: docs/ONECOMPUTER-MIDDLEWARE-CONTRACT.md.
//
// Stub status: no `/onevibe/*` routes exist on ONEComputer yet — this module
// typechecks against the contract and is the seam the planned consumers
// (HomeConnectorGallery, ConnectorConsentDialog, TaskSandboxView,
// onecomputer-approval-relay, GovernanceFeed) will use once routes land.
//
// Security: the service token is a server-side credential. Browser callers
// must point `baseUrl` at the planned same-origin ONEVibe proxy
// (`server/onecomputer-bridge.ts`, not built) — never embed the token in
// browser state. The token is never logged or persisted by this module.

export const ONECOMPUTER_API_VERSION = '1'

export class OneComputerApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'OneComputerApiError'
    this.status = status
    this.code = code
  }
}

export interface OneComputerClientConfig {
  /** ONEComputer base URL (no trailing slash required), or the ONEVibe same-origin proxy path. */
  baseUrl: string
  /** ONEVibe service-account bearer token issued by ONEComputer. */
  serviceToken: string
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
}

// --- Endpoint 1: GET /onevibe/capabilities ---

export type SandboxBackendStatus = 'available' | 'degraded' | 'unavailable'

export interface OneComputerSandboxBackend {
  id: string
  name: string
  status: SandboxBackendStatus
}

export interface OneComputerConnector {
  id: string
  name: string
  category: string
  oauthReady: boolean
  vtiEnabled: boolean
}

export interface OneComputerCapabilities {
  version: string
  sandboxBackends: OneComputerSandboxBackend[]
  connectors: OneComputerConnector[]
  features: {
    vtiConsentGate: boolean
    approvalWebhook: boolean
  }
}

// --- Endpoint 2: POST /onevibe/connector/authorize ---

export interface AuthorizeConnectorRequest {
  connectorId: string
  userDid: string
  taskId: string
  requestedScopes: string[]
}

export interface ConnectorConsentPending {
  envelopeId: string
  consentUrl: string
  expiresAt: string
}

export interface ConnectorApproved {
  approved: true
  accessToken: string
}

export type AuthorizeConnectorResponse = ConnectorConsentPending | ConnectorApproved

export const isConnectorApproved = (response: AuthorizeConnectorResponse): response is ConnectorApproved =>
  'approved' in response && response.approved === true

// --- Endpoint 3: POST /onevibe/sandbox/run ---

export type SandboxBackendId = 'kasm' | 'daytona'

export interface RunSandboxRequest {
  backend: SandboxBackendId
  image?: string
  taskId: string
  agentDid: string
}

export interface RunSandboxResponse {
  sandboxId: string
  sessionUrl: string
  vncPort?: number
  expiresAt: string
}

// --- Endpoint 4: POST /onevibe/approval/webhook ---

export type ApprovalDecision = 'approve' | 'reject'

export interface ApprovalWebhookRequest {
  requestId: string
  taskId: string
  decision: ApprovalDecision
  actorDid: string
  reason?: string
}

export interface ApprovalWebhookResponse {
  received: true
}

// --- Endpoint 5: GET /onevibe/audit/stream (SSE) ---

export type OneComputerAuditEventType = 'connector_call' | 'approval_required' | 'sandbox_event' | 'vti_violation'

export interface OneComputerAuditEvent {
  /** Durable SSE `id:` field, usable as a `Last-Event-ID` resume cursor. Absent only on malformed frames. */
  id?: string
  type: OneComputerAuditEventType
  payload: Record<string, unknown>
}

interface ErrorBody {
  error?: string
  code?: string
}

const parseSseFrame = (frame: string): OneComputerAuditEvent | null => {
  let id: string | undefined
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue // SSE comment / heartbeat
    if (line.startsWith('id:')) id = line.slice(3).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  if (dataLines.length === 0) return null
  let parsed: { type?: unknown; payload?: unknown }
  try {
    parsed = JSON.parse(dataLines.join('\n')) as { type?: unknown; payload?: unknown }
  } catch {
    throw new OneComputerApiError('Malformed audit event frame', 200, 'stream_decode_error')
  }
  if (typeof parsed.type !== 'string') throw new OneComputerApiError('Malformed audit event frame', 200, 'stream_decode_error')
  return { id, type: parsed.type as OneComputerAuditEventType, payload: (parsed.payload ?? {}) as Record<string, unknown> }
}

export class OneComputerClient {
  private readonly baseUrl: string
  private readonly serviceToken: string
  private readonly fetchImpl: typeof fetch

  constructor(config: OneComputerClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.serviceToken = config.serviceToken
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async getCapabilities(signal?: AbortSignal): Promise<OneComputerCapabilities> {
    return this.request<OneComputerCapabilities>('GET', '/onevibe/capabilities', { signal })
  }

  async authorizeConnector(input: AuthorizeConnectorRequest, signal?: AbortSignal): Promise<AuthorizeConnectorResponse> {
    return this.request<AuthorizeConnectorResponse>('POST', '/onevibe/connector/authorize', { body: input, signal })
  }

  async runSandbox(input: RunSandboxRequest, signal?: AbortSignal): Promise<RunSandboxResponse> {
    return this.request<RunSandboxResponse>('POST', '/onevibe/sandbox/run', { body: input, signal })
  }

  async postApprovalDecision(input: ApprovalWebhookRequest, signal?: AbortSignal): Promise<ApprovalWebhookResponse> {
    return this.request<ApprovalWebhookResponse>('POST', '/onevibe/approval/webhook', { body: input, signal })
  }

  async *streamAuditEvents(options: { lastEventId?: string; signal?: AbortSignal } = {}): AsyncGenerator<OneComputerAuditEvent, void, unknown> {
    const response = await this.rawRequest('GET', '/onevibe/audit/stream', {
      Accept: 'text/event-stream',
      ...(options.lastEventId ? { 'Last-Event-ID': options.lastEventId } : {}),
    }, options.signal)
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as ErrorBody
      throw new OneComputerApiError(body.error ?? `Audit stream failed with HTTP ${response.status}`, response.status, body.code ?? 'http_error')
    }
    if (!response.body) throw new OneComputerApiError('Audit stream response has no body', response.status, 'stream_unavailable')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        for (const frame of frames) {
          const event = parseSseFrame(frame)
          if (event) yield event
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }

  private async request<TResponse>(method: string, path: string, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<TResponse> {
    const response = await this.rawRequest(method, path, options.body !== undefined ? { 'Content-Type': 'application/json' } : {}, options.signal, options.body)
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('application/json')) {
      throw new OneComputerApiError(`Unexpected non-JSON response from ONEComputer (HTTP ${response.status})`, response.status, 'invalid_response')
    }
    const body = await response.json() as TResponse & ErrorBody
    if (!response.ok) {
      throw new OneComputerApiError(body.error ?? `Request failed with HTTP ${response.status}`, response.status, body.code ?? 'http_error')
    }
    return body
  }

  private async rawRequest(method: string, path: string, extraHeaders: Record<string, string>, signal?: AbortSignal, body?: unknown): Promise<Response> {
    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          'X-ONEComputer-API-Version': ONECOMPUTER_API_VERSION,
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: signal ?? null,
      })
    } catch (cause) {
      if (cause instanceof OneComputerApiError) throw cause
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
      throw new OneComputerApiError('ONEComputer unreachable', 503, 'onecomputer_unreachable')
    }
    if (!response.ok && !(response.headers.get('content-type') ?? '').includes('application/json')) {
      throw new OneComputerApiError(`Request failed with HTTP ${response.status}`, response.status, 'http_error')
    }
    return response
  }
}
