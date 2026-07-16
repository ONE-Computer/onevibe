/**
 * Controlled live proof for a configured ONEVibe + ONEComputer deployment.
 * It is intentionally never run as part of unit tests: it creates a real
 * disposable sandbox and requires server-side deployment credentials.
 */
const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')
const timeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 20 * 60_000))
const requireGateway = process.env.ONEVIBE_E2E_REQUIRE_GATEWAY === 'true'
const requireVisual = process.env.ONEVIBE_E2E_REQUIRE_VISUAL !== 'false'
const requireLiteLlm = process.env.ONEVIBE_E2E_REQUIRE_LITELLM !== 'false'
const mode = process.env.ONEVIBE_E2E_MODE === 'website' ? 'website' : 'slides'

type Snapshot = {
  id: string
  status: string
  securityContext?: { executionBoundary?: string; gatewayEnforced?: boolean; sandboxId?: string; sandboxState?: string }
  events: Array<{ type: string; label?: string; payload: Record<string, unknown> }>
}

type SseFrame = { id?: string; event?: string; data?: string }

const request = async <T>(pathname: string, init?: RequestInit) => {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  } catch (error) {
    throw new Error(`Cannot reach ONEVibe at ${baseUrl}${pathname}: ${error instanceof Error ? error.message : 'network failure'}`)
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}

const waitForTerminalSnapshot = async (taskId: string) => {
  const deadline = Date.now() + timeoutMs
  let latest: Snapshot | undefined
  while (Date.now() < deadline) {
    latest = await request<Snapshot>(`/api/tasks/${encodeURIComponent(taskId)}`)
    if (['completed', 'failed', 'cancelled'].includes(latest.status)) return latest
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`Task ${taskId} did not reach a terminal state within ${timeoutMs}ms (last state: ${latest?.status ?? 'unreadable'})`)
}

const download = async (taskId: string, filePath: string) => {
  const response = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(filePath)}&download=1`)
  if (!response.ok) throw new Error(`Unable to download ${filePath}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

const parseSseFrames = (source: string): SseFrame[] => source.split(/\r?\n\r?\n/).flatMap((block) => {
  if (!block.trim() || block.trimStart().startsWith(':')) return []
  const frame: SseFrame = {}
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    const key = separator < 0 ? line : line.slice(0, separator)
    const value = (separator < 0 ? '' : line.slice(separator + 1)).replace(/^ /, '')
    if (key === 'id') frame.id = value
    if (key === 'event') frame.event = value
    if (key === 'data') frame.data = frame.data ? `${frame.data}\n${value}` : value
  }
  return frame.event || frame.data ? [frame] : []
})

const readSseFrames = async (taskId: string, lastEventId?: string, minimumFrames = 4) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/events`, {
      headers: { Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) },
      signal: controller.signal,
    })
    if (!response.ok || !response.body) throw new Error(`SSE endpoint returned HTTP ${response.status}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let source = ''
    let frames: SseFrame[] = []
    while (frames.length < minimumFrames) {
      const chunk = await reader.read()
      if (chunk.done) break
      source += decoder.decode(chunk.value, { stream: true })
      frames = parseSseFrames(source)
    }
    await reader.cancel()
    return frames
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

const main = async () => {
  const readiness = await request<{ providers: Array<{ id: string; available: boolean; detail: string }> }>('/api/runtime')
  const sandbox = readiness.providers.find((provider) => provider.id === 'onecomputer')
  if (!sandbox?.available) throw new Error(`ONEComputer is not available at ${baseUrl}: ${sandbox?.detail ?? 'runtime status unavailable'}`)
  const created = await request<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: mode === 'slides'
        ? 'Create a concise five-to-eight slide executive update as a real PPTX deck and a direct PDF export, with speaker notes and a structured outline. Include decision, context, recommendation, risks, and next steps. Do not publish or call external services.'
        : 'Create a small accessible governed website with index.html and a concise README. Do not publish or call external services.',
      provider: 'onecomputer',
      mode,
      projectId: 'project_onevibe',
      references: [], attachments: [], skills: mode === 'slides' ? ['slides', 'security_review'] : ['web_build', 'security_review'],
    }),
  })
  const liveSsePromise = readSseFrames(created.id)
  const task = await waitForTerminalSnapshot(created.id)
  if (task.status !== 'completed') throw new Error(`ONEComputer task ${task.id} ended ${task.status}`)
  const liveSse = await liveSsePromise
  const liveRuntimeEvents = liveSse.filter((frame) => frame.event === 'runtime_event' && frame.data)
  if (!liveRuntimeEvents.length || !liveRuntimeEvents.some((frame) => frame.id?.startsWith(`${created.id}:event:`))) throw new Error('ONEComputer task did not emit durable runtime_event SSE frames')
  const replayCursor = liveRuntimeEvents[0]?.id
  if (!replayCursor) throw new Error('SSE runtime event did not include a durable event ID')
  const replaySse = await readSseFrames(created.id, replayCursor, 2)
  const replayRuntimeEvents = replaySse.filter((frame) => frame.event === 'runtime_event' && frame.data)
  if (!replayRuntimeEvents.length || replayRuntimeEvents.some((frame) => frame.id === replayCursor)) throw new Error('SSE Last-Event-ID did not produce a suffix-only replay')
  if (task.securityContext?.executionBoundary !== 'onecomputer_sandbox') throw new Error('Task did not record the ONEComputer sandbox execution boundary')
  if (requireGateway && task.securityContext?.gatewayEnforced !== true) throw new Error('Gateway attestation was required but not recorded')
  if (task.securityContext?.sandboxState !== 'started' || !task.securityContext.sandboxId) throw new Error(`Expected a retained started sandbox, found ${task.securityContext?.sandboxState ?? 'unknown'}`)
  const firstSandboxId = task.securityContext.sandboxId
  if (!task.events.some((event) => event.label === 'ONEComputer sandbox ready')) throw new Error('Sandbox readiness event missing')
  if (!task.events.some((event) => event.type === 'run_started' && event.payload.agentRuntime === 'claude_agent_sdk')) throw new Error('ONEComputer task did not record the sandbox-resident Claude Agent SDK runtime')
  if (requireLiteLlm && !task.events.some((event) => event.type === 'run_started' && event.payload.claudeTransport === 'litellm')) throw new Error('Sandbox run did not record the required server-controlled LiteLLM transport')
  if (requireVisual && !task.events.some((event) => event.payload.kind === 'visual_frame')) throw new Error('Required X11 visual evidence missing')
  if (mode === 'slides') {
    const [pptx, pdf] = await Promise.all([download(task.id, 'deck.pptx'), download(task.id, 'deck.pdf')])
    if (String.fromCharCode(...pptx.subarray(0, 2)) !== 'PK') throw new Error('Sandbox slide task did not produce a ZIP-based PPTX deck')
    if (String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') throw new Error('Sandbox slide task did not produce a PDF export')
  } else {
    const preview = await request<{ content: string }>(`/api/tasks/${encodeURIComponent(task.id)}/file?path=index.html`)
    if (!preview.content.includes('<')) throw new Error('Expected portable index.html was not extracted')
  }
  const evidence = await request<{ valid: boolean }>(`/api/tasks/${encodeURIComponent(task.id)}/evidence`)
  if (!evidence.valid) throw new Error('Evidence chain verification failed')

  await request(`/api/tasks/${encodeURIComponent(task.id)}/messages`, {
    method: 'POST', body: JSON.stringify({ prompt: 'Confirm the existing workspace and deck remain available. Make one concise improvement to README.md without replacing the deck.' }),
  })
  const continued = await waitForTerminalSnapshot(task.id)
  if (continued.status !== 'completed') throw new Error(`ONEComputer continuation ${task.id} ended ${continued.status}`)
  if (continued.securityContext?.sandboxId !== firstSandboxId) throw new Error('Conversation follow-up did not reuse its original sandbox')
  if (!continued.events.some((event) => event.label === 'ONEComputer retained sandbox resumed')) throw new Error('Retained-sandbox continuation evidence missing')

  const separate = await request<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Create a concise README.md stating that this is a separate governed conversation. Do not publish or call external services.',
      provider: 'onecomputer', mode: 'general', projectId: 'project_onevibe', references: [], attachments: [], skills: ['security_review'],
    }),
  })
  const separateTask = await waitForTerminalSnapshot(separate.id)
  if (separateTask.status !== 'completed') throw new Error(`Separate ONEComputer task ${separate.id} ended ${separateTask.status}`)
  const secondSandboxId = separateTask.securityContext?.sandboxId
  if (!secondSandboxId || secondSandboxId === firstSandboxId) throw new Error('Different conversations did not receive distinct sandbox identities')

  const firstRelease = await request<{ status: string }>(`/api/tasks/${encodeURIComponent(task.id)}/sandbox/release`, { method: 'POST' })
  const secondRelease = await request<{ status: string }>(`/api/tasks/${encodeURIComponent(separate.id)}/sandbox/release`, { method: 'POST' })
  if (firstRelease.status !== 'released' || secondRelease.status !== 'released') throw new Error('Explicit sandbox cleanup did not release both conversation leases')

  console.log(JSON.stringify({
    taskId: task.id, separateTaskId: separate.id, status: continued.status, mode,
    firstSandboxId, continuationSandboxId: continued.securityContext?.sandboxId, secondSandboxId,
    sameConversationReused: continued.securityContext?.sandboxId === firstSandboxId,
    conversationsIsolated: secondSandboxId !== firstSandboxId,
    gatewayEnforced: task.securityContext?.gatewayEnforced === true,
    sdkRuntime: task.events.some((event) => event.type === 'run_started' && event.payload.agentRuntime === 'claude_agent_sdk'),
    litellmRouted: task.events.some((event) => event.type === 'run_started' && event.payload.claudeTransport === 'litellm'),
    visualEvidence: continued.events.filter((event) => event.payload.kind === 'visual_frame').length,
    sseLiveFrames: liveRuntimeEvents.length,
    sseReplayFrames: replayRuntimeEvents.length,
    sseSuffixOnly: replayRuntimeEvents.every((frame) => frame.id !== replayCursor),
    evidenceValid: evidence.valid, cleanup: [firstRelease.status, secondRelease.status],
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
