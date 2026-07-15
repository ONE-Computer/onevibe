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
    expect(JSON.parse(await store.readWorkspaceFile(task.id, 'app/package.json'))).toMatchObject({
      scripts: { build: 'tsc -b && vite build', preview: 'vite preview' },
      devDependencies: { '@types/react': expect.any(String), '@types/react-dom': expect.any(String), '@vitejs/plugin-react': expect.any(String) },
    })
  })

  it('generates a playable interaction loop for game mode', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-game-mode-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Secure signal run', 'demo', 'game')
    await writeModeArtifacts(task, store)

    expect(await store.readWorkspaceFile(task.id, 'app/src/App.tsx')).toContain('catchSignal')
    expect(await store.readWorkspaceFile(task.id, 'app/src/styles.css')).toContain('.signal')
  })

  it('writes an explicit static validation report without claiming runtime verification', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-validation-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const { validateModeArtifacts } = await import('./artifact-validation.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Build a governed dashboard', 'demo', 'app')
    await store.writeWorkspaceFile(task.id, 'index.html', '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Dashboard</title></head><body><h1>Dashboard</h1></body></html>')
    await writeModeArtifacts(task, store)

    const validation = await validateModeArtifacts(task, store)

    expect(validation.passed).toBe(true)
    expect(validation.limitation).toContain('Static contract')
    expect(await store.readWorkspaceFile(task.id, 'validation-report.json')).toContain('app:build-script')
  })

  it('creates portable document and data-story artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-creation-modes-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const { validateModeArtifacts } = await import('./artifact-validation.js')
    const store = new TaskStore(root)
    await store.initialize()
    const document = await store.createTask('Draft a security brief', 'demo', 'document')
    await store.writeWorkspaceFile(document.id, 'index.html', '<html lang="en"><head><meta name="viewport"><title>Brief</title></head><body><h1>Brief</h1></body></html>')
    await writeModeArtifacts(document, store)
    const data = await store.createTask('Explain deployment throughput', 'demo', 'data')
    await store.writeWorkspaceFile(data.id, 'index.html', '<html lang="en"><head><meta name="viewport"><title>Data</title></head><body><h1>Data</h1></body></html>')
    await writeModeArtifacts(data, store)

    expect(await store.readWorkspaceFile(document.id, 'document.md')).toContain('## Provenance')
    expect(await store.readWorkspaceFile(data.id, 'data.csv')).toContain('Stage,Workspaces')
    expect((await validateModeArtifacts(document, store)).passed).toBe(true)
    expect((await validateModeArtifacts(data, store)).passed).toBe(true)
  })
})
