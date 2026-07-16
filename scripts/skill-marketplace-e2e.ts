/**
 * Local marketplace contract proof.
 *
 * The catalog server is a loopback fixture that uses the same signed
 * GitHub-catalog shape as production. It proves install, SHA verification,
 * owner persistence, task selection, truthful demo evidence, and removal.
 * It does not claim that a remote GitHub deployment is reachable.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const skillId = 'meeting-brief'
const content = '---\nname: meeting-brief\ndescription: Meeting brief\nversion: 1\n---\n\n# Meeting brief\n\nKeep facts, decisions, owners, and open questions distinct.\n'
const sha256 = createHash('sha256').update(content).digest('hex')
const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const availablePort = async () => new Promise<number>((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') { server.close(); reject(new Error('No catalog port')); return }
    server.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const startCatalog = async () => {
  const port = await availablePort()
  const catalog = JSON.stringify({ skills: [{ id: skillId, version: 1, title: 'Meeting brief', summary: 'Evidence-aware brief', sha256, contentUrl: `http://127.0.0.1:${port}/skill.md`, sourceUrl: `http://127.0.0.1:${port}/catalog.json` }] })
  const server = createServer((request, response) => {
    if (request.url === '/catalog.json') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(catalog); return }
    if (request.url === '/skill.md') { response.writeHead(200, { 'Content-Type': 'text/markdown' }); response.end(content); return }
    response.writeHead(404); response.end()
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()) })
  return { server, url: `http://127.0.0.1:${port}/catalog.json` }
}

const startApi = async (dataRoot: string, port: number, catalogUrl: string) => {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dataRoot, TMPDIR: dataRoot, LANG: 'C', NODE_ENV: 'test', ONEVIBE_DATA_DIR: dataRoot, ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port), ONEVIBE_SKILL_CATALOG_URL: catalogUrl }
  const child = spawn(process.execPath, [tsxEntry, serverEntry], { cwd: repoRoot, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  const stop = async () => { if (child.exitCode !== null || child.signalCode !== null) return; child.kill('SIGTERM'); await Promise.race([exited, sleep(2_000)]); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await Promise.race([exited, sleep(1_000)]) }
  return { child, stop }
}

const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  return { response, body }
}

const waitForTask = async (baseUrl: string, taskId: string) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await request<{ status: string; events: Array<{ label?: string; payload: Record<string, unknown> }>; files: Array<{ path: string }> }>(baseUrl, `/api/tasks/${taskId}`)
    if (['completed', 'failed', 'cancelled'].includes(result.body.status)) return result.body
    await sleep(100)
  }
  throw new Error('Marketplace task did not settle')
}

const main = async () => {
  const catalog = await startCatalog()
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'onevibe-marketplace-e2e-'))
  const apiPort = await availablePort()
  const api = await startApi(dataRoot, apiPort, catalog.url)
  const baseUrl = `http://127.0.0.1:${apiPort}`
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { if ((await request<{ status: string }>(baseUrl, '/api/health')).body.status === 'healthy') break } catch { /* startup */ }
      await sleep(100)
      if (attempt === 99) throw new Error('ONEVibe API did not start')
    }
    const before = await request<{ skills: Array<{ id: string; source: string; installed: boolean }> }>(baseUrl, '/api/skills')
    const marketplaceBefore = before.body.skills.find((skill) => skill.id === skillId)
    assert.deepEqual(marketplaceBefore && { id: marketplaceBefore.id, source: marketplaceBefore.source, installed: marketplaceBefore.installed }, { id: skillId, source: 'marketplace', installed: false })
    const installed = await request<{ id: string; installed: boolean }>(baseUrl, '/api/skills/install', { method: 'POST', body: JSON.stringify({ skillId }) })
    assert.equal(installed.response.status, 201); assert.equal(installed.body.installed, true)
    const afterInstall = await request<{ skills: Array<{ id: string; installed: boolean }> }>(baseUrl, '/api/skills')
    assert.equal(afterInstall.body.skills.find((skill) => skill.id === skillId)?.installed, true)
    const created = await request<{ id: string }>(baseUrl, '/api/tasks', { method: 'POST', body: JSON.stringify({ prompt: 'Say hello briefly.', provider: 'demo', mode: 'chat', projectId: 'project_onevibe', references: [], attachments: [], skills: [skillId] }) })
    assert.equal(created.response.status, 201)
    const task = await waitForTask(baseUrl, created.body.id)
    assert.equal(task.status, 'completed')
    const selection = task.events.find((event) => event.label === 'Skill packs recorded for simulation')
    assert.equal(selection?.payload.materialization, 'not_executed_demo')
    assert.equal(task.files.some((file) => file.path.includes('.claude/skills')), false)
    const removed = await request<{ deleted: boolean }>(baseUrl, `/api/skills/${skillId}`, { method: 'DELETE' })
    assert.equal(removed.response.status, 200); assert.equal(removed.body.deleted, true)
    console.log(JSON.stringify({ catalog: 'loopback GitHub-shape fixture', skillId, installed: true, taskId: created.body.id, demoMaterialization: selection?.payload.materialization, demoSkillFiles: 0, removed: true }, null, 2))
  } finally {
    await api.stop(); await rm(dataRoot, { recursive: true, force: true }); await new Promise<void>((resolve) => catalog.server.close(() => resolve()))
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
