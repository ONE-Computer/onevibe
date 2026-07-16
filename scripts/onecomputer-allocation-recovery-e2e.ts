/**
 * Controlled provider-recovery proof.
 *
 * The ONEComputer development provider must be started with the explicit,
 * non-production test hook that returns one generic 504 after it has
 * persisted the allocation. This harness then proves that ONEVibe records an
 * unknown lease, does not duplicate-create, reconciles by immutable identity
 * on the follow-up turn, and releases the recovered sandbox.
 */
const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')
const timeoutMs = Math.max(60_000, Number(process.env.ONEVIBE_E2E_TIMEOUT_MS ?? 20 * 60_000))

type Snapshot = {
  id: string
  status: string
  securityContext?: { sandboxId?: string; sandboxState?: string; executionBoundary?: string }
  events: Array<{ type: string; label?: string; payload: Record<string, unknown> }>
}

const request = async <T>(pathname: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
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
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`Task ${taskId} did not reach a terminal state within ${timeoutMs}ms (last state: ${latest?.status ?? 'unreadable'})`)
}

const main = async () => {
  const created = await request<{ id: string }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt: 'Create a concise README.md proving that this controlled recovery conversation completed. Do not publish or call external services.',
      provider: 'onecomputer', mode: 'general', projectId: 'project_onevibe', references: [], attachments: [], skills: ['security_review'],
    }),
  })
  const first = await waitForTerminalSnapshot(created.id)
  if (first.status !== 'failed') throw new Error(`Expected the injected first allocation response to fail, got ${first.status}`)
  if (first.securityContext?.sandboxState !== 'unknown') throw new Error(`Expected a fenced unknown sandbox state, got ${first.securityContext?.sandboxState ?? 'missing'}`)
  if (!first.events.some((event) => event.label === 'ONEComputer allocation outcome unknown' && event.payload.recovery === 'immutable_allocation_identity_required')) throw new Error('Recoverable unknown-allocation evidence is missing')

  await request(`/api/tasks/${encodeURIComponent(created.id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Recover the existing conversation sandbox using its allocation receipt, then complete the README task. Do not create a second sandbox.' }),
  })
  const recovered = await waitForTerminalSnapshot(created.id)
  if (recovered.status !== 'completed') throw new Error(`Recovery turn ended ${recovered.status}`)
  if (!recovered.securityContext?.sandboxId || recovered.securityContext.sandboxState !== 'started') throw new Error('Recovered turn did not reach a started sandbox')
  if (!recovered.events.some((event) => event.label === 'ONEComputer retained sandbox resumed' && event.payload.reused === true)) throw new Error('Recovery did not record retained-sandbox reuse')
  if (recovered.events.filter((event) => event.type === 'run_started').length !== 2) throw new Error('Expected exactly two provider turns without a duplicate allocation run')

  const release = await request<{ status: string }>(`/api/tasks/${encodeURIComponent(created.id)}/sandbox/release`, { method: 'POST' })
  if (release.status !== 'released') throw new Error(`Recovered sandbox cleanup ended ${release.status}`)

  console.log(JSON.stringify({
    taskId: created.id,
    firstTurn: first.status,
    firstSandboxState: first.securityContext?.sandboxState,
    recoveredTurn: recovered.status,
    recoveredSandboxId: recovered.securityContext.sandboxId,
    sameConversationRecovered: recovered.events.some((event) => event.label === 'ONEComputer retained sandbox resumed' && event.payload.reused === true),
    duplicateAllocationRuns: recovered.events.filter((event) => event.type === 'run_started').length - 2,
    cleanup: release.status,
  }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
