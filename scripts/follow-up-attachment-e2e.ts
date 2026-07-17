import assert from 'node:assert/strict'

const baseUrl = process.env.ONEVIBE_API_URL ?? 'http://127.0.0.1:4311'
const request = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${baseUrl}${path}`, init)
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `${path} returned HTTP ${response.status}`)
  return body
}
type Snapshot = {
  id: string
  status: string
  attachments: Array<{ name: string; path: string; size: number; mimeType: string }>
  files: Array<{ path: string; size: number }>
  messages: Array<{ turnId: string; role: string; content: string }>
  events: Array<{ runId?: string; type: string; payload: Record<string, unknown> }>
}

const waitForCompletion = async (taskId: string) => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const snapshot = await request<Snapshot>(`/api/tasks/${taskId}`)
    if (snapshot.status === 'completed') return snapshot
    if (snapshot.status === 'failed' || snapshot.status === 'cancelled') throw new Error(`Task ended as ${snapshot.status}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Task did not complete within 30 seconds')
}

const task = await request<{ id: string }>('/api/tasks', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Create a concise local attachment test workspace', provider: 'demo', mode: 'general', projectId: 'project_onevibe', references: [], attachments: [], skills: [] }),
})
await waitForCompletion(task.id)
const expectedContent = 'follow-up evidence'
const followUpBody = JSON.stringify({ prompt: 'Use the attached brief and confirm it remains in this conversation workspace.', idempotencyKey: 'follow-up-attachment-proof', attachments: [{ name: 'brief follow-up.txt', mimeType: 'text/plain', dataBase64: Buffer.from(expectedContent).toString('base64') }] })
const [firstFollowUp, replayFollowUp] = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/api/tasks/${task.id}/messages`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: followUpBody,
})))
assert.ok([200, 202].includes(firstFollowUp.status))
assert.ok([200, 202].includes(replayFollowUp.status))
const snapshot = await waitForCompletion(task.id)
const conflictingFollowUp = await fetch(`${baseUrl}/api/tasks/${task.id}/messages`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'A different request with the same key', idempotencyKey: 'follow-up-attachment-proof' }),
})
assert.equal(conflictingFollowUp.status, 409)
assert.equal(snapshot.messages.length, 4)
assert.equal(snapshot.attachments.length, 1)
const attachment = snapshot.attachments[0]!
assert.equal(attachment.name, 'brief_follow-up.txt')
assert.match(attachment.path, /^inputs\/(?:\d{2}|request-[a-f0-9]{16}-\d{2})-brief_follow-up\.txt$/)
const secondTurn = snapshot.messages.filter((message) => message.role === 'user')[1]?.turnId
assert.ok(secondTurn)
const evidence = snapshot.events.find((event) => event.runId === secondTurn && event.type === 'artifact_created' && event.payload.kind === 'task_input')
assert.ok(evidence, 'The follow-up file must be evidenced on the second turn')
assert.equal(snapshot.files.some((file) => file.path === attachment.path), false, 'Private attachment paths must not appear in public task files')
const privateRead = await fetch(`${baseUrl}/api/tasks/${task.id}/file?path=${encodeURIComponent(attachment.path)}`)
assert.equal(privateRead.status, 404, 'Private attachments must not be readable through the public file route')
console.log(JSON.stringify({ taskId: task.id, messageCount: snapshot.messages.length, attachmentPath: attachment.path, attachmentBytes: attachment.size, turnId: secondTurn, evidenceBound: true, privateAttachmentNotExposed: true, followUpIdempotency: true, concurrentStatuses: [firstFollowUp.status, replayFollowUp.status], conflictingKeyRejected: true }))
