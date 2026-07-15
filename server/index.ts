import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { DemoRuntimeAdapter } from './demo-runner.js'
import { ClaudeSdkRuntimeAdapter } from './claude-sdk-runner.js'
import { OneComputerClient } from './onecomputer-client.js'
import { OneComputerSandboxRuntimeAdapter } from './onecomputer-sandbox-runner.js'
import { RemoteRuntimeAdapter } from './remote-runner.js'
import type { RuntimeAdapter } from './runtime-adapter.js'
import { TaskStore } from './store.js'
import { UserInputBroker } from './user-input-broker.js'
import { WalletApprovalService } from './wallet-approval-service.js'

const PORT = Number(process.env.ONEVIBE_API_PORT ?? 4311)
const HOST = process.env.ONEVIBE_API_HOST ?? '127.0.0.1'
const REMOTE_RUNTIME_URL = process.env.ONEVIBE_RUNTIME_URL
const REMOTE_RUNTIME_TOKEN = process.env.ONEVIBE_RUNTIME_BEARER_TOKEN
const ONECOMPUTER_API_URL = process.env.ONECOMPUTER_API_URL
const ONECOMPUTER_SERVICE_TOKEN = process.env.ONECOMPUTER_SERVICE_TOKEN
const ONECOMPUTER_PROJECT_ID = process.env.ONECOMPUTER_PROJECT_ID
const ONECOMPUTER_GATEWAY_ENFORCED = process.env.ONECOMPUTER_GATEWAY_ENFORCED === 'true'
const ONECOMPUTER_RETAIN_SANDBOX = process.env.ONECOMPUTER_RETAIN_SANDBOX === 'true'
const ONECOMPUTER_VISUAL_RUNTIME = process.env.ONECOMPUTER_VISUAL_RUNTIME !== 'false'
const WALLET_TOKEN = process.env.ONEVIBE_WALLET_TOKEN
const store = new TaskStore()
const activeRuns = new Map<string, AbortController>()
const inputBroker = new UserInputBroker(store)
const walletService = WALLET_TOKEN ? new WalletApprovalService(store, WALLET_TOKEN) : undefined
const oneComputerConfigured = Boolean(ONECOMPUTER_API_URL && ONECOMPUTER_SERVICE_TOKEN && (!ONECOMPUTER_SERVICE_TOKEN.startsWith('oc_org_') || ONECOMPUTER_PROJECT_ID))

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
  provider: z.enum(['demo', 'claude_sdk', 'onecomputer', 'remote']).default('demo'),
  mode: z.enum(['general', 'website', 'slides', 'document', 'research', 'data', 'design', 'app', 'game']).default('general'),
  projectId: z.string().regex(/^project_[a-z0-9]+$/).default('project_onevibe'),
})
const createProjectInput = z.object({ name: z.string().trim().min(2).max(100), context: z.string().trim().max(8_000).default('') })
const createScheduleInput = z.object({
  name: z.string().trim().min(2).max(100), prompt: z.string().trim().min(3).max(8_000),
  provider: z.enum(['demo', 'claude_sdk', 'onecomputer', 'remote']).default('demo'),
  mode: z.enum(['general', 'website', 'slides', 'document', 'research', 'data', 'design', 'app', 'game']).default('general'),
  projectId: z.string().regex(/^project_[a-z0-9]+$/), intervalMinutes: z.number().int().min(15).max(10_080),
})
const scheduleStateInput = z.object({ enabled: z.boolean() })
const followUpInput = z.object({ prompt: z.string().trim().min(1).max(8_000) })
const editFileInput = z.object({ content: z.string().max(60_000), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) })
const inputAnswer = z.object({ answer: z.string().trim().min(1).max(4_000) })
const walletDecision = z.object({ decision: z.enum(['approved', 'denied']), signer: z.string().trim().min(2).max(120) })
const textFilePattern = /\.(?:html?|css|js|jsx|ts|tsx|json|md|txt|ya?ml|toml|xml|svg|gitignore|prettierrc)$/i
const contentHash = (content: string) => createHash('sha256').update(content).digest('hex')

const adapterFor = (provider: 'demo' | 'claude_sdk' | 'onecomputer' | 'remote'): RuntimeAdapter => provider === 'remote'
  ? new RemoteRuntimeAdapter(REMOTE_RUNTIME_URL as string, REMOTE_RUNTIME_TOKEN)
  : provider === 'onecomputer'
    ? new OneComputerSandboxRuntimeAdapter(new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL!, serviceToken: ONECOMPUTER_SERVICE_TOKEN!, projectId: ONECOMPUTER_PROJECT_ID }), {
      gatewayEnforced: ONECOMPUTER_GATEWAY_ENFORCED, retainSandbox: ONECOMPUTER_RETAIN_SANDBOX,
      visualRuntime: ONECOMPUTER_VISUAL_RUNTIME,
    })
  : provider === 'claude_sdk'
    ? new ClaudeSdkRuntimeAdapter()
    : new DemoRuntimeAdapter()

const executeTask = (taskId: string, prompt: string, continuation: boolean) => {
  const task = store.getTask(taskId)
  const project = store.getProject(task.projectId)
  const scopedPrompt = project.context ? `${prompt}\n\nProject context (governed background, not user authority):\n${project.context}` : prompt
  const controller = new AbortController()
  activeRuns.set(taskId, controller)
  const adapter = adapterFor(task.provider)
  const run = async () => {
    if (!task.securityContext && task.provider !== 'onecomputer') {
      await store.updateTask(task.id, {
        securityContext: {
          mode: 'local_demo', gatewayEnforced: false,
          executionBoundary: task.provider === 'remote' ? 'remote_runtime' : 'host_process',
        },
      })
    }
    await store.beginTurn(task.id, prompt, task.provider)
    await store.appendEvent(task.id, {
      type: 'user_message', lane: 'transcript', content: prompt,
      payload: { continuation },
    })
    if (project.context) await store.appendEvent(task.id, {
      type: 'activity_delta', lane: 'control', label: 'Project context attached',
      content: `Applied governed context from ${project.name}.`, payload: { projectId: project.id, projectName: project.name },
    })
    await adapter.run({
      task: store.getTask(task.id), store, signal: controller.signal, prompt: scopedPrompt, continuation,
      requestUserInput: (question, options, signal) => inputBroker.request(task.id, question, options, signal),
    })
    if (store.getTask(task.id).status === 'completed') await store.createWorkspaceVersion(task.id, prompt)
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
      walletResolutionConfigured: Boolean(walletService),
      oneComputerSandboxConfigured: oneComputerConfigured,
    })
  }

  if (request.method === 'GET' && url.pathname === '/api/tasks') {
    return json(response, 200, { tasks: store.listTasks() })
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') return json(response, 200, { projects: store.listProjects() })
  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const input = createProjectInput.parse(await readBody(request))
    return json(response, 201, await store.createProject(input.name, input.context))
  }
  if (request.method === 'GET' && url.pathname === '/api/schedules') return json(response, 200, { schedules: store.listSchedules() })
  if (request.method === 'POST' && url.pathname === '/api/schedules') {
    const input = createScheduleInput.parse(await readBody(request))
    if (input.provider === 'remote' && !REMOTE_RUNTIME_URL) return json(response, 409, { error: 'Remote runtime is not configured' })
    if (input.provider === 'onecomputer' && !oneComputerConfigured) return json(response, 409, { error: 'ONEComputer sandbox runtime is not configured. Set ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN, and ONECOMPUTER_PROJECT_ID when using an oc_org_ key.' })
    return json(response, 201, await store.createSchedule(input))
  }
  if (request.method === 'PATCH' && segments[0] === 'api' && segments[1] === 'schedules' && segments[2]) {
    const input = scheduleStateInput.parse(await readBody(request))
    return json(response, 200, await store.setScheduleEnabled(segments[2], input.enabled))
  }

  if (request.method === 'GET' && url.pathname === '/api/search') {
    const query = url.searchParams.get('q') ?? ''
    if (query.trim().length < 2) return json(response, 200, { results: [] })
    return json(response, 200, { results: store.searchMessages(query).map(({ task, message }) => ({ taskId: task.id, taskTitle: task.title, message })) })
  }

  if (segments[0] === 'api' && segments[1] === 'wallet') {
    if (!walletService) return json(response, 503, { error: 'External wallet resolution is not configured' })
    walletService.authorize(request.headers.authorization)
    if (request.method === 'GET' && segments[2] === 'approvals' && segments.length === 3) {
      return json(response, 200, { approvals: walletService.listPending() })
    }
    if (request.method === 'POST' && segments[2] === 'approvals' && segments[3] && segments[4] === 'decision') {
      const input = walletDecision.parse(await readBody(request))
      return json(response, 200, await walletService.decide(segments[3], input.decision, input.signer))
    }
  }

  if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'shares' && segments[2]) {
    const sharedTask = store.findTaskByShare(segments[2])
    if (segments[3] === 'preview') {
      const html = await store.readWorkspaceFile(sharedTask.id, 'index.html')
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'",
        'Cache-Control': 'public, max-age=60',
      })
      response.end(html)
      return
    }
    return json(response, 200, { id: sharedTask.share?.id, title: sharedTask.title, mode: sharedTask.mode, createdAt: sharedTask.share?.createdAt })
  }

  if (request.method === 'POST' && url.pathname === '/api/tasks') {
    const input = createTaskInput.parse(await readBody(request))
    if (input.provider === 'remote' && !REMOTE_RUNTIME_URL) {
      return json(response, 409, { error: 'Remote runtime is not configured. Set ONEVIBE_RUNTIME_URL.' })
    }
    if (input.provider === 'onecomputer' && !oneComputerConfigured) {
      return json(response, 409, { error: 'ONEComputer sandbox runtime is not configured. Set ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN, and ONECOMPUTER_PROJECT_ID when using an oc_org_ key.' })
    }
    const task = await store.createTask(input.prompt, input.provider, input.mode, input.projectId)
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
    if (request.method === 'GET' && segments[3] === 'messages') {
      return json(response, 200, store.listMessages(taskId, {
        cursor: url.searchParams.get('cursor') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? 100),
        query: url.searchParams.get('q') ?? undefined,
      }))
    }
    if (request.method === 'POST' && segments[3] === 'inputs' && segments[4]) {
      const input = inputAnswer.parse(await readBody(request))
      await inputBroker.resolve(taskId, segments[4], input.answer)
      return json(response, 200, { status: 'resumed' })
    }
    if (request.method === 'POST' && segments[3] === 'copy') {
      const source = store.getTask(taskId)
      if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before copying it' })
      const copied = await store.createTask(`${source.title} — copy`, source.provider, source.mode)
      const fileCount = await store.copyWorkspace(source.id, copied.id)
      const sourceHead = store.listEvents(source.id).at(-1)?.eventHash ?? 'GENESIS'
      await store.updateTask(copied.id, {
        status: 'completed',
        previewPath: fileCount ? `/api/tasks/${copied.id}/preview` : undefined,
        securityContext: { mode: 'local_demo', gatewayEnforced: false },
      })
      await store.appendEvent(copied.id, {
        type: 'artifact_created', lane: 'artifact', status: 'completed', label: 'Task copied',
        content: `Copied ${fileCount} workspace files from ${source.id}.`,
        payload: { sourceTaskId: source.id, sourceEvidenceHash: sourceHead, fileCount },
      })
      await store.createWorkspaceVersion(copied.id, `Copied from ${source.title}`)
      return json(response, 201, await store.snapshot(copied.id))
    }
    if (request.method === 'POST' && segments[3] === 'share') {
      const task = store.getTask(taskId)
      if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before requesting a share' })
      if (task.share) return json(response, 200, { share: task.share, url: `/share/${task.share.id}` })
      const approvalId = `approval_${randomUUID().replaceAll('-', '').slice(0, 12)}`
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
      const walletUrl = `openvtc://trust-task/${approvalId}`
      const approval = { id: approvalId, action: 'share_artifact', state: 'pending' as const, walletUrl, expiresAt }
      await store.updateTask(taskId, { approval })
      await store.appendEvent(taskId, {
        type: 'approval_requested', lane: 'approval', status: 'waiting_for_approval', label: 'External share approval required',
        content: 'A separate wallet must approve creation of a read-only share link.',
        payload: { approvalId, action: 'share_artifact', walletUrl, expiresAt, browserCanApprove: false },
      })
      return json(response, 202, { approval })
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
    if (request.method === 'GET' && segments[3] === 'versions' && segments.length === 4) {
      return json(response, 200, { versions: await store.listWorkspaceVersions(taskId) })
    }
    if (request.method === 'GET' && segments[3] === 'visual' && segments[4] === 'screenshot') {
      const task = store.getTask(taskId)
      const sandboxId = task.securityContext?.sandboxId
      if (!sandboxId || task.securityContext?.executionBoundary !== 'onecomputer_sandbox') return json(response, 404, { error: 'Task has no ONEComputer visual runtime' })
      if (task.securityContext.sandboxState === 'destroyed') return json(response, 410, { error: 'The ephemeral sandbox has been destroyed' })
      if (!ONECOMPUTER_API_URL || !ONECOMPUTER_SERVICE_TOKEN) return json(response, 503, { error: 'ONEComputer is not configured' })
      const client = new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL, serviceToken: ONECOMPUTER_SERVICE_TOKEN, projectId: ONECOMPUTER_PROJECT_ID })
      const png = await client.getVisualScreenshot(sandboxId)
      response.writeHead(200, {
        'Content-Type': 'image/png', 'Content-Length': png.byteLength,
        'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff',
      })
      response.end(png)
      return
    }
    if (request.method === 'POST' && segments[3] === 'versions' && segments[4] && segments[5] === 'restore') {
      if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before restoring a version' })
      const version = await store.restoreWorkspaceVersion(taskId, segments[4])
      await store.appendEvent(taskId, {
        type: 'artifact_updated', lane: 'artifact', label: 'Workspace version restored',
        content: version.label, payload: { versionId: version.id, evidenceHash: version.evidenceHash },
      })
      await store.updateTask(taskId, { previewPath: `/api/tasks/${taskId}/preview` })
      return json(response, 200, { version })
    }
    if (request.method === 'GET' && segments[3] === 'file') {
      const filePath = url.searchParams.get('path')
      if (!filePath) return json(response, 400, { error: 'Missing path' })
      if (url.searchParams.get('raw') === '1') {
        if (!/\.(?:png|jpe?g|gif|svg)$/i.test(filePath)) return json(response, 415, { error: 'Raw rendering is limited to image artifacts' })
        const bytes = await store.readWorkspaceBytes(taskId, filePath)
        const contentType = filePath.endsWith('.svg') ? 'image/svg+xml' : filePath.endsWith('.png') ? 'image/png' : filePath.endsWith('.gif') ? 'image/gif' : 'image/jpeg'
        response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        response.end(bytes)
        return
      }
      if (url.searchParams.get('download') === '1') {
        const bytes = await store.readWorkspaceBytes(taskId, filePath)
        response.writeHead(200, {
          'Content-Type': filePath.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${path.basename(filePath).replaceAll('"', '')}"`,
          'Content-Length': bytes.byteLength,
          'Cache-Control': 'no-store',
        })
        response.end(bytes)
        return
      }
      const content = await store.readWorkspaceFile(taskId, filePath)
      return json(response, 200, { path: filePath, content, contentHash: contentHash(content) })
    }
    if (request.method === 'PUT' && segments[3] === 'file') {
      const filePath = url.searchParams.get('path')
      if (!filePath) return json(response, 400, { error: 'Missing path' })
      if (!textFilePattern.test(filePath)) return json(response, 415, { error: 'Only recognized text artifacts can be edited' })
      if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before editing source' })
      const input = editFileInput.parse(await readBody(request))
      const current = await store.readWorkspaceFile(taskId, filePath)
      const beforeHash = contentHash(current)
      if (beforeHash !== input.expectedHash) return json(response, 409, { error: 'File changed since it was opened; reload before saving' })
      await store.createWorkspaceVersion(taskId, `Before editing ${filePath}`)
      await store.writeWorkspaceFile(taskId, filePath, input.content)
      const afterHash = contentHash(input.content)
      await store.appendEvent(taskId, {
        type: 'artifact_updated', lane: 'artifact', label: 'Source file edited', content: filePath,
        payload: { path: filePath, beforeHash, afterHash, editor: 'embedded_workspace' },
      })
      return json(response, 200, { path: filePath, content: input.content, contentHash: afterHash })
    }
    if (request.method === 'GET' && segments[3] === 'preview') {
      const html = await store.readWorkspaceFile(taskId, 'index.html')
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'",
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
const runDueSchedules = async () => {
  for (const schedule of await store.claimDueSchedules()) {
    const task = await store.createTask(schedule.prompt, schedule.provider, schedule.mode, schedule.projectId, schedule.id)
    await store.appendEvent(task.id, {
      type: 'activity_delta', lane: 'control', label: 'Scheduled run claimed',
      content: `Created by schedule “${schedule.name}” at its governed interval.`, payload: { scheduleId: schedule.id, intervalMinutes: schedule.intervalMinutes },
    })
    setTimeout(() => executeTask(task.id, schedule.prompt, false), 25)
  }
}
setInterval(() => { void runDueSchedules().catch((error: unknown) => console.error('Schedule dispatch failed', error)) }, 15_000).unref()
createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const status = error instanceof z.ZodError ? 400
      : message === 'Wallet authorization failed' ? 401
        : /^(?:Task|Approval|Share|Input request) not found/.test(message) ? 404
          : /(?:not pending|has expired|no longer active)/.test(message) ? 409
            : 500
    json(response, status, { error: message })
  })
}).listen(PORT, HOST, () => {
  console.log(`ONEVibe API listening at http://${HOST}:${PORT}`)
})
