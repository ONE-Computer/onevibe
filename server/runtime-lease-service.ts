import { randomUUID } from 'node:crypto'
import type { OneComputerClient, OneComputerSandbox } from './onecomputer-client.js'
import type { RuntimeLeaseFence, RuntimeLeaseRecord } from './persistence/index.js'

export interface RuntimeLeaseStore {
  findActiveRuntimeLease(conversationId: string): RuntimeLeaseRecord | undefined
  listRuntimeLeases(conversationId: string): RuntimeLeaseRecord[]
  insertRuntimeLease(record: RuntimeLeaseRecord, expectedPreviousGeneration: number): void
  transitionRuntimeLease(id: string, expected: RuntimeLeaseFence, next: RuntimeLeaseRecord): void
}

export type AcquiredRuntime = { lease: RuntimeLeaseRecord; sandbox: OneComputerSandbox; reused: boolean }

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
    const active = this.store.findActiveRuntimeLease(conversationId)
    if (active) {
      if (active.status !== 'ready' || !active.providerSandboxId) {
        throw new Error(`Conversation runtime lease requires reconciliation (status=${active.status})`)
      }
      return { lease: active, sandbox: await this.client.getSandbox(active.providerSandboxId, signal), reused: true }
    }

    const previous = this.store.listRuntimeLeases(conversationId).at(-1)
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
    this.store.insertRuntimeLease(allocating, generation - 1)

    try {
      const sandbox = await this.client.createSandbox(`onevibe-${conversationId.slice(-8)}`, signal)
      const readyAt = this.timestampAfter(allocating.updatedAt)
      const ready: RuntimeLeaseRecord = {
        ...allocating,
        providerSandboxId: sandbox.id,
        status: 'ready',
        updatedAt: readyAt,
        readyAt,
      }
      this.store.transitionRuntimeLease(allocating.id, fenceFor(allocating), ready)
      return { lease: ready, sandbox, reused: false }
    } catch (error) {
      const failedAt = this.timestampAfter(allocating.updatedAt)
      const unknown: RuntimeLeaseRecord = {
        ...allocating,
        status: 'unknown',
        updatedAt: failedAt,
        lastError: { code: 'ALLOCATION_OUTCOME_UNKNOWN', category: 'transient', retryable: true, occurredAt: failedAt },
      }
      this.store.transitionRuntimeLease(allocating.id, fenceFor(allocating), unknown)
      throw error
    }
  }

  async release(conversationId: string): Promise<RuntimeLeaseRecord | undefined> {
    const active = this.store.findActiveRuntimeLease(conversationId)
    if (!active) return undefined
    if (active.status !== 'ready' || !active.providerSandboxId) {
      throw new Error(`Conversation runtime lease requires reconciliation before release (status=${active.status})`)
    }
    const requestedAt = this.timestampAfter(active.updatedAt)
    const releasing: RuntimeLeaseRecord = { ...active, status: 'releasing', updatedAt: requestedAt, releaseRequestedAt: requestedAt }
    this.store.transitionRuntimeLease(active.id, fenceFor(active), releasing)
    try {
      await this.client.deleteSandbox(active.providerSandboxId)
      const releasedAt = this.timestampAfter(releasing.updatedAt)
      const released: RuntimeLeaseRecord = { ...releasing, status: 'released', updatedAt: releasedAt, releasedAt }
      this.store.transitionRuntimeLease(active.id, fenceFor(releasing), released)
      return released
    } catch (error) {
      const failedAt = this.timestampAfter(releasing.updatedAt)
      const unknown: RuntimeLeaseRecord = {
        ...releasing,
        status: 'unknown',
        updatedAt: failedAt,
        lastError: { code: 'RELEASE_OUTCOME_UNKNOWN', category: 'transient', retryable: true, occurredAt: failedAt },
      }
      this.store.transitionRuntimeLease(active.id, fenceFor(releasing), unknown)
      throw error
    }
  }
}
