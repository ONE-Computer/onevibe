import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { DemoRuntimeAdapter } from './demo-runner.js'
import { ClaudeSdkRuntimeAdapter } from './claude-sdk-runner.js'
import { OneComputerClient } from './onecomputer-client.js'
import { RemoteRuntimeAdapter } from './remote-runner.js'
import type { RuntimeAdapter } from './runtime-adapter.js'
import { TaskStore } from './store.js'

const PORT = Number(process.env.ONEVIBE_API_PORT ?? 4311)
const HOST = process.env.ONEVIBE_API_HOST ?? '127.0.0.1'
const REMOTE_RUNTIME_URL = process.env.ONEVIBE_RUNTIME_URL
const REMOTE_RUNTIME_TOKEN = process.env.ONEVIBE_RUNTIME_BEARER_TOKEN
const ONECOMPUTER_API_URL = process.env.ONECOMPUTER_API_URL
const ONECOMPUTER_SERVICE_TOKEN = process.env.ONECOMPUTER_SERVICE_TOKEN
const store = new TaskStore()
const activeRuns = new Map<string, AbortController>()

const json = (response: ServerResponse, status: number, value: unknown) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(value))
}

const readBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 64 * 1024) throw new Error('Request body too large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown
}

const createTaskInput = z.object({
  prompt: z.string().trim().min(3).max(8_000),
  provider: z.enum(['demo', 'claude_sdk', 'remote']).default('demo'),
})
const followUpInput = z.object({ prompt: z.string().trim().min(1).max(8_000) })

const adapterFor = (provider: 'demo' | 'claude_sdk' | 'remote'): RuntimeAdapter => provider === 'remote'
  ? new RemoteRuntimeAdapter(REMOTE_RUNTIME_URL as string, REMOTE_RUNTIME_TOKEN)
  : provider === 'claude_sdk'
    ? new ClaudeSdkRuntimeAdapter()
    : new DemoRuntimeAdapter()

const executeTask = (taskId: string, prompt: string, continuation: boolean) => {
  const task = store.getTask(taskId)
  const controller = new AbortController()
  activeRuns.set(taskId, controller)
  const adapter = adapterFor(task.provider)
  const run = async () => {
    if (task.provider === 'remote' && ONECOMPUTER_API_URL && ONECOMPUTER_SERVICE_TOKEN) {
      const client = new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL, serviceToken: ONECOMPUTER_SERVICE_TOKEN })
      const sandbox = await client.createSandbox(`onevibe-${task.id.slice(-8)}`)
      await store.updateTask(task.id, {
        securityContext: { mode: 'onecomputer', sandboxId: sandbox.id, provider: sandbox.provider, gatewayEnforced: true },
      })
      await store.appendEvent(task.id, {
        type: 'activity_delta', lane: 'control', label: 'ONEComputer sandbox provisioned',
        content: 'The remote runtime is attached to an authenticated ONEComputer sandbox contract.',
        payload: { sandboxId: sandbox.id, provider: sandbox.provider, state: sandbox.state, gatewayEnforced: true },
      })
    } else if (!task.securityContext) {
      await store.updateTask(task.id, { securityContext: { mode: 'local_demo', gatewayEnforced: false } })
    }
    await store.appendEvent(task.id, {
      type: 'user_message', lane: 'transcript', content: prompt,
      payload: { continuation },
    })
    await adapter.run({ task: store.getTask(task.id), store, signal: controller.signal, prompt, continuation })
  }
  run().catch(async (error: unknown) => {
    if (controller.signal.aborted) {
      await store.appendEvent(task.id, {
        type: 'run_cancelled', lane: 'control', status: 'cancelled', label: 'Task cancelled',
        content: 'Execution was stopped by the user. Existing workspace files and evidence were retained.', payload: {},
      })
      await store.updateTask(task.id, { status: 'cancelled' })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    await store.appendEvent(task.id, {
      type: 'run_failed', lane: 'control', status: 'failed', label: 'Task failed', content: message, payload: {},
    })
    await store.updateTask(task.id, { status: 'failed' })
  }).finally(() => activeRuns.delete(task.id))
}

const route = async (request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${HOST}:${PORT}`}`)
  const segments = url.pathname.split('/').filter(Boolean)

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return json(response, 200, {
      status: 'healthy',
      runtime: REMOTE_RUNTIME_URL ? 'remote_available' : 'demo_only',
      approvalAuthority: 'external_vti_wallet',
    })
  }

  if (request.method === 'GET' && url.pathname === '/api/tasks') {
    return json(response, 200, { tasks: store.listTasks() })
  }

  if (request.method === 'POST' && url.pathname === '/api/tasks') {
    const input = createTaskInput.parse(await readBody(request))
    if (input.provider === 'remote' && !REMOTE_RUNTIME_URL) {
      return json(response, 409, { error: 'Remote runtime is not configured. Set ONEVIBE_RUNTIME_URL.' })
    }
    const task = await store.createTask(input.prompt, input.provider)
    setTimeout(() => executeTask(task.id, input.prompt, false), 25)
    return json(response, 201, task)
  }

  const taskId = segments[2]
  if (segments[0] === 'api' && segments[1] === 'tasks' && taskId) {
    if (request.method === 'GET' && segments.length === 3) {
      return json(response, 200, await store.snapshot(taskId))
    }
    if (request.method === 'POST' && segments[3] === 'cancel') {
      const task = store.getTask(taskId)
      if (task.status !== 'running' && task.status !== 'pending') {
        return json(response, 409, { error: `Task cannot be cancelled from ${task.status}` })
      }
      const controller = activeRuns.get(taskId)
      if (!controller) return json(response, 409, { error: 'Task execution is not active' })
      controller.abort()
      return json(response, 202, { status: 'cancelling' })
    }
    if (request.method === 'POST' && segments[3] === 'messages') {
      const input = followUpInput.parse(await readBody(request))
      const task = store.getTask(taskId)
      if (activeRuns.has(taskId) || task.status === 'running' || task.status === 'pending') {
        return json(response, 409, { error: 'Wait for the current turn to finish or stop it first' })
      }
      if (task.provider === 'remote' && !REMOTE_RUNTIME_URL) {
        return json(response, 409, { error: 'Remote runtime is not configured' })
      }
      await store.updateTask(taskId, { status: 'pending' })
      setTimeout(() => executeTask(taskId, input.prompt, true), 25)
      return json(response, 202, { status: 'queued', taskId })
    }
    if (request.method === 'GET' && segments[3] === 'events') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      for (const event of store.listEvents(taskId)) response.write(`event: runtime_event\ndata: ${JSON.stringify(event)}\n\n`)
      const unsubscribe = store.subscribe(taskId, (event) => {
        response.write(`event: runtime_event\ndata: ${JSON.stringify(event)}\n\n`)
      })
      const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000)
      request.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
      return
    }
    if (request.method === 'GET' && segments[3] === 'files' && segments.length === 4) {
      return json(response, 200, { files: await store.listWorkspaceFiles(taskId) })
    }
    if (request.method === 'GET' && segments[3] === 'file') {
      const filePath = url.searchParams.get('path')
      if (!filePath) return json(response, 400, { error: 'Missing path' })
      return json(response, 200, { path: filePath, content: await store.readWorkspaceFile(taskId, filePath) })
    }
    if (request.method === 'GET' && segments[3] === 'preview') {
      const html = await store.readWorkspaceFile(taskId, 'index.html')
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'none'; connect-src 'none'; frame-ancestors 'self'",
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Cache-Control': 'no-store',
      })
      response.end(html)
      return
    }
    if (request.method === 'GET' && segments[3] === 'evidence') {
      return json(response, 200, { valid: store.verifyChain(taskId), events: store.listEvents(taskId) })
    }
    if (request.method === 'GET' && segments[3] === 'download') {
      const archive = await store.exportWorkspaceZip(taskId)
      response.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="onevibe-${taskId}.zip"`,
        'Content-Length': archive.byteLength,
        'Cache-Control': 'no-store',
      })
      response.end(Buffer.from(archive))
      return
    }
  }

  return json(response, 404, { error: 'Not found' })
}

await store.initialize()
createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const status = error instanceof z.ZodError ? 400 : message === 'Task not found' ? 404 : 500
    json(response, status, { error: message })
  })
}).listen(PORT, HOST, () => {
  console.log(`ONEVibe API listening at http://${HOST}:${PORT}`)
})
