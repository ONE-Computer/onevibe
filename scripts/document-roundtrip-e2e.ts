/**
 * Deterministic local HTTP proof for document source -> preview/PDF -> edit -> restore.
 * This uses the demo provider so it is safe to run without model credentials.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type Task = { id: string; status: string; files: Array<{ path: string }> }
type Version = { id: string; label: string }

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
  const response = await fetch(`${baseUrl}${pathname}`, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return { response, body }
}

const startApi = (dataDirectory: string, port: number) => {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? dataDirectory, TMPDIR: dataDirectory,
    LANG: 'C', NODE_ENV: 'test', ONEVIBE_DATA_DIR: dataDirectory, ONEVIBE_API_HOST: '127.0.0.1', ONEVIBE_API_PORT: String(port),
  }
  const child = spawn(process.execPath, [tsxEntry, serverEntry], { cwd: repoRoot, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited }
}

const stopApi = async (api: ReturnType<typeof startApi>) => {
  if (api.child.exitCode !== null || api.child.signalCode !== null) return
  api.child.kill('SIGTERM')
  await Promise.race([api.exited, sleep(2_000)])
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL')
  await Promise.race([api.exited, sleep(1_000)])
}

const waitForHealth = async (baseUrl: string, api: ReturnType<typeof startApi>) => {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null || api.child.signalCode !== null) throw new Error('Document E2E API exited before health')
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.body.status === 'healthy') return
    } catch { /* startup race */ }
    await sleep(100)
  }
  throw new Error('Document E2E API did not become healthy')
}

const waitForTerminal = async (baseUrl: string, taskId: string) => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const task = await request<Task>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`)
    if (['completed', 'failed', 'cancelled'].includes(task.body.status)) return task.body
    await sleep(100)
  }
  throw new Error(`Document task ${taskId} did not complete`) 
}

const file = async (baseUrl: string, taskId: string, filePath: string) => request<{ path: string; content: string; contentHash: string }>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(filePath)}`)
const bytes = async (baseUrl: string, taskId: string, filePath: string) => {
  const response = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(filePath)}&download=1`)
  if (!response.ok) throw new Error(`Unable to download ${filePath}: HTTP ${response.status}`)
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) }
}

const main = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-document-roundtrip-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const api = startApi(dataDirectory, port)
  try {
    await waitForHealth(baseUrl, api)
    const created = await request<Task>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Draft a governed document for source-derived review.', provider: 'demo', mode: 'document', projectId: 'project_onevibe', references: [], attachments: [], skills: [] }),
    })
    const task = await waitForTerminal(baseUrl, created.body.id)
    assert.equal(task.status, 'completed')
    const originalSource = await file(baseUrl, task.id, 'document.md')
    const originalPreview = await file(baseUrl, task.id, 'index.html')
    const originalPdf = await bytes(baseUrl, task.id, 'document.pdf')
    assert.equal(originalPdf.response.headers.get('content-type'), 'application/pdf')
    assert.equal(String.fromCharCode(...originalPdf.bytes.subarray(0, 5)), '%PDF-')

    const editedSource = `${originalSource.body.content}\n## Decision record\n\nThis section was edited through the governed API.\n`
    const edited = await request<{ contentHash: string }>(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/file?path=document.md`, {
      method: 'PUT', body: JSON.stringify({ content: editedSource, expectedHash: originalSource.body.contentHash }),
    })
    assert.notEqual(edited.body.contentHash, originalSource.body.contentHash)
    const editedPreview = await file(baseUrl, task.id, 'index.html')
    const editedPdf = await bytes(baseUrl, task.id, 'document.pdf')
    assert.match(editedPreview.body.content, /Decision record/)
    assert.notDeepEqual([...editedPdf.bytes], [...originalPdf.bytes])

    const versions = await request<{ versions: Version[] }>(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/versions`)
    const beforeEdit = versions.body.versions.find((version) => version.label === 'Before editing document.md')
    assert.ok(beforeEdit, 'the edit must create an immutable pre-edit version')
    await request(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/versions/${encodeURIComponent(beforeEdit.id)}/restore`, { method: 'POST' })
    const restoredSource = await file(baseUrl, task.id, 'document.md')
    const restoredPreview = await file(baseUrl, task.id, 'index.html')
    const restoredPdf = await bytes(baseUrl, task.id, 'document.pdf')
    assert.equal(restoredSource.body.contentHash, originalSource.body.contentHash)
    assert.equal(restoredPreview.body.contentHash, originalPreview.body.contentHash)
    assert.deepEqual([...restoredPdf.bytes], [...originalPdf.bytes])
    const evidence = await request<{ valid: boolean }>(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/evidence`)
    assert.equal(evidence.body.valid, true)
    console.log(JSON.stringify({ taskId: task.id, sourceRestored: true, previewRestored: true, pdfRestored: true, evidenceValid: true, contentType: originalPdf.response.headers.get('content-type') }, null, 2))
  } finally {
    await stopApi(api)
    await rm(dataDirectory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
