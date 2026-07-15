import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('TaskStore', () => {
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
    const approval = await store.appendEvent(task.id, { type: 'approval_requested', lane: 'approval', label: 'External wallet approval', content: 'Awaiting a signed decision', payload: {} })

    expect(terminal.payload.presentation).toMatchObject({ panel: 'terminal' })
    expect(screenshot.payload.presentation).toMatchObject({ panel: 'screenshot', uri: '/frame.png' })
    expect(diff.payload.presentation).toMatchObject({ panel: 'diff' })
    expect(deck.payload.presentation).toMatchObject({ panel: 'slide', artifactPath: 'deliverable/briefing.pptx' })
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
    await store.appendEvent(task.id, { type: 'artifact_created', lane: 'artifact', payload: { path: 'index.html' } })
    const archive = unzipSync(await store.exportWorkspaceZip(task.id))
    expect(strFromU8(archive['index.html']!)).toContain('Portable')
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

    const reloaded = new TaskStore(root)
    await reloaded.initialize()
    expect(reloaded.listMessages(task.id).messages).toHaveLength(2)
    expect(reloaded.listMessages(task.id).messages[1]).toMatchObject({ role: 'assistant', status: 'completed', content: 'First draft. Include Singapore.' })
  })
})
