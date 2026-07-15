import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
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
    expect(JSON.stringify(outline)).toContain('Brief senior management on ONEVibe')
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
    expect(await store.readWorkspaceFile(task.id, 'app/vite.config.ts')).toContain('@tailwindcss/vite')
    expect(await store.readWorkspaceFile(task.id, 'app/src/components/ui/Button.tsx')).toContain('ButtonHTMLAttributes')
    expect(await store.readWorkspaceFile(task.id, 'app/server/src/index.ts')).toContain("createServer")
    expect(await store.readWorkspaceFile(task.id, 'app/src/shared/contracts.ts')).toContain('HealthResponse')
    expect((await store.listWorkspaceFiles(task.id)).map((file) => file.path)).toContain('app/.gitignore')
    expect(JSON.parse(await store.readWorkspaceFile(task.id, 'app/package.json'))).toMatchObject({
      scripts: { build: 'tsc -b && vite build', preview: 'vite preview', 'server:dev': 'tsx server/src/index.ts' },
      devDependencies: { '@types/react': expect.any(String), '@types/react-dom': expect.any(String), '@tailwindcss/vite': expect.any(String), '@vitejs/plugin-react': expect.any(String), tailwindcss: expect.any(String) },
    })
  })

  it('runs the deterministic generated App server health endpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-app-server-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Run generated app server', 'demo', 'app')
    await writeModeArtifacts(task, store)
    const port = 48_000 + Math.floor(Math.random() * 1_000)
    const appRoot = store.workspacePath(task.id, 'app')
    const command = path.resolve(process.cwd(), 'node_modules/.bin/tsx')
    const child = spawn(command, ['server/src/index.ts'], { cwd: appRoot, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Generated app server did not start')), 5_000)
        child.once('error', (error) => { clearTimeout(timeout); reject(error) })
        child.stdout.on('data', (chunk: Buffer) => {
          if (!chunk.toString().includes('Generated app server listening')) return
          clearTimeout(timeout); resolve()
        })
        child.stderr.on('data', (chunk: Buffer) => { clearTimeout(timeout); reject(new Error(chunk.toString())) })
      })
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'onevibe-generated-app' })
    } finally {
      child.kill()
    }
  })

  it('uses app task intent for storefront and operations interactions', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-app-intent-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const store = new TaskStore(root)
    await store.initialize()
    const storefront = await store.createTask('Create an e-commerce storefront', 'demo', 'app')
    await writeModeArtifacts(storefront, store)
    expect(await store.readWorkspaceFile(storefront.id, 'app/src/App.tsx')).toContain('Add to cart')
    expect(await store.readWorkspaceFile(storefront.id, 'index.html')).toContain('Generated storefront preview')
    const dashboard = await store.createTask('Build an operations dashboard', 'demo', 'app')
    await writeModeArtifacts(dashboard, store)
    expect(await store.readWorkspaceFile(dashboard.id, 'app/src/App.tsx')).toContain('Focus review queue')
    expect(await store.readWorkspaceFile(dashboard.id, 'index.html')).toContain('Generated operations preview')
    const journey = await store.createTask('Prototype an internal workflow', 'demo', 'app')
    await writeModeArtifacts(journey, store)
    expect(await store.readWorkspaceFile(journey.id, 'app/src/App.tsx')).toContain('GOVERNED ROLE JOURNEY')
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

  it('generates reviewable design directions with labelled heuristic confidence', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-design-mode-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('Design a governed agent workspace', 'demo', 'design')
    await writeModeArtifacts(task, store)
    const directions = JSON.parse(await store.readWorkspaceFile(task.id, 'design-directions.json')) as { selectionMethod: string; directions: unknown[] }
    expect(directions.selectionMethod).toContain('heuristic')
    expect(directions.directions).toHaveLength(3)
    expect(await store.readWorkspaceFile(task.id, 'brand-mark.svg')).toContain('<svg')
    expect(await store.readWorkspaceFile(task.id, 'design-tokens.json')).toContain('oklch(')
  })

  it('generates a responsive website with an accessible FAQ interaction', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'onevibe-website-mode-'))
    temporaryRoots.push(root)
    const { TaskStore } = await import('./store.js')
    const { writeModeArtifacts } = await import('./mode-artifacts.js')
    const { validateModeArtifacts } = await import('./artifact-validation.js')
    const store = new TaskStore(root)
    await store.initialize()
    const task = await store.createTask('A secure home for enterprise agents', 'demo', 'website')
    await writeModeArtifacts(task, store)
    await store.writeWorkspaceFile(task.id, 'index.html', '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>Website</title></head><body><h1>Website</h1></body></html>')
    const validation = await validateModeArtifacts(task, store)

    expect(await store.readWorkspaceFile(task.id, 'app/src/App.tsx')).toContain('<details')
    expect(await store.readWorkspaceFile(task.id, 'app/src/App.tsx')).toContain('Workspace boundary active')
    expect(await store.readWorkspaceFile(task.id, 'app/src/styles.css')).toContain('@media(max-width:700px)')
    expect(validation.checks.find((check) => check.id === 'website:keyboard-focus')?.status).toBe('passed')
    expect(validation.checks.find((check) => check.id === 'website:faq-disclosure')?.status).toBe('passed')
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
