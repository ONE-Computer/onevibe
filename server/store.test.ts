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
})
