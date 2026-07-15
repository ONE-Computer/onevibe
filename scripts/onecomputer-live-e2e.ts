/**
 * Controlled live proof for a configured ONEVibe + ONEComputer deployment.
 * It is intentionally never run as part of unit tests: it creates a real
 * disposable sandbox and requires server-side deployment credentials.
 */
const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '')
const timeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 20 * 60_000))
const requireGateway = process.env.ONEVIBE_E2E_REQUIRE_GATEWAY === 'true'
const requireVisual = process.env.ONEVIBE_E2E_REQUIRE_VISUAL !== 'false'

type Snapshot = {
  id: string
  status: string
  securityContext?: { executionBoundary?: string; gatewayEnforced?: boolean; sandboxState?: string }
  events: Array<{ type: string; label?: string; payload: Record<string, unknown> }>
}

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

const main = async () => {
  const readiness = await request<{ providers: Array<{ id: string; available: boolean; detail: string }> }>('/api/runtime')
  const sandbox = readiness.providers.find((provider) => provider.id === 'onecomputer')
  if (!sandbox?.available) throw new Error(`ONEComputer is not available at ${baseUrl}: ${sandbox?.detail ?? 'runtime status unavailable'}`)
  const created = await request<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Create a small accessible governed website with index.html and a concise README. Do not publish or call external services.',
      provider: 'onecomputer',
      mode: 'website',
      projectId: 'project_onevibe',
      references: [], attachments: [], skills: ['web_build', 'security_review'],
    }),
  })
  const task = await waitForTerminalSnapshot(created.id)
  if (task.status !== 'completed') throw new Error(`ONEComputer task ${task.id} ended ${task.status}`)
  if (task.securityContext?.executionBoundary !== 'onecomputer_sandbox') throw new Error('Task did not record the ONEComputer sandbox execution boundary')
  if (requireGateway && task.securityContext?.gatewayEnforced !== true) throw new Error('Gateway attestation was required but not recorded')
  if (task.securityContext?.sandboxState !== 'destroyed') throw new Error(`Expected ephemeral sandbox destruction, found ${task.securityContext?.sandboxState ?? 'unknown'}`)
  if (!task.events.some((event) => event.label === 'ONEComputer sandbox ready')) throw new Error('Sandbox readiness event missing')
  if (requireVisual && !task.events.some((event) => event.payload.kind === 'visual_frame')) throw new Error('Required X11 visual evidence missing')
  const preview = await request<{ content: string }>(`/api/tasks/${encodeURIComponent(task.id)}/file?path=index.html`)
  if (!preview.content.includes('<')) throw new Error('Expected portable index.html was not extracted')
  const evidence = await request<{ valid: boolean }>(`/api/tasks/${encodeURIComponent(task.id)}/evidence`)
  if (!evidence.valid) throw new Error('Evidence chain verification failed')
  console.log(JSON.stringify({ taskId: task.id, status: task.status, gatewayEnforced: task.securityContext?.gatewayEnforced === true, visualEvidence: task.events.filter((event) => event.payload.kind === 'visual_frame').length, evidenceValid: evidence.valid }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
