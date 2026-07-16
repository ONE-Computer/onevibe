/**
 * Two-phase durable-state audit.
 *
 * 1. npm run e2e:restart-audit -- capture <task-id>
 * 2. restart the ONEVibe API without changing ONEVIBE_DATA_DIR
 * 3. npm run e2e:restart-audit -- verify <task-id>
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { credentialResidueFindings, type CredentialResidueFinding } from '../server/credential-residue-audit.js'

const baseUrl = (process.env.ONEVIBE_E2E_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')
const dataRoot = path.resolve(process.env.ONEVIBE_DATA_DIR ?? '.onevibe')
const [phase, taskId] = process.argv.slice(2)
if ((phase !== 'capture' && phase !== 'verify') || !taskId?.startsWith('task_')) {
  throw new Error('Usage: restart-residue-e2e.ts <capture|verify> <task-id>')
}

const requestJson = async <T>(pathname: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${pathname}`)
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`)
  return response.json() as Promise<T>
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const receiptPath = path.join(dataRoot, 'e2e-audits', `${taskId}.json`)

type TaskSnapshot = { status: string; activeRunId?: string; files?: Array<{ path: string; size?: number }> }

const observe = async () => {
  const [task, messages, evidence] = await Promise.all([
    requestJson<TaskSnapshot>(`/api/tasks/${encodeURIComponent(taskId)}`),
    requestJson<unknown>(`/api/tasks/${encodeURIComponent(taskId)}/messages`),
    requestJson<{ valid: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}/evidence`),
  ])
  if (task.status !== 'completed' || task.activeRunId) throw new Error('Restart audit requires a completed task with no active run')
  if (!evidence.valid) throw new Error('Evidence chain is invalid before restart comparison')
  const findings: CredentialResidueFinding[] = []
  findings.push(...credentialResidueFindings('task-api.json', Buffer.from(JSON.stringify(task))))
  findings.push(...credentialResidueFindings('messages-api.json', Buffer.from(JSON.stringify(messages))))
  for (const file of task.files ?? []) {
    if ((file.size ?? 0) > 1024 * 1024) continue
    const response = await fetch(`${baseUrl}/api/tasks/${encodeURIComponent(taskId)}/file?path=${encodeURIComponent(file.path)}&download=1`)
    if (!response.ok) throw new Error(`Unable to audit ${file.path}: HTTP ${response.status}`)
    findings.push(...credentialResidueFindings(file.path, new Uint8Array(await response.arrayBuffer())))
  }
  return { taskStatus: task.status, messageDigest: digest(messages), evidenceDigest: digest(evidence), evidenceValid: evidence.valid, findings }
}

const current = await observe()
if (current.findings.length) throw new Error(`Credential residue detectors fired: ${current.findings.map((item) => `${item.source}:${item.detector}`).join(', ')}`)

if (phase === 'capture') {
  await mkdir(path.dirname(receiptPath), { recursive: true })
  await writeFile(receiptPath, `${JSON.stringify({ version: 1, taskId, capturedAt: new Date().toISOString(), ...current }, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify({ phase, taskId, evidenceValid: true, residueFindings: 0, receiptPath }, null, 2))
} else {
  const before = JSON.parse(await readFile(receiptPath, 'utf8')) as typeof current & { taskId: string }
  if (before.taskId !== taskId || before.messageDigest !== current.messageDigest || before.evidenceDigest !== current.evidenceDigest) {
    throw new Error('Durable transcript or evidence digest changed across restart')
  }
  console.log(JSON.stringify({ phase, taskId, transcriptStable: true, evidenceStable: true, evidenceValid: true, residueFindings: 0 }, null, 2))
}
