import { IdempotencyConflictError } from '../persistence/errors.js'
import type { FollowUpOperationRecord } from '../persistence/contracts.js'
import type { TaskStore } from '../store.js'
import type { Task } from '../types.js'
import type { TurnExecutor } from '../turn-executor.js'
import { bytesHash, contentHash, normalizedAttachmentName } from './schemas.js'

export interface FollowUpOpsDeps {
  store: TaskStore
  activeRuns: Map<string, AbortController>
  executeTask: TurnExecutor['executeTask']
  FOLLOW_UP_LEASE_MS: number
  FOLLOW_UP_WORKER_ID: string
}

export type FollowUpAttachmentInput = { name: string; mimeType: string; dataBase64: string }

export const createFollowUpOps = (deps: FollowUpOpsDeps) => {
  const { store, activeRuns, executeTask, FOLLOW_UP_LEASE_MS, FOLLOW_UP_WORKER_ID } = deps

  const followUpRequestHash = (taskId: string, prompt: string, input: Array<{ name: string; mimeType: string; dataBase64: string }>) => contentHash(JSON.stringify({
    taskId,
    prompt,
    attachments: input.map((attachment) => {
      const bytes = Buffer.from(attachment.dataBase64, 'base64')
      return { name: normalizedAttachmentName(attachment.name), mimeType: attachment.mimeType || 'application/octet-stream', size: bytes.byteLength, sha256: bytesHash(bytes) }
    }),
  }))
  const stageFollowUpAttachments = async (taskId: string, input: FollowUpAttachmentInput[], idempotencyKey?: string) => {
    if (!input.length) return []
    const task = store.getTask(taskId)
    if (task.attachments.length + input.length > 32) throw new RangeError('Conversation has reached the 32-file input limit')
    const decoded = input.map((attachment) => {
      const name = normalizedAttachmentName(attachment.name)
      if (!name || name === '.' || name === '..') throw new RangeError('Invalid attachment filename')
      const bytes = Buffer.from(attachment.dataBase64, 'base64')
      if (!bytes.length || bytes.byteLength > 256 * 1024) throw new RangeError('Each attachment must be between 1 byte and 256 KiB')
      return { name, mimeType: attachment.mimeType || 'application/octet-stream', bytes }
    })
    if (decoded.reduce((total, attachment) => total + attachment.bytes.byteLength, 0) > 1_000_000) throw new RangeError('Follow-up attachments exceed the 1 MiB turn limit')
    const requestPathPrefix = idempotencyKey ? `inputs/request-${contentHash(idempotencyKey).slice(0, 16)}` : undefined
    const attachments = decoded.map((attachment, index) => ({ name: attachment.name, path: requestPathPrefix ? `${requestPathPrefix}-${String(index + 1).padStart(2, '0')}-${attachment.name}` : `inputs/${String(task.attachments.length + index + 1).padStart(2, '0')}-${attachment.name}`, size: attachment.bytes.byteLength, mimeType: attachment.mimeType }))
    const existingPaths = new Set(task.attachments.map((attachment) => attachment.path))
    for (const attachment of attachments.filter((candidate) => existingPaths.has(candidate.path))) {
      const existing = task.attachments.find((candidate) => candidate.path === attachment.path)
      if (!existing || existing.name !== attachment.name || existing.size !== attachment.size || existing.mimeType !== attachment.mimeType) throw new IdempotencyConflictError(`Attachment path ${attachment.path} conflicts with the existing operation`)
    }
    await Promise.all(attachments.map(async (attachment, index) => {
      if (existingPaths.has(attachment.path)) {
        const currentBytes = await store.readWorkspaceBytes(taskId, attachment.path)
        if (bytesHash(currentBytes) !== bytesHash(decoded[index]!.bytes)) throw new IdempotencyConflictError(`Attachment bytes for ${attachment.path} conflict with the existing operation`)
        return
      }
      await store.writeWorkspaceBytes(taskId, attachment.path, decoded[index]!.bytes)
    }))
    if (process.env.NODE_ENV !== 'production' && process.env.ONEVIBE_TEST_CRASH_AFTER_FOLLOW_UP_ATTACHMENT_STAGE === 'true') {
      setImmediate(() => process.exit(99))
      await new Promise<void>(() => undefined)
    }
    const additions = attachments.filter((attachment) => !existingPaths.has(attachment.path))
    if (additions.length) await store.updateTask(taskId, { attachments: [...task.attachments, ...additions] })
    return attachments
  }
  const parseFollowUpOperationAttachments = (operation: FollowUpOperationRecord): FollowUpAttachmentInput[] => {
    let parsed: unknown
    try { parsed = JSON.parse(operation.attachmentsJson) } catch { throw new Error(`Follow-up operation ${operation.id} has invalid attachment state`) }
    if (!Array.isArray(parsed)) throw new Error(`Follow-up operation ${operation.id} has invalid attachment state`)
    return parsed.map((attachment) => {
      if (!attachment || typeof attachment !== 'object') throw new Error(`Follow-up operation ${operation.id} has invalid attachment state`)
      const candidate = attachment as Record<string, unknown>
      if (typeof candidate.name !== 'string' || typeof candidate.mimeType !== 'string' || typeof candidate.dataBase64 !== 'string') throw new Error(`Follow-up operation ${operation.id} has invalid attachment state`)
      return { name: candidate.name, mimeType: candidate.mimeType, dataBase64: candidate.dataBase64 }
    })
  }
  const operationResponse = (operation: FollowUpOperationRecord): Record<string, unknown> | undefined => {
    if (!operation.responseJson) return undefined
    try {
      const parsed = JSON.parse(operation.responseJson) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
    } catch { return undefined }
  }
  const operationAttachmentPaths = (task: Task, operation: FollowUpOperationRecord) => {
    const prefix = `inputs/request-${contentHash(operation.idempotencyKey).slice(0, 16)}-`
    return task.attachments.filter((attachment) => attachment.path.startsWith(prefix)).map((attachment) => attachment.path)
  }
  const materializeFollowUpOperation = async (operation: FollowUpOperationRecord): Promise<FollowUpOperationRecord> => {
    if (operation.state !== 'prepared') return operation
    try {
      const task = store.getTask(operation.taskId)
      const durableAttachments = await store.listFollowUpAttachments(operation.id)
      const attachmentInputs = durableAttachments.length
        ? durableAttachments.map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType, dataBase64: Buffer.from(attachment.content).toString('base64') }))
        : parseFollowUpOperationAttachments(operation)
      const attachments = await stageFollowUpAttachments(operation.taskId, attachmentInputs, operation.idempotencyKey)
      if (durableAttachments.length) await store.markFollowUpAttachmentsMaterialized(operation.id)
      const current = store.getTask(operation.taskId)
      const isActive = activeRuns.has(operation.taskId) || current.status === 'running' || current.status === 'pending'
      const attachmentPaths = attachments.map((attachment) => attachment.path)
      if (operation.executionMode === 'queued' && isActive) {
        const guidanceId = operation.guidanceId ?? `guidance_${contentHash(operation.id).slice(0, 24)}`
        const guidance = await store.queueGuidance(operation.taskId, operation.prompt, attachmentPaths, guidanceId, operation.id, operation.idempotencyKey)
        const accepted = { status: 'queued', taskId: operation.taskId, guidanceId: guidance.id, idempotencyKey: operation.idempotencyKey }
        return store.updateFollowUpOperation(operation, { state: 'ready', guidanceId: guidance.id, responseJson: JSON.stringify(accepted) })
      }
      await store.updateTask(operation.taskId, { status: 'pending' })
      const turnId = await store.beginTurn(operation.taskId, operation.prompt, task.provider, operation.idempotencyKey)
      const accepted = { status: 'queued', taskId: operation.taskId, turnId, idempotencyKey: operation.idempotencyKey }
      return store.updateFollowUpOperation(operation, { state: 'ready', turnId, responseJson: JSON.stringify(accepted) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await store.updateFollowUpOperation(operation, { state: 'failed', errorJson: JSON.stringify({ message, retryable: false }), completedAt: new Date().toISOString() }).catch(() => undefined)
      throw error
    }
  }
  const scheduleReadyFollowUpOperation = async (operation: FollowUpOperationRecord) => {
    if (operation.state !== 'ready') return
    const task = store.getTask(operation.taskId)
    let prompt = operation.prompt
    let continuation = true
    let attachmentPaths = operationAttachmentPaths(task, operation)
    if (operation.executionMode === 'queued' && operation.guidanceId) {
      const currentGuidance = task.queuedGuidance.find((guidance) => guidance.id === operation.guidanceId)
      const isActive = activeRuns.has(task.id) || task.status === 'running' || task.status === 'pending'
      if (currentGuidance && isActive) return
      if (currentGuidance) {
        const taken = await store.takeQueuedGuidance(task.id)
        if (taken?.id !== operation.guidanceId) return
        prompt = taken.prompt
        attachmentPaths = taken.attachmentPaths
      }
      await store.updateTask(task.id, { status: 'pending' })
    }
    const now = new Date().toISOString()
    const leaseExpiresAt = new Date(Date.now() + FOLLOW_UP_LEASE_MS).toISOString()
    const claimed = await store.claimFollowUpOperation(operation, FOLLOW_UP_WORKER_ID, now, leaseExpiresAt)
    if (!claimed) return
    setTimeout(() => executeTask(task.id, prompt, continuation, attachmentPaths, claimed.idempotencyKey, claimed.id), 25)
  }

  return { followUpRequestHash, stageFollowUpAttachments, operationResponse, materializeFollowUpOperation, scheduleReadyFollowUpOperation }
}

export type FollowUpOps = ReturnType<typeof createFollowUpOps>
