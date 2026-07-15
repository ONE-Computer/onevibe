import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('mode artifacts', () => {
  it('creates a structured, interactive, downloadable slide deck', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-slides-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Brief senior management on ONEVibe', 'demo', 'slides')

    const files = await writeModeArtifacts(task, store)
    const pptx = await store.readWorkspaceBytes(task.id, 'deck.pptx')
    const outline = JSON.parse(await store.readWorkspaceFile(task.id, 'outline.json')) as unknown[]

    expect(files).toContain('deck.pptx')
    expect(pptx.subarray(0, 2).toString()).toBe('PK')
    expect(outline).toHaveLength(8)
    expect(await store.readWorkspaceFile(task.id, 'index.html')).toContain('id="next"')
  })

  it('generates a portable React and TypeScript scaffold for app modes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-app-mode-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed dashboard', 'demo', 'app')

    await writeModeArtifacts(task, store)

    expect(await store.readWorkspaceFile(task.id, 'app/src/App.tsx')).toContain('useState')
    expect(await store.readWorkspaceFile(task.id, 'app/vite.config.ts')).toContain('defineConfig')
    expect((await store.listWorkspaceFiles(task.id)).map((file) => file.path)).toContain('app/.gitignore')
  })
})
