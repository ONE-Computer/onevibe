import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { McpConfig } from './runtime-adapter.js'

const REQUEST_TIMEOUT_MS = 5_000
const MAX_FRAME_BYTES = 256 * 1024
const MAX_TOOLS = 200
const MAX_RESULTS = 10

type JsonRpcResponse = { id?: number; result?: unknown; error?: { message?: string } }
type McpTool = { name: string; description?: string; inputSchema?: unknown }
export type McpCapability = { id: string; name: string; description: string; server: string; inputSchema?: unknown }

const safeEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: process.env.HOME ?? '/tmp',
  TMPDIR: process.env.TMPDIR ?? '/tmp',
  LANG: 'C',
  NODE_ENV: 'production',
})

const tokenise = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 2)
const score = (query: string, tool: McpTool) => {
  const queryTokens = tokenise(query)
  const haystack = `${tool.name} ${tool.description ?? ''}`.toLowerCase()
  return queryTokens.reduce((total, token) => total + (haystack.includes(token) ? (tool.name.toLowerCase().includes(token) ? 3 : 1) : 0), 0)
}

export class McpStdioClient {
  private readonly process: ChildProcessWithoutNullStreams
  private buffer = Buffer.alloc(0)
  private nextId = 1
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private initialized = false

  constructor(private readonly config: McpConfig, private readonly timeoutMs = REQUEST_TIMEOUT_MS) {
    this.process = spawn(config.command, config.args, { cwd: process.cwd(), env: safeEnv(), shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    this.process.stdout.on('data', (chunk: Buffer | string) => this.consume(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    this.process.on('error', (error) => this.failPending(error instanceof Error ? error : new Error('MCP process failed')))
    this.process.on('exit', (code, signal) => this.failPending(new Error(`MCP server exited (${code ?? signal ?? 'unknown'})`)))
  }

  private failPending(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private consume(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    if (this.buffer.byteLength > MAX_FRAME_BYTES * 2) return this.failPending(new Error('MCP output exceeded the bounded frame buffer'))
    while (this.buffer.length) {
      const separator = this.buffer.indexOf('\r\n\r\n')
      const newline = this.buffer.indexOf('\n')
      if (separator >= 0 && (newline < 0 || separator < newline)) {
        const header = this.buffer.subarray(0, separator).toString('utf8')
        const match = header.match(/content-length:\s*(\d+)/i)
        if (!match) { this.buffer = this.buffer.subarray(separator + 4); continue }
        const length = Number(match[1])
        if (!Number.isSafeInteger(length) || length < 0 || length > MAX_FRAME_BYTES) return this.failPending(new Error('MCP frame length is invalid'))
        if (this.buffer.length < separator + 4 + length) return
        const body = this.buffer.subarray(separator + 4, separator + 4 + length).toString('utf8')
        this.buffer = this.buffer.subarray(separator + 4 + length)
        this.resolveFrame(body)
        continue
      }
      if (newline < 0) return
      const line = this.buffer.subarray(0, newline).toString('utf8').trim()
      this.buffer = this.buffer.subarray(newline + 1)
      if (line) this.resolveFrame(line)
    }
  }

  private resolveFrame(body: string) {
    try {
      const message = JSON.parse(body) as JsonRpcResponse
      if (typeof message.id !== 'number') return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message ?? 'MCP request failed'))
      else pending.resolve(message.result)
    } catch {
      this.failPending(new Error('MCP server returned invalid JSON-RPC output'))
    }
  }

  private request(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    const payload = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MCP ${method} timed out`)) }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.process.stdin.write(payload, (error) => {
        if (!error) return
        clearTimeout(timer); this.pending.delete(id); reject(error)
      })
    })
  }

  async listTools(): Promise<McpTool[]> {
    if (!this.initialized) {
      await this.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'onevibe-capability-facade', version: '0.1.0' } })
      this.process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`)
      this.initialized = true
    }
    const result = await this.request('tools/list', {}) as { tools?: unknown }
    if (!Array.isArray(result?.tools)) return []
    return result.tools.slice(0, MAX_TOOLS).flatMap((tool): McpTool[] => {
      if (!tool || typeof tool !== 'object') return []
      const value = tool as Record<string, unknown>
      if (typeof value.name !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(value.name)) return []
      return [{ name: value.name, description: typeof value.description === 'string' ? value.description.slice(0, 500) : undefined, inputSchema: value.inputSchema }]
    })
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(name)) throw new Error('MCP capability name is invalid')
    return this.request('tools/call', { name, arguments: args })
  }

  close() {
    this.failPending(new Error('MCP client closed'))
    if (!this.process.killed) this.process.kill('SIGTERM')
  }
}

export class McpCapabilityFacade {
  private readonly clients = new Map<string, McpStdioClient>()
  private readonly capabilities = new Map<string, McpCapability>()

  constructor(private readonly configs: readonly McpConfig[], private readonly timeoutMs = REQUEST_TIMEOUT_MS) {}

  private client(config: McpConfig) {
    let client = this.clients.get(config.id)
    if (!client) { client = new McpStdioClient(config, this.timeoutMs); this.clients.set(config.id, client) }
    return client
  }

  async search(query: string, signal?: AbortSignal): Promise<McpCapability[]> {
    if (signal?.aborted) throw new DOMException('MCP search aborted', 'AbortError')
    const results = await Promise.allSettled(this.configs.map(async (config) => {
      const tools = await this.client(config).listTools()
      return tools.map((tool) => ({
        id: `${config.id}:${tool.name}`, name: tool.name, description: tool.description ?? 'MCP capability', server: config.name, inputSchema: tool.inputSchema,
        score: score(query, tool),
      }))
    }))
    const matches = results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, MAX_RESULTS)
    for (const match of matches) { const { score: _score, ...capability } = match; this.capabilities.set(capability.id, capability) }
    return matches.map(({ score: _score, ...capability }) => capability)
  }

  async execute(capabilityId: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException('MCP execution aborted', 'AbortError')
    const capability = this.capabilities.get(capabilityId) ?? (await this.search(capabilityId, signal)).find((item) => item.id === capabilityId)
    if (!capability) throw new Error('MCP capability was not found; search before executing')
    const config = this.configs.find((candidate) => `${candidate.id}:${capability.name}` === capability.id)
    if (!config) throw new Error('MCP capability server is no longer configured')
    return this.client(config).callTool(capability.name, args)
  }

  close() { for (const client of this.clients.values()) client.close(); this.clients.clear() }
}
