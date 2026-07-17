import { randomUUID } from 'node:crypto'
import type { OneComputerClient, OneComputerSandbox } from './onecomputer-client.js'
import type { RuntimeLeaseFence, RuntimeLeaseRecord } from './persistence/index.js'

export interface RuntimeLeaseStore {
  findActiveRuntimeLease(conversationId: string): Promise<RuntimeLeaseRecord | undefined>
  listRuntimeLeases(conversationId: string): Promise<RuntimeLeaseRecord[]>
  insertRuntimeLease(record: RuntimeLeaseRecord, expectedPreviousGeneration: number): Promise<void>
  transitionRuntimeLease(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord): Promise<void>
}

export type AcquiredRuntime = { lease: RuntimeLeaseRecord; sandbox: OneComputerSandbox; reused: boolean }

const allocationMatches = (sandbox: OneComputerSandbox, lease: RuntimeLeaseRecord): boolean => {
  const metadata = sandbox.metadata ?? {}
  return sandbox.allocationOperationId === lease.allocationOperationId
    || sandbox.allocationIdempotencyKey === lease.allocationIdempotencyKey
    || metadata.allocationOperationId === lease.allocationOperationId
    || metadata.allocationIdempotencyKey === lease.allocationIdempotencyKey
}

const fenceFor = (lease: RuntimeLeaseRecord): RuntimeLeaseFence => ({
  generation: lease.generation, status: lease.status, updatedAt: lease.updatedAt,
})

export class RuntimeLeaseService {
  constructor(
    private readonly store: RuntimeLeaseStore,
    private readonly client: OneComputerClient,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private timestampAfter(previous: string): string {
    const candidate = this.now()
    return candidate > previous ? candidate : new Date(Date.parse(previous) + 1).toISOString()
  }

  async acquire(conversationId: string, signal?: AbortSignal): Promise<AcquiredRuntime> {
    const active = await this.store.findActiveRuntimeLease(conversationId)
    if (active) {
      if (active.status === 'unknown') return this.reconcileUnknown(conversationId, signal)
      if (active.status !== 'ready' || !active.providerSandboxId) {
        throw new Error(`Conversation runtime lease requires reconciliation (status=${active.status})`)
      }
      return { lease: active, sandbox: await this.client.getSandbox(active.providerSandboxId, signal), reused: true }
    }

    const previous = (await this.store.listRuntimeLeases(conversationId)).at(-1)
    const generation = (previous?.generation ?? 0) + 1
    const createdAt = this.now()
    const suffix = randomUUID().replaceAll('-', '')
    const allocating: RuntimeLeaseRecord = {
      id: `lease_${suffix.slice(0, 20)}`,
      conversationId,
      generation,
      providerName: 'onecomputer',
      providerSandboxId: null,
      status: 'allocating',
      allocationOperationId: `allocate_${suffix}`,
      allocationIdempotencyKey: `conversation_${conversationId}_generation_${generation}`,
      createdAt,
      updatedAt: createdAt,
      readyAt: null,
      releaseRequestedAt: null,
      releasedAt: null,
      lastError: null,
    }
    await this.store.insertRuntimeLease(allocating, generation - 1)

    try {
      const sandbox = await this.client.createSandbox(`onevibe-${conversationId.slice(-8)}`, {
        allocationOperationId: allocating.allocationOperationId,
        allocationIdempotencyKey: allocating.allocationIdempotencyKey,
      }, signal)
      const readyAt = this.timestampAfter(allocating.updatedAt)
      const ready: RuntimeLeaseRecord = {
        ...allocating,
        providerSandboxId: sandbox.id,
        status: 'ready',
        updatedAt: readyAt,
        readyAt,
      }
      await this.store.transitionRuntimeLease(allocating.id, fenceFor(allocating), ready)
      return { lease: ready, sandbox, reused: false }
    } catch (error) {
      const failedAt = this.timestampAfter(allocating.updatedAt)
      const unknown: RuntimeLeaseRecord = {
        ...allocating,
        status: 'unknown',
        updatedAt: failedAt,
        lastError: { code: 'ALLOCATION_OUTCOME_UNKNOWN', category: 'transient', retryable: true, occurredAt: failedAt },
      }
      await this.store.transitionRuntimeLease(allocating.id, fenceFor(allocating), unknown)
      throw error
    }
  }

  /**
   * Recover an allocation whose create response was ambiguous. This is
   * intentionally fail-closed: a sandbox name is not an ownership proof, so
   * the provider must return an immutable allocation operation/key label.
   */
  async reconcileUnknown(conversationId: string, signal?: AbortSignal): Promise<AcquiredRuntime> {
    const active = await this.store.findActiveRuntimeLease(conversationId)
    if (!active || active.status !== 'unknown') {
      throw new Error(`Conversation runtime lease is not awaiting reconciliation (status=${active?.status ?? 'none'})`)
    }
    const candidates = (await this.client.listSandboxes(signal)).filter((sandbox) => allocationMatches(sandbox, active))
    if (candidates.length === 0) {
      throw new Error('Conversation runtime lease reconciliation found no provider sandbox with a matching allocation identity')
    }
    if (candidates.length > 1) {
      throw new Error('Conversation runtime lease reconciliation found multiple provider sandboxes with the same allocation identity')
    }
    const sandbox = await this.client.getSandbox(candidates[0]!.id, signal)
    const readyAt = this.timestampAfter(active.updatedAt)
    const ready: RuntimeLeaseRecord = {
      ...active,
      providerSandboxId: sandbox.id,
      status: 'ready',
      updatedAt: readyAt,
      readyAt,
      lastError: null,
    }
    await this.store.transitionRuntimeLease(active.id, fenceFor(active), ready)
    return { lease: ready, sandbox, reused: true }
  }

  async release(conversationId: string): Promise<RuntimeLeaseRecord | undefined> {
    const active = await this.store.findActiveRuntimeLease(conversationId)
    if (!active) return undefined
    if (active.status !== 'ready' || !active.providerSandboxId) {
      throw new Error(`Conversation runtime lease requires reconciliation before release (status=${active.status})`)
    }
    const requestedAt = this.timestampAfter(active.updatedAt)
    const releasing: RuntimeLeaseRecord = { ...active, status: 'releasing', updatedAt: requestedAt, releaseRequestedAt: requestedAt }
    await this.store.transitionRuntimeLease(active.id, fenceFor(active), releasing)
    try {
      await this.client.deleteSandbox(active.providerSandboxId)
      const releasedAt = this.timestampAfter(releasing.updatedAt)
      const released: RuntimeLeaseRecord = { ...releasing, status: 'released', updatedAt: releasedAt, releasedAt }
      await this.store.transitionRuntimeLease(active.id, fenceFor(releasing), released)
      return released
    } catch (error) {
      const failedAt = this.timestampAfter(releasing.updatedAt)
      const unknown: RuntimeLeaseRecord = {
        ...releasing,
        status: 'unknown',
        updatedAt: failedAt,
        lastError: { code: 'RELEASE_OUTCOME_UNKNOWN', category: 'transient', retryable: true, occurredAt: failedAt },
      }
      await this.store.transitionRuntimeLease(active.id, fenceFor(releasing), unknown)
      throw error
    }
  }
}
