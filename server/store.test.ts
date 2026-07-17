import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('TaskStore', () => {
  it('reports initialized local readiness and becomes not ready after close', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-readiness-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await expect(store.readiness()).resolves.toMatchObject({ ready: false, driver: 'sqlite' })
    await store.initialize()
    await expect(store.readiness()).resolves.toMatchObject({ ready: true, driver: 'sqlite' })
    await store.close()
    await expect(store.readiness()).resolves.toMatchObject({ ready: false, driver: 'sqlite' })
  })

  it('enforces owner scope for local tasks, projects, schedules, and MCP declarations', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-owner-scope-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const projectA = await store.createProject('A private workspace', '', 'user-a')
    const projectB = await store.createProject('B private workspace', '', 'user-b')
    const taskA = await store.createTask('A task', 'demo', 'chat', projectA.id, undefined, [], [], [], 'user-a')
    const taskB = await store.createTask('B task', 'demo', 'chat', projectB.id, undefined, [], [], [], 'user-b')
    await store.createSchedule({ name: 'A schedule', prompt: 'A prompt', provider: 'demo', mode: 'chat', projectId: projectA.id, intervalMinutes: 15 }, 'user-a')
    await store.createMcpConfig({ name: 'A tools', command: 'npx', args: [] }, 'user-a')
    await store.createMcpConfig({ name: 'B tools', command: 'npx', args: [] }, 'user-b')

    expect(store.listTasks('user-a').map((task) => task.id)).toEqual([taskA.id])
    expect(store.listProjects('user-a').map((project) => project.id)).toEqual([projectA.id])
    expect(store.listSchedules('user-a')).toHaveLength(1)
    expect((await store.listMcpConfigs('user-a')).map((config) => config.name)).toEqual(['A tools'])
    expect(store.listConversations({ ownerUserId: 'user-a' }).conversations.map((conversation) => conversation.id)).toEqual([taskA.id])
    expect(() => store.getTask(taskB.id, 'user-a')).toThrow('Task not found')
    expect(() => store.getProject(projectB.id, 'user-a')).toThrow('Project not found')
    await expect(store.moveTaskToProject(taskA.id, projectB.id, 'user-a')).rejects.toThrow('Project not found')
    await expect(store.updateTaskTags(taskB.id, ['cross-user'], 'user-a')).rejects.toThrow('Task not found')
  })

  it('validates organization membership and carries organization identity from projects to tasks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-organization-projects-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const organization = await store.createOrganization('Governed workspace', 'user-owner')
    const project = await store.createProject('Organization workspace', '', 'user-owner', organization.id)
    const task = await store.createTask('Organization task', 'demo', 'chat', project.id, undefined, [], [], [], 'user-owner')

    expect(project.organizationId).toBe(organization.id)
    expect(task.organizationId).toBe(organization.id)
    await expect(store.createProject('Rejected workspace', '', 'user-outsider', organization.id)).rejects.toThrow('does not exist for this user')
    await expect(store.createProject('Missing owner workspace', '', undefined, organization.id)).rejects.toThrow('require an owner')
  })

  it('persists governed MCP declarations without accepting secret material', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-mcp-config-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const created = await store.createMcpConfig({ name: 'Internal tools', command: 'npx', args: ['-y', '@example/mcp-server'] })
    expect(created).toMatchObject({ name: 'Internal tools', command: 'npx', args: ['-y', '@example/mcp-server'] })
    expect(await store.runtimeMcpConfigs()).toEqual([expect.objectContaining({ id: created.id, env: {}, command: 'npx' })])

    const reopened = new TaskStore(root)
    await reopened.initialize()
    expect(await reopened.listMcpConfigs()).toEqual([expect.objectContaining({ id: created.id, name: 'Internal tools', args: ['-y', '@example/mcp-server'] })])
    expect(await reopened.deleteMcpConfig(created.id)).toBe(true)
    expect(await reopened.listMcpConfigs()).toEqual([])
  })

  it('creates a task plan that carries the requested outcome into the scope step', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-plan-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a concise launch dashboard for the regional team', 'demo', 'app')
    expect(task.plan[0]?.title).toContain('Build a concise launch dashboard')
    expect(task.plan[1]?.title).toContain('architecture')
  })

  it('refines only the stable runtime plan titles and records the change in evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-runtime-plan-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Create an executive operating review', 'demo')
    await store.updateRuntimePlanTitles(task.id, [
      { id: 'scope', title: 'Frame the executive decision' },
      { id: 'workspace', title: 'Prepare the governed source set' },
      { id: 'build', title: 'Draft the operating review' },
      { id: 'verify', title: 'Validate claims and output' },
      { id: 'deliver', title: 'Package the review and evidence' },
    ])
    expect(store.getTask(task.id).plan.map((step) => step.id)).toEqual(['scope', 'workspace', 'build', 'verify', 'deliver'])
    expect(store.getTask(task.id).plan[0]?.title).toBe('Frame the executive decision')
    expect(store.listEvents(task.id).some((event) => event.label === 'Task plan refined by runtime')).toBe(true)
    await expect(store.updateRuntimePlanTitles(task.id, [{ id: 'build', title: 'Wrong order' }])).rejects.toThrow('Runtime plan')
  })

  it('updates a project governed brief durably', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-project-brief-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const project = await store.createProject('Policy project', 'Initial brief')
    const updated = await store.updateProjectContext(project.id, 'Require review for external publication.')
    expect(updated.context).toBe('Require review for external publication.')
    expect(store.getProject(project.id).context).toBe(updated.context)
  })

  it('creates an ordered tamper-evident event chain', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-store-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Create a governed workspace', 'demo')
    await store.appendEvent(task.id, { type: 'run_started', lane: 'control', payload: {} })
    await store.appendEvent(task.id, { type: 'run_completed', lane: 'control', payload: {} })
    expect(store.listEvents(task.id)).toHaveLength(2)
    expect(store.listEvents(task.id)[1]?.previousHash).toBe(store.listEvents(task.id)[0]?.eventHash)
    expect(store.verifyChain(task.id)).toBe(true)

    const reopened = new TaskStore(root)
    await reopened.initialize()
    expect(reopened.listEvents(task.id)).toEqual(store.listEvents(task.id))
    expect(reopened.verifyChain(task.id)).toBe(true)
  })

  it('serializes concurrent event appends through the durable sequence fence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-concurrent-events-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Append concurrent evidence', 'demo')
    await Promise.all(Array.from({ length: 24 }, (_, index) => store.appendEvent(task.id, {
      type: 'activity_delta', lane: 'control', label: `Checkpoint ${index}`, payload: { index },
    })))
    expect(store.listEvents(task.id).map((event) => event.sequence)).toEqual(Array.from({ length: 24 }, (_, index) => index))
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('atomically persists a native envelope with typed projections and redacts hidden reasoning', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-native-events-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Project native SDK events', 'claude_sdk')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const first = await store.ingestNativeEvent(task.id, {
      source: 'claude_agent_sdk', sourceEventId: 'sdk-0', sourceSequence: 0, nativeType: 'assistant',
      payload: { message: { content: [{ type: 'thinking', thinking: 'private reasoning' }] }, access_token: 'must-not-leak' },
      projections: [{ type: 'assistant_text_delta', lane: 'transcript', content: 'Visible answer', payload: { executionRoute: 'claude_agent_sdk' } }],
    })
    const replay = await store.ingestNativeEvent(task.id, {
      source: 'claude_agent_sdk', sourceEventId: 'sdk-0', sourceSequence: 0, nativeType: 'assistant',
      payload: { message: { content: [{ type: 'thinking', thinking: 'duplicate' }] } },
      projections: [{ type: 'assistant_text_delta', lane: 'transcript', content: 'Duplicate answer', payload: {} }],
    })
    expect(first.events).toHaveLength(1)
    expect(replay.events).toHaveLength(0)
    expect(store.listMessages(task.id).messages.at(-1)?.content).toBe('Visible answer')
    expect(JSON.stringify(store.listEvents(task.id))).not.toContain('private reasoning')
    expect(JSON.stringify(store.listEvents(task.id))).not.toContain('must-not-leak')
    expect(store.listEvents(task.id).at(-1)?.payload).toMatchObject({ nativeEventId: first.nativeEventId, nativeSource: 'claude_agent_sdk' })
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('imports legacy events once before treating SQLite as authoritative', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-legacy-events-'))
    temporaryRoots.push(root)
    const taskId = 'task_legacy_events'
    const taskRoot = path.join(root, 'tasks', taskId)
    await mkdir(taskRoot, { recursive: true })
    const createdAt = '2026-07-16T00:00:00.000Z'
    const unsigned = { taskId, sequence: 0, type: 'run_started', lane: 'control', payload: {}, createdAt, previousHash: 'GENESIS' }
    const event = { id: `${taskId}:event:0`, ...unsigned, eventHash: createHash('sha256').update(JSON.stringify(unsigned)).digest('hex') }
    await writeFile(path.join(taskRoot, 'task.json'), JSON.stringify({ id: taskId, title: 'Legacy event task', prompt: 'Legacy', provider: 'demo', createdAt, updatedAt: createdAt }))
    await writeFile(path.join(taskRoot, 'messages.json'), JSON.stringify([{ id: 'message-legacy', role: 'user', content: 'Legacy', status: 'completed', createdAt }]))
    await writeFile(path.join(taskRoot, 'events.json'), JSON.stringify([event]))

    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    expect(store.listEvents(taskId)).toEqual([event])
    expect(store.verifyChain(taskId)).toBe(true)
  })

  it('records durable plan-step timing and transition evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-plan-timing-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Time a governed task', 'demo')
    await store.setPlanStep(task.id, 'scope', 'running')
    await store.setPlanStep(task.id, 'scope', 'completed')
    const step = store.getTask(task.id).plan.find((candidate) => candidate.id === 'scope')

    expect(step).toMatchObject({ status: 'completed' })
    expect(step?.startedAt).toBeTruthy()
    expect(step?.completedAt).toBeTruthy()
    expect(store.listEvents(task.id).at(-1)?.payload).toMatchObject({ stepId: 'scope', status: 'completed' })
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('resets a completed plan when a new task turn begins while preserving evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-plan-reset-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Continue a governed task', 'demo')
    await store.setPlanStep(task.id, 'scope', 'completed')
    await store.beginTurn(task.id, 'Continue with the next revision', 'demo')
    expect(store.getTask(task.id).plan.every((step) => step.status === 'pending')).toBe(true)
    expect(store.listEvents(task.id).at(-1)?.label).toBe('Plan reset for new run')
  })

  it('projects typed presentation panels into immutable event evidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-presentations-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Render computer timeline', 'demo')
    const terminal = await store.appendEvent(task.id, { type: 'tool_call_completed', lane: 'activity', label: 'Run command', content: 'done', payload: {} })
    const screenshot = await store.appendEvent(task.id, { type: 'artifact_created', lane: 'artifact', label: 'X11 frame', content: 'evidence/frame.png', payload: { kind: 'visual_frame', uri: '/frame.png' } })
    const diff = await store.appendEvent(task.id, { type: 'artifact_updated', lane: 'artifact', label: 'Source updated', content: 'src/App.tsx', payload: {} })
    const deck = await store.appendEvent(task.id, { type: 'artifact_created', lane: 'artifact', label: 'Slide deck', content: 'deliverable/briefing.pptx', payload: {} })
    const pdfDeck = await store.appendEvent(task.id, { type: 'artifact_created', lane: 'artifact', label: 'Slide deck PDF', content: 'deck.pdf', payload: { kind: 'slide_deck' } })
    const approval = await store.appendEvent(task.id, { type: 'approval_requested', lane: 'approval', label: 'External wallet approval', content: 'Awaiting a signed decision', payload: {} })

    expect(terminal.payload.presentation).toMatchObject({ panel: 'terminal' })
    expect(screenshot.payload.presentation).toMatchObject({ panel: 'screenshot', uri: '/frame.png' })
    expect(diff.payload.presentation).toMatchObject({ panel: 'diff' })
    expect(deck.payload.presentation).toMatchObject({ panel: 'slide', artifactPath: 'deliverable/briefing.pptx' })
    expect(pdfDeck.payload.presentation).toMatchObject({ panel: 'slide', artifactPath: 'deck.pdf' })
    expect(approval.payload.presentation).toMatchObject({ panel: 'approval' })
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('binds durable event evidence to a run and clears the active run on completion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-run-evidence-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Run-bound evidence', 'demo')
    const runId = await store.beginTurn(task.id, task.prompt, task.provider)
    const started = await store.appendEvent(task.id, { type: 'run_started', lane: 'control', status: 'running', payload: {} })
    const completed = await store.appendEvent(task.id, { type: 'run_completed', lane: 'control', status: 'completed', payload: {} })

    expect(started.runId).toBe(runId)
    expect(completed.runId).toBe(runId)
    expect(store.getTask(task.id).activeRunId).toBeUndefined()
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('reuses a durable turn and its message pair when the execution request is replayed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-turn-replay-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Replay a governed execution request', 'demo')

    const firstTurn = await store.beginTurn(task.id, 'The original request.', task.provider, 'client-request-replay-1')
    await store.appendEvent(task.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'First answer', payload: {} })
    const replayedTurn = await store.beginTurn(task.id, 'A duplicate request must not append history.', task.provider, 'client-request-replay-1')

    expect(replayedTurn).toBe(firstTurn)
    expect(store.listMessages(task.id).messages).toHaveLength(2)
    expect(store.listMessages(task.id).messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(store.listMessages(task.id).messages[0]?.content).toBe('The original request.')
    expect(store.listMessages(task.id).messages[1]?.content).toBe('First answer')

    await store.appendEvent(task.id, { type: 'run_completed', lane: 'control', status: 'completed', payload: {} })
    expect(await store.beginTurn(task.id, 'A completed request replay.', task.provider, 'client-request-replay-1')).toBe(firstTurn)
    expect(store.getTask(task.id).activeRunId).toBeUndefined()
  })

  it('journals follow-up acceptance and replays the same operation without accepting a changed payload', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-follow-up-operation-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Journal a follow-up operation', 'demo')
    const attachmentsJson = JSON.stringify([{ name: 'brief.txt', mimeType: 'text/plain', dataBase64: Buffer.from('brief').toString('base64') }])

    const first = await store.createFollowUpOperation(task.id, 'follow-up-operation-1', 'a'.repeat(64), 'Continue the task.', attachmentsJson, 'immediate')
    const replay = await store.createFollowUpOperation(task.id, 'follow-up-operation-1', 'a'.repeat(64), 'Continue the task.', attachmentsJson, 'immediate')
    expect(first.claimed).toBe(true)
    expect(replay.claimed).toBe(false)
    expect(replay.operation.id).toBe(first.operation.id)
    const reservedAttachments = await store.listFollowUpAttachments(first.operation.id)
    expect(reservedAttachments).toHaveLength(1)
    expect(reservedAttachments[0]).toMatchObject({ state: 'reserved', name: 'brief.txt', size: 5 })
    expect(Buffer.from(reservedAttachments[0]!.content).toString('utf8')).toBe('brief')
    await expect(store.createFollowUpOperation(task.id, 'follow-up-operation-1', 'b'.repeat(64), 'Changed request.', attachmentsJson, 'immediate')).rejects.toThrow(/different request/)

    const ready = await store.updateFollowUpOperation(first.operation, { state: 'ready', responseJson: JSON.stringify({ status: 'queued', taskId: task.id }) })
    expect(ready.executionId).toMatch(/^execution_[a-f0-9]{32}$/)
    expect(ready.providerRequestId).toBe(`onevibe:${ready.executionId}`)
    const claimed = await store.claimFollowUpOperation(ready, 'worker-a', '2026-07-17T00:00:00.000Z', '2026-07-17T00:02:00.000Z')
    expect(claimed).toMatchObject({ state: 'running', leaseOwner: 'worker-a', attemptCount: 1, providerState: 'not_started' })
    const renewed = await store.renewFollowUpOperation(claimed!, 'worker-a', '2026-07-17T00:01:00.000Z', '2026-07-17T00:03:00.000Z')
    expect(renewed).toMatchObject({ state: 'running', leaseOwner: 'worker-a', leaseExpiresAt: '2026-07-17T00:03:00.000Z', attemptCount: 1 })
    await expect(store.renewFollowUpOperation(renewed!, 'worker-b', '2026-07-17T00:01:01.000Z', '2026-07-17T00:03:01.000Z')).resolves.toBeUndefined()
    await expect(store.claimFollowUpOperation(ready, 'worker-b', '2026-07-17T00:00:01.000Z', '2026-07-17T00:02:01.000Z')).resolves.toBeUndefined()
    const reopened = new TaskStore(root)
    await reopened.initialize()
    await expect(reopened.listRecoverableFollowUpOperations()).resolves.toEqual([expect.objectContaining({ id: ready.id, state: 'running', responseJson: JSON.stringify({ status: 'queued', taskId: task.id }), leaseOwner: 'worker-a', attemptCount: 1 })])
    await reopened.markFollowUpAttachmentsMaterialized(ready.id)
    await expect(reopened.listFollowUpAttachments(ready.id)).resolves.toEqual([expect.objectContaining({ state: 'materialized', sha256: '29a8825bd242f14386ee528d76e0e8f1e38f3c8c4047d7b2d6df7493368a17d0' })])
  })

  it.each(['running', 'waiting_for_user_input', 'waiting_for_approval'] as const)('reconciles a durable %s run after process restart', async (status) => {
    const root = await mkdtemp(path.join(tmpdir(), `onevibe-restart-${status}-`))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Recover a run after restart', 'demo')
    const runId = await store.beginTurn(task.id, task.prompt, task.provider)
    await store.appendEvent(task.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'Partial answer', payload: {} })
    await store.updateTask(task.id, { status })

    const reopened = new TaskStore(root)
    await reopened.initialize()

    const reconciled = reopened.getTask(task.id)
    const events = reopened.listEvents(task.id)
    const restartFailures = events.filter((event) => event.runId === runId && event.type === 'run_failed')
    expect(reconciled.status).toBe('failed')
    expect(reconciled.activeRunId).toBeUndefined()
    expect(restartFailures).toHaveLength(1)
    expect(restartFailures[0]?.payload).toEqual({ reason: 'process_restart_reconciliation', retryable: true })
    expect(reopened.listMessages(task.id).messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Partial answer', status: 'failed' })
    expect(reopened.verifyChain(task.id)).toBe(true)

    const eventCount = events.length
    const reopenedAgain = new TaskStore(root)
    await reopenedAgain.initialize()
    expect(reopenedAgain.listEvents(task.id)).toHaveLength(eventCount)
    expect(reopenedAgain.getTask(task.id).activeRunId).toBeUndefined()
    expect(reopenedAgain.verifyChain(task.id)).toBe(true)
  })

  it('does not reconcile an ordinary pending task without an active run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-restart-pending-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Remain pending after restart', 'demo')

    const reopened = new TaskStore(root)
    await reopened.initialize()

    expect(reopened.getTask(task.id).status).toBe('pending')
    expect(reopened.getTask(task.id).activeRunId).toBeUndefined()
    expect(reopened.listEvents(task.id)).toEqual([])
    expect(reopened.listMessages(task.id).messages).toEqual([])
  })

  it('makes retry acceptance idempotent and rejects key reuse for a different prompt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-retry-idempotency-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Retry an interrupted workspace', 'demo')
    await store.updateTask(task.id, { status: 'failed' })

    await expect(store.claimRetry(task.id, 'retry-key-1', 'Retry prompt')).resolves.toMatchObject({ claimed: true, state: 'pending' })
    await store.completeRetry(task.id, 'retry-key-1', { status: 'queued', taskId: task.id, retryKey: 'retry-key-1' })
    await expect(store.getRetry(task.id, 'retry-key-1')).resolves.toEqual({ state: 'completed', response: { status: 'queued', taskId: task.id, retryKey: 'retry-key-1' } })
    await expect(store.claimRetry(task.id, 'retry-key-1', 'Retry prompt')).resolves.toEqual({
      claimed: false, state: 'completed', response: { status: 'queued', taskId: task.id, retryKey: 'retry-key-1' },
    })
    await expect(store.claimRetry(task.id, 'retry-key-1', 'A different retry prompt')).rejects.toThrow()
  })

  it('rejects workspace traversal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-store-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Test path isolation', 'demo')
    expect(() => store.workspacePath(task.id, '../../outside.txt')).toThrow('Path escapes')
  })

  it('exports portable source with a verified evidence manifest', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-store-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Export a portable artifact', 'demo')
    await store.writeWorkspaceFile(task.id, 'index.html', '<h1>Portable</h1>')
    const project = store.getProject(task.projectId)
    const projectWithFile = await store.addProjectFile(project.id, { name: 'brief.md', mimeType: 'text/markdown', bytes: Buffer.from('Project context one.') })
    const projectPath = projectWithFile.files[0]!.path
    const projectBefore = await store.readProjectFile(project.id, projectPath)
    await store.updateProjectFile(project.id, projectPath, 'Project context two.', projectBefore.contentHash)
    await store.writeWorkspaceFile(task.id, 'inputs/private.txt', 'private input')
    await store.writeWorkspaceFile(task.id, 'evidence/frame.png', 'private evidence')
    await store.writeWorkspaceFile(task.id, 'misplaced-private.txt', 'private attachment outside its conventional directory')
    await store.updateTask(task.id, { attachments: [{ name: 'brief.txt', path: 'misplaced-private.txt', size: 52, mimeType: 'text/plain' }] })
    await store.appendEvent(task.id, { type: 'artifact_created', lane: 'artifact', payload: { path: 'index.html' } })
    const archive = unzipSync(await store.exportWorkspaceZip(task.id))
    expect(strFromU8(archive['index.html']!)).toContain('Portable')
    expect(archive['inputs/private.txt']).toBeUndefined()
    expect(archive['evidence/frame.png']).toBeUndefined()
    expect(archive['misplaced-private.txt']).toBeUndefined()
    expect((await store.listPublicWorkspaceFiles(task.id)).some((file) => file.path === 'misplaced-private.txt')).toBe(false)
    expect(strFromU8(archive[`project-knowledge/${projectPath}`]!)).toContain('Project context two.')
    expect(Object.keys(archive).some((entry) => entry.startsWith('project-knowledge/.history/'))).toBe(true)
    const evidence = JSON.parse(strFromU8(archive['ONEVIBE-EVIDENCE.json']!)) as { chainValid: boolean }
    expect(evidence.chainValid).toBe(true)
    const handoff = strFromU8(archive['GITHUB-HANDOFF.md']!)
    expect(handoff).toContain('GitHub handoff')
    expect(handoff).toContain('valid at export')
    expect(handoff).toContain('does not create a repository')
  })

  it('captures and restores immutable workspace versions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-versions-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Version a generated artifact', 'demo')
    await store.writeWorkspaceFile(task.id, 'index.html', '<h1>Version one</h1>')
    const version = await store.createWorkspaceVersion(task.id, 'Initial version')
    await store.writeWorkspaceFile(task.id, 'index.html', '<h1>Version two</h1>')
    await store.writeWorkspaceFile(task.id, 'README.md', '# Added after version one')

    const comparison = await store.compareWorkspaceVersion(task.id, version!.id)
    expect(comparison.summary).toEqual({ added: 1, changed: 1, removed: 0 })
    expect(comparison.changes.map((change) => `${change.status}:${change.path}`)).toEqual(['changed:index.html', 'added:README.md'])
    expect(comparison.changes.every((change) => !('content' in change))).toBe(true)

    expect(version).not.toBeNull()
    await store.restoreWorkspaceVersion(task.id, version!.id)

    expect(await store.readWorkspaceFile(task.id, 'index.html')).toContain('Version one')
    expect(await store.listWorkspaceVersions(task.id)).toHaveLength(1)
  })

  it('copies a workspace without sharing mutable files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-copy-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const source = await store.createTask('Create the source artifact', 'demo')
    const target = await store.createTask('Copy the source artifact', 'demo')
    await store.writeWorkspaceFile(source.id, 'artifact.md', 'original')

    expect(await store.copyWorkspace(source.id, target.id)).toBe(1)
    await store.writeWorkspaceFile(target.id, 'artifact.md', 'changed copy')

    expect(await store.readWorkspaceFile(source.id, 'artifact.md')).toBe('original')
    expect(await store.readWorkspaceFile(target.id, 'artifact.md')).toBe('changed copy')
  })

  it('keeps copied work in its governed project context', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-copy-context-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const project = await store.createProject('Product diligence', 'Keep research inside this project.')
    const source = await store.createTask('Compare products', 'demo', 'research', project.id, undefined, ['https://example.com/product'])
    const copied = await store.createTask(`${source.title} — copy`, source.provider, source.mode, source.projectId, undefined, source.references)

    expect(copied.projectId).toBe(project.id)
    expect(copied.references).toEqual(source.references)
  })

  it('creates an independent conversation branch with truncated durable history', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-fork-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const source = await store.createTask('Original conversation', 'demo', 'chat')
    await store.appendStandaloneMessage(source.id, 'user', 'First question')
    await store.appendStandaloneMessage(source.id, 'assistant', 'First answer')
    const second = await store.appendStandaloneMessage(source.id, 'user', 'Second question')
    await store.appendStandaloneMessage(source.id, 'assistant', 'Second answer')
    await store.writeWorkspaceFile(source.id, 'notes.md', 'shared until branch time')
    await store.updateTask(source.id, { status: 'completed' })

    const fork = await store.forkTask(source.id, second.id, 'Edited second question')

    expect(fork.parentTaskId).toBe(source.id)
    expect(fork.forkedFromMessageId).toBe(second.id)
    expect(store.listMessages(fork.id).messages.map((message) => message.content)).toEqual(['First question', 'First answer'])
    expect(store.listEvents(fork.id).at(-1)?.payload).toMatchObject({ sourceTaskId: source.id, sourceMessageId: second.id, historyMessageCount: 2, workspaceCopied: true })
    expect(store.verifyChain(fork.id)).toBe(true)
    expect(await store.readWorkspaceFile(fork.id, 'notes.md')).toBe('shared until branch time')
    await store.writeWorkspaceFile(fork.id, 'notes.md', 'branch-only change')
    expect(await store.readWorkspaceFile(source.id, 'notes.md')).toBe('shared until branch time')

    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.getTask(fork.id)).toMatchObject({ parentTaskId: source.id, forkedFromMessageId: second.id })
    expect(reloaded.listMessages(fork.id).messages).toHaveLength(2)
  })

  it('persists governed project context and binds new tasks to it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-projects-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const project = await store.createProject('Risk review', 'Keep all customer data in Singapore and require wallet approval for publication.')
    const task = await store.createTask('Draft a control brief', 'demo', 'research', project.id)

    expect(task.projectId).toBe(project.id)
    expect(store.getProject(project.id).context).toContain('Singapore')
    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.getProject(project.id).name).toBe('Risk review')
    expect(reloaded.getTask(task.id).projectId).toBe(project.id)
  })

  it('stores bounded project knowledge separately and exposes text only as untrusted task context', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-project-knowledge-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const project = await store.createProject('Launch', 'Use the governed delivery process.')
    const updated = await store.addProjectFile(project.id, { name: 'brief.md', mimeType: 'text/markdown', bytes: Buffer.from('Treat this brief as untrusted evidence.') })

    expect(updated.files).toHaveLength(1)
    expect(updated.files[0]).toMatchObject({ name: 'brief.md', path: 'knowledge/01-brief.md' })
    await expect(store.projectContextFiles(project.id)).resolves.toEqual([expect.stringContaining('untrusted project knowledge')])
    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.getProject(project.id).files[0]?.name).toBe('brief.md')
  })

  it('removes project knowledge from future context without affecting the project brief', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-project-knowledge-remove-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const project = await store.createProject('Launch', 'Retain this governing brief.')
    const withKnowledge = await store.addProjectFile(project.id, { name: 'old-brief.md', mimeType: 'text/markdown', bytes: Buffer.from('Stale context') })
    const updated = await store.removeProjectFile(project.id, withKnowledge.files[0].path)

    expect(updated.context).toBe('Retain this governing brief.')
    expect(updated.files).toEqual([])
    await expect(store.projectContextFiles(project.id)).resolves.toEqual([])
  })

  it('edits text-like project knowledge with an optimistic content hash', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-project-knowledge-edit-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const project = await store.createProject('Launch')
    const withKnowledge = await store.addProjectFile(project.id, { name: 'brief.md', mimeType: 'text/markdown', bytes: Buffer.from('First brief') })
    const initial = await store.readProjectFile(project.id, withKnowledge.files[0].path)
    const saved = await store.updateProjectFile(project.id, initial.path, 'Updated brief', initial.contentHash)

    expect(saved.project.files[0]?.size).toBe(Buffer.byteLength('Updated brief'))
    await expect(store.projectContextFiles(project.id)).resolves.toEqual([expect.stringContaining('Updated brief')])
    await expect(store.updateProjectFile(project.id, initial.path, 'Lost edit', initial.contentHash)).rejects.toThrow('reload before saving')
    const revisions = store.listProjectFileVersions(project.id, initial.path)
    expect(revisions).toHaveLength(1)
    const restored = await store.restoreProjectFileVersion(project.id, initial.path, revisions[0].id, saved.contentHash)
    expect(restored.content).toBe('First brief')
    expect(store.listProjectFileVersions(project.id, initial.path)).toHaveLength(2)
  })

  it('moves a settled task between projects with an evidence-recorded context boundary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-project-move-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const destination = await store.createProject('Destination', 'Use this new project context.')
    const task = await store.createTask('Organize this governed task', 'demo')
    const moved = await store.moveTaskToProject(task.id, destination.id)

    expect(moved.projectId).toBe(destination.id)
    expect(store.listEvents(task.id).at(-1)).toMatchObject({ type: 'activity_delta', label: 'Task moved to project', payload: { fromProjectId: 'project_onevibe', toProjectId: destination.id, continuationContextChanged: true } })
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('normalizes bounded artifact tags and records only tag metadata in the control stream', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-task-tags-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Classify this governed artifact', 'demo')
    const tagged = await store.updateTaskTags(task.id, ['Security', 'executive-update', 'security'])

    expect(tagged.tags).toEqual(['security', 'executive-update'])
    expect(store.listEvents(task.id).at(-1)).toMatchObject({ type: 'activity_delta', label: 'Task tags updated', payload: { tags: ['security', 'executive-update'] } })
    await expect(store.updateTaskTags(task.id, ['not valid'])).rejects.toThrow('Task tags')
  })

  it('persists website references with task context', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-references-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Review this website', 'demo', 'website', 'project_onevibe', undefined, ['https://example.com/product'])

    expect(task.references).toEqual(['https://example.com/product'])
    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.getTask(task.id).references).toEqual(['https://example.com/product'])
  })

  it('persists explicit task skill guides independently of permissions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-skills-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Review the launch posture', 'demo', 'research', 'project_onevibe', undefined, [], [], ['research', 'security_review'])

    expect(task.skills).toEqual(['research', 'security_review'])
    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.getTask(task.id).skills).toEqual(['research', 'security_review'])
    expect((await reloaded.snapshot(task.id)).files).toEqual([])
  })

  it('lists completed reusable artifacts without exposing raw inputs or evidence frames', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-library-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Create a reusable artifact', 'demo')
    await store.writeWorkspaceFile(task.id, 'README.md', '# Reusable artifact')
    await store.writeWorkspaceFile(task.id, 'inputs/private.txt', 'do not list')
    await store.writeWorkspaceFile(task.id, 'evidence/visual/frame.png', 'do not list')
    await store.updateTask(task.id, { status: 'completed' })

    await expect(store.listLibrary()).resolves.toEqual([expect.objectContaining({ task: expect.objectContaining({ id: task.id }), files: [expect.objectContaining({ path: 'README.md' })] })])
  })

  it('hides a Library item without deleting its conversation or workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-library-hide-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Keep the source conversation', 'demo')
    await store.writeWorkspaceFile(task.id, 'README.md', '# Keep me')
    await store.updateTask(task.id, { status: 'completed' })

    expect(await store.hideLibraryItem(task.id)).toMatchObject({ id: task.id, libraryHiddenAt: expect.any(String) })
    expect(await store.listLibrary()).toEqual([])
    expect(store.getTask(task.id).status).toBe('completed')
    expect(await store.readWorkspaceFile(task.id, 'README.md')).toBe('# Keep me')
    expect(store.listEvents(task.id).at(-1)?.label).toBe('Library item hidden')

    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(await reloaded.listLibrary()).toEqual([])
    expect(await reloaded.readWorkspaceFile(task.id, 'README.md')).toBe('# Keep me')
  })

  it('persists queued guidance in the evidence chain and drains it in arrival order', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-guidance-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed workspace', 'demo')
    await store.beginTurn(task.id, task.prompt, task.provider)
    const first = await store.queueGuidance(task.id, 'Use a stronger executive summary.')
    await store.queueGuidance(task.id, 'Keep the artifact portable.')

    expect(store.getTask(task.id).queuedGuidance).toHaveLength(2)
    await expect(store.takeQueuedGuidance(task.id)).resolves.toMatchObject({ id: first.id, prompt: 'Use a stronger executive summary.' })
    expect(store.getTask(task.id).queuedGuidance).toEqual([expect.objectContaining({ prompt: 'Keep the artifact portable.' })])
    expect(store.listEvents(task.id).at(-1)).toMatchObject({ type: 'guidance_queued', payload: expect.objectContaining({ guidanceId: expect.any(String), promptLength: 27 }) })
    expect(store.verifyChain(task.id)).toBe(true)
  })

  it('lets a user retract queued guidance while retaining a metadata-only control event', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-guidance-cancel-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a report', 'demo')
    const guidance = await store.queueGuidance(task.id, 'Do not include the customer identifier.')
    await store.cancelQueuedGuidance(task.id, guidance.id)

    expect(store.getTask(task.id).queuedGuidance).toEqual([])
    const event = store.listEvents(task.id).at(-1)
    expect(event).toMatchObject({ type: 'guidance_cancelled', payload: { guidanceId: guidance.id, promptLength: guidance.prompt.length } })
    expect(JSON.stringify(event)).not.toContain(guidance.prompt)
  })

  it('persists metadata for path-confined task attachments', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-attachments-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const attachments = [{ name: 'brief.txt', path: 'inputs/01-brief.txt', size: 5, mimeType: 'text/plain' }]
    const task = await store.createTask('Review attached brief', 'demo', 'document', 'project_onevibe', undefined, [], attachments)
    await store.writeWorkspaceBytes(task.id, attachments[0]!.path, Buffer.from('hello'))

    expect(task.attachments).toEqual(attachments)
    expect(await store.readWorkspaceFile(task.id, attachments[0]!.path)).toBe('hello')
    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.getTask(task.id).attachments).toEqual(attachments)
  })

  it('claims due schedules once and advances their next governed run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-schedules-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const schedule = await store.createSchedule({ name: 'Daily review', prompt: 'Review pending approvals', provider: 'demo', mode: 'research', projectId: 'project_onevibe', intervalMinutes: 15 })
    const due = await store.claimDueSchedules(new Date(new Date(schedule.nextRunAt).getTime() + 1))

    expect(due).toHaveLength(1)
    expect(due[0]?.id).toBe(schedule.id)
    expect(store.listSchedules()[0]?.lastRunAt).toBeTruthy()
    expect(store.listSchedules()[0]?.nextRunAt > schedule.nextRunAt).toBe(true)
    expect(await store.claimDueSchedules(new Date(new Date(schedule.nextRunAt).getTime() + 1))).toHaveLength(0)
  })

  it('claims an enabled schedule immediately and advances its next run', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-schedule-now-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const schedule = await store.createSchedule({ name: 'Review now', prompt: 'Review the task queue', provider: 'demo', mode: 'research', projectId: 'project_onevibe', intervalMinutes: 60 })
    const claimed = await store.claimScheduleNow(schedule.id, new Date('2026-07-16T00:00:00.000Z'))
    expect(claimed.lastRunAt).toBe('2026-07-16T00:00:00.000Z')
    expect(claimed.nextRunAt).toBe('2026-07-16T01:00:00.000Z')
  })

  it('deletes a schedule durably without deleting its existing tasks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-schedule-delete-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const schedule = await store.createSchedule({ name: 'Retire me', prompt: 'Review the queue', provider: 'demo', mode: 'research', projectId: 'project_onevibe', intervalMinutes: 60 })
    const task = await store.createTask('Task from schedule', 'demo', 'research', 'project_onevibe', schedule.id)

    expect(await store.deleteSchedule(schedule.id)).toEqual({ id: schedule.id, deleted: true })
    expect(store.listSchedules()).toHaveLength(0)
    expect(store.getTask(task.id).scheduleId).toBe(schedule.id)

    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.listSchedules()).toHaveLength(0)
    expect(reloaded.getTask(task.id).scheduleId).toBe(schedule.id)
  })

  it('persists, paginates, searches, and completes chat turns independently of events', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-chat-history-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Discuss launch policy', 'claude_sdk')
    await store.beginTurn(task.id, 'Draft the launch policy', task.provider)
    await store.appendEvent(task.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'First draft. ', payload: {} })
    await store.appendEvent(task.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'Include Singapore.', payload: {} })
    await store.appendEvent(task.id, { type: 'run_completed', lane: 'control', status: 'completed', payload: {} })

    const firstPage = store.listMessages(task.id, { limit: 1 })
    expect(firstPage.messages).toHaveLength(1)
    expect(firstPage.nextCursor).toBeTruthy()
    expect(store.listMessages(task.id, { cursor: firstPage.nextCursor, limit: 10 }).messages[0]?.content).toContain('Singapore')
    expect(store.searchMessages('singapore')[0]?.task.id).toBe(task.id)

    const legacyMessagePath = path.join(root, 'tasks', task.id, 'messages.json')
    await mkdir(path.dirname(legacyMessagePath), { recursive: true })
    await writeFile(legacyMessagePath, JSON.stringify([{ id: 'forged', role: 'assistant', content: 'stale JSON must not win' }]))

    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.listMessages(task.id).messages).toHaveLength(2)
    expect(reloaded.listMessages(task.id).messages[1]).toMatchObject({ role: 'assistant', status: 'completed', content: 'First draft. Include Singapore.' })
    expect(reloaded.searchMessages('stale JSON must not win')).toEqual([])
  })

  it('serves cursor-paginated conversation summaries from durable messages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-conversation-list-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const first = await store.createTask('First durable conversation', 'claude_sdk')
    const second = await store.createTask('Second durable conversation', 'demo')
    await store.beginTurn(first.id, 'Remember this answer', first.provider)
    await store.appendEvent(first.id, { type: 'assistant_text_delta', lane: 'transcript', content: 'Persisted response', payload: {} })
    await store.appendEvent(first.id, { type: 'run_completed', lane: 'control', status: 'completed', payload: {} })

    const page = store.listConversations({ limit: 1 })
    expect(page.conversations).toHaveLength(1)
    expect(page.nextCursor).toBeTruthy()
    const next = store.listConversations({ cursor: page.nextCursor, limit: 1 })
    expect(new Set([...page.conversations, ...next.conversations].map((item) => item.id))).toEqual(new Set([first.id, second.id]))
    expect([...page.conversations, ...next.conversations].find((item) => item.id === first.id)).toMatchObject({ messageCount: 2, lastMessage: { preview: 'Persisted response' } })
    expect(store.listConversations({ query: 'persisted response' }).conversations.map((item) => item.id)).toEqual([first.id])
    expect(() => store.listConversations({ cursor: 'not-a-cursor' })).toThrow('cursor is invalid')

    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.listConversations().conversations.find((item) => item.id === first.id)).toMatchObject({ messageCount: 2, lastMessage: { preview: 'Persisted response' } })
  })

  it('binds staged files to queued guidance and removes them when guidance is cancelled', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-guidance-files-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Continue with an attached brief', 'demo')
    const attachment = { name: 'brief.txt', path: 'inputs/01-brief.txt', size: 5, mimeType: 'text/plain' }
    await store.writeWorkspaceBytes(task.id, attachment.path, Buffer.from('brief'))
    await store.updateTask(task.id, { attachments: [attachment], status: 'running' })
    const guidance = await store.queueGuidance(task.id, 'Use the brief', [attachment.path])
    expect(guidance.attachmentPaths).toEqual([attachment.path])
    await store.cancelQueuedGuidance(task.id, guidance.id)
    expect(store.getTask(task.id).attachments).toEqual([])
    expect((await store.listWorkspaceFiles(task.id)).some((file) => file.path === attachment.path)).toBe(false)
    expect(store.listEvents(task.id).at(-1)?.payload.removedAttachmentCount).toBe(1)
  })
})
