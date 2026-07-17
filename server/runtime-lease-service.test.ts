import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OneComputerClient } from './onecomputer-client.js'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))))

const setup = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'onevibe-runtime-service-'))
  roots.push(root)
  const { TaskStore } = await import('./store.js')
  const store = new TaskStore(root)
  await store.initialize()
  const task = await store.createTask('Retain one sandbox for this conversation', 'onecomputer')
  return { root, store, task }
}

describe('RuntimeLeaseService', () => {
  it('allocates once and reuses the same durable sandbox for the conversation', async () => {
    const { RuntimeLeaseService } = await import('./runtime-lease-service.js')
    const { store, task } = await setup()
    const client = {
      createSandbox: vi.fn(async () => ({ id: 'sandbox-1', state: 'provisioning', provider: 'kasm-local' })),
      getSandbox: vi.fn(async () => ({ id: 'sandbox-1', state: 'started', provider: 'kasm-local' })),
    } as unknown as OneComputerClient
    const service = new RuntimeLeaseService(store, client)

    const first = await service.acquire(task.id)
    const second = await service.acquire(task.id)

    expect(first.reused).toBe(false)
    expect(second).toMatchObject({ reused: true, lease: { id: first.lease.id, providerSandboxId: 'sandbox-1', generation: 1 } })
    expect(client.createSandbox).toHaveBeenCalledTimes(1)
    expect(client.getSandbox).toHaveBeenCalledWith('sandbox-1', undefined)
    await expect(store.listRuntimeLeases(task.id)).resolves.toHaveLength(1)
  })

  it('gives different conversations different sandbox identities', async () => {
    const { RuntimeLeaseService } = await import('./runtime-lease-service.js')
    const { store, task } = await setup()
    const other = await store.createTask('A separate conversation boundary', 'onecomputer')
    let index = 0
    const client = { createSandbox: vi.fn(async () => ({ id: `sandbox-${++index}`, state: 'started' })) } as unknown as OneComputerClient
    const service = new RuntimeLeaseService(store, client)

    const first = await service.acquire(task.id)
    const second = await service.acquire(other.id)

    expect(first.sandbox.id).not.toBe(second.sandbox.id)
    expect(first.lease.conversationId).toBe(task.id)
    expect(second.lease.conversationId).toBe(other.id)
  })

  it('fences an ambiguous create outcome and refuses a duplicate allocation', async () => {
    const { RuntimeLeaseService } = await import('./runtime-lease-service.js')
    const { store, task } = await setup()
    const client = {
      createSandbox: vi.fn(async () => { throw new Error('provider timeout') }),
      listSandboxes: vi.fn(async () => []),
    } as unknown as OneComputerClient
    const service = new RuntimeLeaseService(store, client)

    await expect(service.acquire(task.id)).rejects.toThrow('provider timeout')
    await expect(service.acquire(task.id)).rejects.toThrow('found no provider sandbox with a matching allocation identity')
    expect(client.createSandbox).toHaveBeenCalledTimes(1)
    await expect(store.findActiveRuntimeLease(task.id)).resolves.toMatchObject({ status: 'unknown', lastError: { code: 'ALLOCATION_OUTCOME_UNKNOWN' } })
  })

  it('reconciles an ambiguous allocation only with a provider allocation identity', async () => {
    const { RuntimeLeaseService } = await import('./runtime-lease-service.js')
    const { store, task } = await setup()
    const client = {
      createSandbox: vi.fn(async () => { throw new Error('provider timeout') }),
      listSandboxes: vi.fn(async () => [{ id: 'sandbox-recovered', allocationIdempotencyKey: 'placeholder' }]),
      getSandbox: vi.fn(async () => ({ id: 'sandbox-recovered', state: 'started' })),
    } as unknown as OneComputerClient
    const service = new RuntimeLeaseService(store, client)

    await expect(service.acquire(task.id)).rejects.toThrow('provider timeout')
    const unknown = await store.findActiveRuntimeLease(task.id)
    if (!unknown) throw new Error('Expected an unknown runtime lease')
    vi.mocked(client.listSandboxes).mockResolvedValue([{ id: 'sandbox-recovered', allocationIdempotencyKey: unknown.allocationIdempotencyKey }])

    const recovered = await service.reconcileUnknown(task.id)

    expect(recovered).toMatchObject({ reused: true, sandbox: { id: 'sandbox-recovered' }, lease: { status: 'ready', providerSandboxId: 'sandbox-recovered', lastError: null } })
    await expect(store.findActiveRuntimeLease(task.id)).resolves.toMatchObject({ status: 'ready', providerSandboxId: 'sandbox-recovered' })
    expect(client.createSandbox).toHaveBeenCalledTimes(1)
    expect(client.getSandbox).toHaveBeenCalledWith('sandbox-recovered', undefined)
  })

  it('refuses to guess when a provider does not return allocation identity', async () => {
    const { RuntimeLeaseService } = await import('./runtime-lease-service.js')
    const { store, task } = await setup()
    const client = {
      createSandbox: vi.fn(async () => { throw new Error('provider timeout') }),
      listSandboxes: vi.fn(async () => [{ id: 'sandbox-unlabeled', name: `onevibe-${task.id.slice(-8)}` }]),
    } as unknown as OneComputerClient
    const service = new RuntimeLeaseService(store, client)

    await expect(service.acquire(task.id)).rejects.toThrow('provider timeout')
    await expect(service.reconcileUnknown(task.id)).rejects.toThrow('found no provider sandbox with a matching allocation identity')
    expect(client.createSandbox).toHaveBeenCalledTimes(1)
  })

  it('releases explicitly and permits a fenced next generation', async () => {
    const { RuntimeLeaseService } = await import('./runtime-lease-service.js')
    const { store, task } = await setup()
    let index = 0
    const client = {
      createSandbox: vi.fn(async () => ({ id: `sandbox-${++index}`, state: 'started' })),
      deleteSandbox: vi.fn(async () => undefined),
    } as unknown as OneComputerClient
    const service = new RuntimeLeaseService(store, client)

    await service.acquire(task.id)
    const released = await service.release(task.id)
    const replacement = await service.acquire(task.id)

    expect(released).toMatchObject({ status: 'released', providerSandboxId: 'sandbox-1' })
    expect(client.deleteSandbox).toHaveBeenCalledWith('sandbox-1')
    expect(replacement).toMatchObject({ reused: false, lease: { generation: 2 }, sandbox: { id: 'sandbox-2' } })
  })
})
