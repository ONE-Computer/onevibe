/** Real-provider cancellation and teardown proof. */
const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')
const timeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 5 * 60_000))

type Task = {
  id: string
  status: string
  securityContext?: { sandboxId?: string; sandboxState?: string }
  events: Array<{ type: string; label?: string; payload?: Record<string, unknown> }>
}

const request = async <T>(pathname: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}
const read = (id: string) => request<Task>(`/api/tasks/${encodeURIComponent(id)}`)
const waitFor = async (id: string, predicate: (task: Task) => boolean, label: string) => {
  const deadline = Date.now() + timeoutMs
  let task = await read(id)
  while (!predicate(task) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    task = await read(id)
  }
  if (!predicate(task)) throw new Error(`Timed out waiting for ${label}; last status ${task.status}`)
  return task
}

const created = await request<Task>('/api/tasks', {
  method: 'POST',
  body: JSON.stringify({
    prompt: 'Create a README.md only after the sandbox is ready. This task will be cancelled to prove teardown behavior.',
    provider: 'onecomputer', mode: 'general', projectId: 'project_onevibe', references: [], attachments: [], skills: ['security_review'],
  }),
})
const allocated = await waitFor(created.id, (task) => Boolean(task.securityContext?.sandboxId), 'provider sandbox allocation')
const sandboxId = allocated.securityContext!.sandboxId!
await request(`/api/tasks/${encodeURIComponent(created.id)}/cancel`, { method: 'POST' })
const cancelled = await waitFor(created.id, (task) => task.status === 'cancelled', 'cancelled terminal state')
if (!cancelled.events.some((event) => event.type === 'run_cancelled')) throw new Error('Cancellation evidence event missing')

let released: { status: string } | undefined
for (let attempt = 0; attempt < 20 && !released; attempt += 1) {
  try {
    released = await request<{ status: string }>(`/api/tasks/${encodeURIComponent(created.id)}/sandbox/release`, { method: 'POST' })
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('409')) throw error
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}
if (released?.status !== 'released') throw new Error(`Expected released sandbox lease, found ${released?.status ?? 'unavailable'}`)
const final = await read(created.id)
if (final.securityContext?.sandboxState !== 'destroyed') throw new Error('Released task did not record destroyed sandbox state')
if (!final.events.some((event) => event.label === 'Conversation sandbox released')) throw new Error('Sandbox release evidence missing')

console.log(JSON.stringify({ taskId: created.id, sandboxId, cancelled: true, cancellationEvidence: true, released: true, sandboxState: final.securityContext.sandboxState }, null, 2))
