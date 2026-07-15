/**
 * Controlled live proof for a configured ONEVibe + Claude Agent SDK server.
 * This is opt-in: it sends one small task to the real provider and may incur
 * provider usage. It refuses to create a task when server-side readiness is
 * absent, so local/demo environments never fall back silently.
 */
const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')
const timeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 5 * 60_000))

type Snapshot = {
  id: string
  status: string
  securityContext?: { executionBoundary?: string; runtimeSessionId?: string }
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
  const claude = readiness.providers.find((provider) => provider.id === 'claude_sdk')
  if (!claude?.available) throw new Error(`Claude SDK is not available at ${baseUrl}: ${claude?.detail ?? 'runtime status unavailable'}`)
  const created = await request<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Create exactly one file named README.md with a title and one concise sentence stating that this is a governed Claude Agent SDK validation artifact. Do not access the network, credentials, or any path outside the current workspace.',
      provider: 'claude_sdk', mode: 'document', projectId: 'project_onevibe', references: [], attachments: [], skills: ['document', 'security_review'],
    }),
  })
  const task = await waitForTerminalSnapshot(created.id)
  if (task.status !== 'completed') throw new Error(`Claude SDK task ${task.id} ended ${task.status}`)
  if (task.securityContext?.executionBoundary !== 'host_process') throw new Error(`Expected governed host workspace boundary, found ${task.securityContext?.executionBoundary ?? 'unknown'}`)
  if (!task.securityContext?.runtimeSessionId) throw new Error('Claude SDK session identity was not recorded')
  if (!task.events.some((event) => event.type === 'run_started' && event.label === 'Claude Agent SDK started')) throw new Error('Claude SDK run-start event missing')
  if (!task.events.some((event) => event.type === 'run_completed' && event.label === 'Claude Agent SDK completed')) throw new Error('Claude SDK completion evidence missing')
  const readme = await request<{ content: string }>(`/api/tasks/${encodeURIComponent(task.id)}/file?path=README.md`)
  if (!readme.content.trim()) throw new Error('Expected a non-empty README.md from the Claude SDK task')
  const evidence = await request<{ valid: boolean }>(`/api/tasks/${encodeURIComponent(task.id)}/evidence`)
  if (!evidence.valid) throw new Error('Evidence chain verification failed')
  console.log(JSON.stringify({ taskId: task.id, status: task.status, executionBoundary: task.securityContext.executionBoundary, sessionRecorded: Boolean(task.securityContext.runtimeSessionId), evidenceValid: evidence.valid }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
