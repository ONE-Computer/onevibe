/**
 * Local ONEVibe Skills -> chat -> document proof.
 *
 * Uses an isolated API/data root and never publishes, calls Linear, or logs
 * provider credentials. When the API reports a ready Claude SDK provider, the
 * selected task uses that provider and proves real SDK materialization. When
 * Claude is not ready, the task uses the deterministic demo provider and the
 * script materializes the same pinned packs directly against the stopped local
 * store; that fallback is explicitly not presented as a Claude run.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { materializeTaskSkills, skillPackManifestFor } from '../server/skill-packs.js'
import type { RuntimeEvent, Task, TaskSnapshot, TaskSkill } from '../server/types.js'
import { TaskStore } from '../server/store.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const terminalStatuses = new Set(['completed', 'failed', 'cancelled'])
const selectedSkills: TaskSkill[] = ['document', 'security_review']
const startupTimeoutMs = 15_000
const turnTimeoutMs = Math.max(30_000, Number(process.env.ONEVIBE_SKILLS_E2E_TIMEOUT_MS ?? 5 * 60_000))
const providerEnvKeys = [
  'ONEVIBE_LITELLM_URL',
  'ONEVIBE_LITELLM_API_KEY',
  'ONEVIBE_LITELLM_MODEL',
  'ONEVIBE_CLAUDE_MODEL',
  'ONEVIBE_CLAUDE_MAX_TURNS',
  'ONEVIBE_CLAUDE_MAX_BUDGET_USD',
  'ONEVIBE_TURN_TIMEOUT_MS',
] as const

type ProviderState = { id: string; available: boolean; detail?: string }
type SkillManifest = Array<{ id: TaskSkill; version: number; title: string; sha256: string }>
type Api = { child: ReturnType<typeof spawn>; exited: Promise<void> }

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const redact = (value: string) => value
  .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
  .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]')

const availablePort = async () => new Promise<number>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    if (!address || typeof address === 'string') {
      probe.close()
      reject(new Error('Unable to discover a local API port'))
      return
    }
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}) => {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    throw new Error(`${pathname} could not be reached: ${redact(error instanceof Error ? error.message : 'network failure')}`)
  }
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  return { response, body }
}

const startApi = (dataDirectory: string, port: number): Api => {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? dataDirectory,
    TMPDIR: dataDirectory,
    LANG: 'C',
    NODE_ENV: 'test',
    ONEVIBE_DATA_DIR: dataDirectory,
    ONEVIBE_API_HOST: '127.0.0.1',
    ONEVIBE_API_PORT: String(port),
  }
  for (const key of providerEnvKeys) if (process.env[key]) env[key] = process.env[key]
  const child = spawn(process.execPath, [tsxEntry, serverEntry], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited }
}

const stopApi = async (api: Api | undefined) => {
  if (!api || api.child.exitCode !== null || api.child.signalCode !== null) return
  api.child.kill('SIGTERM')
  await Promise.race([api.exited, sleep(2_000)])
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL')
  await Promise.race([api.exited, sleep(1_000)])
}

const waitForHealth = async (baseUrl: string, api: Api) => {
  const deadline = Date.now() + startupTimeoutMs
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null || api.child.signalCode !== null) throw new Error('Isolated ONEVibe API exited before becoming healthy')
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.response.ok && health.body.status === 'healthy') return
    } catch { /* startup race */ }
    await sleep(100)
  }
  throw new Error('Isolated ONEVibe API did not become healthy within the startup deadline')
}

const waitForTerminal = async (baseUrl: string, taskId: string) => {
  const deadline = Date.now() + turnTimeoutMs
  let latest: TaskSnapshot | undefined
  while (Date.now() < deadline) {
    const result = await request<TaskSnapshot>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`)
    if (!result.response.ok) throw new Error(`Task lookup returned HTTP ${result.response.status}`)
    latest = result.body
    if (terminalStatuses.has(latest.status)) return latest
    await sleep(250)
  }
  throw new Error(`Task ${taskId} did not reach a terminal state before the deadline (last state: ${latest?.status ?? 'unknown'})`)
}

const file = async (baseUrl: string, taskId: string, filePath: string) => {
  const result = await request<{ path: string; content: string; contentHash: string }>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(filePath)}`)
  if (!result.response.ok) throw new Error(`Unable to read ${filePath}: HTTP ${result.response.status}`)
  return result.body
}

const skillEvent = (task: TaskSnapshot) => {
  const events = task.events.filter((event) => event.label === 'Versioned skill packs selected')
  assert.equal(events.length, 1, 'the selected task must emit one immutable skill manifest event')
  return events[0]!
}

const manifestFromEvent = (event: RuntimeEvent): SkillManifest => {
  assert.deepEqual(event.payload.permissionChange, false, 'skill selection must not change permissions')
  assert.equal(event.payload.materialization, 'provider_turn_workspace')
  assert.ok(Array.isArray(event.payload.skills), 'the skill event must include its pinned manifest')
  return event.payload.skills as SkillManifest
}

const assertMaterializedPacks = async (read: (filePath: string) => Promise<{ content: string }>, manifest: SkillManifest) => {
  const expectedPaths = manifest.map((skill) => `.claude/skills/${skill.id}/SKILL.md`).sort()
  for (const skill of manifest) {
    const materialized = await read(`.claude/skills/${skill.id}/SKILL.md`)
    assert.equal(createHash('sha256').update(materialized.content).digest('hex'), skill.sha256, `${skill.id} materialization must match its manifest digest`)
    assert.match(materialized.content, new RegExp(`^name: ${skill.id}$`, 'm'))
  }
  return expectedPaths
}

const main = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-skills-e2e-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  let api: Api | undefined = startApi(dataDirectory, port)
  try {
    await waitForHealth(baseUrl, api)
    const runtime = await request<{ providers: ProviderState[] }>(baseUrl, '/api/runtime')
    assert.equal(runtime.response.ok, true)
    const claude = runtime.body.providers.find((provider) => provider.id === 'claude_sdk')
    const claudeReady = claude?.available === true
    const provider: Task['provider'] = claudeReady ? 'claude_sdk' : 'demo'
    const expectedManifest = skillPackManifestFor(selectedSkills)

    for (const invalidSkills of [['document', 'not-a-skill'], ['document', '']] as string[][]) {
      const rejected = await request<{ error?: string }>(baseUrl, '/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          prompt: 'This task must be rejected before execution.', provider: 'demo', mode: 'document',
          projectId: 'project_onevibe', references: [], attachments: [], skills: invalidSkills,
        }),
      })
      assert.equal(rejected.response.status, 400, `invalid skill selection ${JSON.stringify(invalidSkills)} must fail closed`)
      assert.match(rejected.body.error ?? '', /Invalid|skills|enum/i)
    }

    const prompt = 'Create a governed document artifact for a local evidence review. Use only the task workspace, do not use network services or credentials, and do not publish anything. Include a concise Executive Summary and Provenance section in document.md.'
    const created = await request<Task>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt, provider, mode: 'document', projectId: 'project_onevibe', references: [], attachments: [], skills: selectedSkills }),
    })
    assert.equal(created.response.status, 201)
    const selectedTask = await waitForTerminal(baseUrl, created.body.id)
    assert.equal(selectedTask.status, 'completed', `${provider} selected task must complete`)
    assert.deepEqual(selectedTask.skills, selectedSkills)
    assert.ok(selectedTask.messages.some((message) => message.role === 'user' && message.content === prompt), 'the selected task must persist the simple chat user turn')
    assert.ok(selectedTask.messages.some((message) => message.role === 'assistant' && message.status === 'completed'), 'the selected task must persist a completed assistant turn')
    assert.ok(['document.md', 'document.json', 'index.html'].every((filePath) => selectedTask.files.some((file) => file.path === filePath)), 'the selected task must produce document-mode artifacts')

    const selectedEvent = skillEvent(selectedTask)
    const manifest = manifestFromEvent(selectedEvent)
    assert.deepEqual(manifest, expectedManifest, 'the event manifest must be the deterministic pinned manifest')
    assert.match(selectedEvent.eventHash, /^[a-f0-9]{64}$/)
    assert.match(selectedEvent.previousHash, /^(?:GENESIS|[a-f0-9]{64})$/)

    const evidenceBeforeRestart = await request<{ valid: boolean }>(baseUrl, `/api/tasks/${encodeURIComponent(selectedTask.id)}/evidence`)
    assert.equal(evidenceBeforeRestart.response.ok, true)
    assert.equal(evidenceBeforeRestart.body.valid, true)

    const selectedDemo = await request<Task>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Create a local document policy control comparison.', provider: 'demo', mode: 'document', projectId: 'project_onevibe', references: [], attachments: [], skills: selectedSkills }),
    })
    const unselectedDemo = await request<Task>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Create a local document policy control comparison.', provider: 'demo', mode: 'document', projectId: 'project_onevibe', references: [], attachments: [], skills: [] }),
    })
    const [selectedDemoTask, unselectedDemoTask] = await Promise.all([
      waitForTerminal(baseUrl, selectedDemo.body.id),
      waitForTerminal(baseUrl, unselectedDemo.body.id),
    ])
    assert.equal(selectedDemoTask.status, 'completed')
    assert.equal(unselectedDemoTask.status, 'completed')
    assert.deepEqual(
      { mode: selectedDemoTask.securityContext?.mode, gatewayEnforced: selectedDemoTask.securityContext?.gatewayEnforced, executionBoundary: selectedDemoTask.securityContext?.executionBoundary },
      { mode: unselectedDemoTask.securityContext?.mode, gatewayEnforced: unselectedDemoTask.securityContext?.gatewayEnforced, executionBoundary: unselectedDemoTask.securityContext?.executionBoundary },
      'skills must not alter the demo runtime security boundary',
    )
    const selectedPolicy = selectedDemoTask.events.find((event) => event.label === 'Workspace policy evaluated')
    const unselectedPolicy = unselectedDemoTask.events.find((event) => event.label === 'Workspace policy evaluated')
    assert.deepEqual(selectedPolicy?.payload, unselectedPolicy?.payload, 'skills must not alter the workspace policy decision')
    assert.equal(manifestFromEvent(skillEvent(selectedDemoTask)).length, selectedSkills.length)

    let materializationMode: 'claude_sdk' | 'deterministic_demo' = 'deterministic_demo'
    if (claudeReady) {
      materializationMode = 'claude_sdk'
      await assertMaterializedPacks((filePath) => file(baseUrl, selectedTask.id, filePath), manifest)
      assert.equal(selectedTask.events.find((event) => event.label === 'Claude skill packs materialized')?.payload.permissionChange, false)
    } else {
      // The API is stopped before opening the same SQLite/workspace root.
      // This is a deterministic materialization proof, never a Claude claim.
      await stopApi(api)
      api = undefined
      const store = new TaskStore(dataDirectory)
      await store.initialize()
      await materializeTaskSkills(store.getTask(selectedTask.id), store)
      await assertMaterializedPacks((filePath) => store.readWorkspaceFile(selectedTask.id, filePath).then((content) => ({ content })), manifest)
    }

    const eventHashBeforeRestart = selectedEvent.eventHash
    await stopApi(api)
    api = startApi(dataDirectory, port)
    await waitForHealth(baseUrl, api)
    const reopened = await request<TaskSnapshot>(baseUrl, `/api/tasks/${encodeURIComponent(selectedTask.id)}`)
    assert.equal(reopened.response.ok, true)
    assert.equal(reopened.body.status, 'completed')
    assert.deepEqual(reopened.body.skills, selectedSkills)
    const reopenedEvent = skillEvent(reopened.body)
    assert.equal(reopenedEvent.eventHash, eventHashBeforeRestart, 'the immutable skill event hash must survive API restart')
    assert.deepEqual(manifestFromEvent(reopenedEvent), expectedManifest)
    const evidenceAfterRestart = await request<{ valid: boolean }>(baseUrl, `/api/tasks/${encodeURIComponent(selectedTask.id)}/evidence`)
    assert.equal(evidenceAfterRestart.body.valid, true)
    const persistedPaths = (await request<{ files: Array<{ path: string }> }>(baseUrl, `/api/tasks/${encodeURIComponent(selectedTask.id)}/files`)).body.files.map((entry) => entry.path)
    const expectedPaths = expectedManifest.map((skill) => `.claude/skills/${skill.id}/SKILL.md`).sort()
    assert.deepEqual(persistedPaths.filter((filePath) => filePath.startsWith('.claude/skills/')).sort(), expectedPaths, 'only selected skill files may be materialized')
    await assertMaterializedPacks((filePath) => file(baseUrl, selectedTask.id, filePath), expectedManifest)

    console.log(JSON.stringify({
      taskId: selectedTask.id,
      provider,
      claudeProviderReady: claudeReady,
      materializationMode,
      selectedSkills,
      invalidSkillSelectionsRejected: 2,
      manifestEvent: { label: reopenedEvent.label, eventHash: reopenedEvent.eventHash, previousHash: reopenedEvent.previousHash, immutableAcrossRestart: reopenedEvent.eventHash === eventHashBeforeRestart },
      materializedSkillFiles: expectedPaths,
      selectedOnly: persistedPaths.filter((filePath) => filePath.startsWith('.claude/skills/')).sort().join('|') === expectedPaths.join('|'),
      permissionInvariant: true,
      evidenceChainValidAfterRestart: evidenceAfterRestart.body.valid,
      externalWrites: false,
      secretsLogged: false,
      limitation: claudeReady ? 'Claude SDK host-process proof; no ONEComputer/microVM isolation claim.' : 'Claude provider not ready; deterministic local-demo materialization proof only, with no Claude claim.',
    }, null, 2))
  } finally {
    await stopApi(api)
    await rm(dataDirectory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(redact(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
