/**
 * Bounded Website generated-project proof.
 *
 * This uses the local demo runtime to create one Website task, extracts only
 * the portable app scaffold into a temporary directory, checks the existing
 * static artifact report plus the app/index.html and React entry contracts,
 * and runs the generated build only when its dependencies are locally
 * available. Pass --install (or set ONEVIBE_WEBSITE_BUILD_INSTALL=1) to allow
 * a bounded npm install inside the temporary directory.
 *
 * This is source/build evidence only. It does not open a browser, capture
 * generated-project screenshots, call Linear, or prove deployment safety.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STARTUP_TIMEOUT_MS = 15_000
const TASK_TIMEOUT_MS = 30_000
const INSTALL_TIMEOUT_MS = 45_000
const BUILD_TIMEOUT_MS = 30_000
const MAX_COMMAND_OUTPUT = 4_000

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverEntry = path.join(repoRoot, 'server', 'index.ts')
const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

type Task = { id: string; status: string }
type StaticCheck = { id: string; status: 'passed' | 'failed'; detail: string }
type BuildResult = {
  status: 'passed' | 'unavailable' | 'failed' | 'not-run'
  method: 'local-dependencies' | 'bounded-install' | 'not-run'
  detail: string
  output?: string
}

type ProofReport = {
  artifact: 'website'
  taskStatus: string
  staticChecks: StaticCheck[]
  build: BuildResult
  browserEvidence: 'not-run'
  limitation: string
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

const availablePort = async () => new Promise<number>((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    if (!address || typeof address === 'string') {
      probe.close()
      reject(new Error('Unable to discover a local API port'))
      return
    }
    probe.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const request = async <T>(baseUrl: string, pathname: string, init: RequestInit = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const body = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}${body.error ? `: ${body.error}` : ''}`)
  return body
}

const startApi = (dataDirectory: string, port: number) => {
  // Keep provider credentials and unrelated environment values out of the
  // isolated child. The demo route does not need any secret configuration.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: dataDirectory,
    TMPDIR: dataDirectory,
    LANG: 'C',
    NODE_ENV: 'test',
    ONEVIBE_DATA_DIR: dataDirectory,
    ONEVIBE_API_HOST: '127.0.0.1',
    ONEVIBE_API_PORT: String(port),
  }
  const child = spawn(process.execPath, [tsxEntry, serverEntry], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  return { child, exited }
}

const stopApi = async (api: ReturnType<typeof startApi>) => {
  if (api.child.exitCode !== null || api.child.signalCode !== null) return
  api.child.kill('SIGTERM')
  await Promise.race([api.exited, sleep(2_000)])
  if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL')
  await Promise.race([api.exited, sleep(1_000)])
}

const waitForHealth = async (baseUrl: string, api: ReturnType<typeof startApi>) => {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (api.child.exitCode !== null || api.child.signalCode !== null) throw new Error('Isolated ONEVibe API exited before becoming healthy')
    try {
      const health = await request<{ status: string }>(baseUrl, '/api/health')
      if (health.status === 'healthy') return
    } catch {
      // The server may still be loading the TypeScript entry point.
    }
    await sleep(100)
  }
  throw new Error('Isolated ONEVibe API did not become healthy within the startup deadline')
}

const waitForTerminal = async (baseUrl: string, taskId: string) => {
  const deadline = Date.now() + TASK_TIMEOUT_MS
  let latest = 'unknown'
  while (Date.now() < deadline) {
    const task = await request<Task>(baseUrl, `/api/tasks/${encodeURIComponent(taskId)}`)
    latest = task.status
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task
    await sleep(100)
  }
  throw new Error(`Website task did not reach a terminal state before the deadline (last state: ${latest})`)
}

const safeOutput = (value: string) => value
  .replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, '[REDACTED]')
  .slice(-MAX_COMMAND_OUTPUT)

const runCommand = async (command: string, args: string[], cwd: string, timeoutMs: number, env: NodeJS.ProcessEnv) => new Promise<{ code: number | null; timedOut: boolean; output: string }>((resolve) => {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const capture = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-MAX_COMMAND_OUTPUT) }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 1_000)
  }, timeoutMs)
  child.once('close', (code) => {
    clearTimeout(timer)
    resolve({ code, timedOut, output: safeOutput(output) })
  })
})

const localDependencies = (manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }) => {
  const names = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]
  return names.filter((name) => existsSync(path.join(repoRoot, 'node_modules', ...name.split('/'), 'package.json')))
}

const isolatedCommandEnv = (root: string): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH ?? '/usr/bin:/bin',
  HOME: root,
  TMPDIR: root,
  LANG: 'C',
  NODE_ENV: 'test',
  NPM_CONFIG_USERCONFIG: '/dev/null',
})

const runBuild = async (appDirectory: string, manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): Promise<BuildResult> => {
  const available = new Set(localDependencies(manifest))
  const missing = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]
    .filter((name) => !available.has(name))
  const installRequested = process.argv.includes('--install') || process.env.ONEVIBE_WEBSITE_BUILD_INSTALL === '1'
  const env = isolatedCommandEnv(appDirectory)

  if (missing.length > 0 && !installRequested) {
    return {
      status: 'unavailable', method: 'not-run',
      detail: `Required generated-project packages are not locally available (${missing.join(', ')}); external installation was not requested. Re-run with --install to permit a bounded temporary npm install.`,
    }
  }

  if (missing.length > 0) {
    const install = await runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], appDirectory, INSTALL_TIMEOUT_MS, env)
    if (install.timedOut || install.code !== 0) {
      return {
        status: 'unavailable', method: 'bounded-install',
        detail: install.timedOut ? `Temporary dependency installation exceeded ${INSTALL_TIMEOUT_MS}ms.` : `Temporary dependency installation exited with code ${install.code ?? 'unknown'}.`,
        output: install.output,
      }
    }
  } else {
    // Reuse only the already-installed repository tree; no files in the
    // repository are changed, and the symlink is removed with the temp root.
    await symlink(path.join(repoRoot, 'node_modules'), path.join(appDirectory, 'node_modules'), 'junction')
  }

  const build = await runCommand('npm', ['run', 'build'], appDirectory, BUILD_TIMEOUT_MS, env)
  if (build.timedOut) return { status: 'failed', method: missing.length > 0 ? 'bounded-install' : 'local-dependencies', detail: `Generated build exceeded ${BUILD_TIMEOUT_MS}ms.`, output: build.output }
  if (build.code !== 0) return { status: 'failed', method: missing.length > 0 ? 'bounded-install' : 'local-dependencies', detail: `Generated build exited with code ${build.code ?? 'unknown'}.`, output: build.output }

  const outputIndex = path.join(appDirectory, 'dist', 'index.html')
  try {
    const output = await readFile(outputIndex, 'utf8')
    if (!output.includes('<html')) throw new Error('dist/index.html does not contain an HTML document')
  } catch (error) {
    return { status: 'failed', method: missing.length > 0 ? 'bounded-install' : 'local-dependencies', detail: error instanceof Error ? error.message : 'Generated build did not produce dist/index.html', output: build.output }
  }
  return { status: 'passed', method: missing.length > 0 ? 'bounded-install' : 'local-dependencies', detail: 'Generated build completed and produced dist/index.html.', output: build.output }
}

const check = (checks: StaticCheck[], id: string, passed: boolean, detail: string) => checks.push({ id, status: passed ? 'passed' : 'failed', detail })

const main = async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-website-build-api-'))
  const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), 'onevibe-website-build-artifact-'))
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const api = startApi(dataDirectory, port)
  try {
    await waitForHealth(baseUrl, api)
    const created = await request<Task>(baseUrl, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Create a portable governed Website starter for local build proof. Do not use the network, credentials, browser automation, or external services.',
        provider: 'demo', mode: 'website', projectId: 'project_onevibe', references: [], attachments: [], skills: [],
      }),
    })
    const task = await waitForTerminal(baseUrl, created.id)
    if (task.status !== 'completed') throw new Error(`Website demo task ended ${task.status}; no artifact proof was recorded`)

    const files = ['app/package.json', 'app/index.html', 'app/src/main.tsx', 'app/src/App.tsx', 'app/src/styles.css', 'validation-report.json']
    const contents = new Map<string, string>()
    for (const filePath of files) {
      const response = await request<{ content: string }>(baseUrl, `/api/tasks/${encodeURIComponent(task.id)}/file?path=${encodeURIComponent(filePath)}`)
      contents.set(filePath, response.content)
      const destination = path.join(artifactDirectory, filePath)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, response.content, 'utf8')
    }

    const checks: StaticCheck[] = []
    const appIndex = contents.get('app/index.html') ?? ''
    const appEntry = contents.get('app/src/main.tsx') ?? ''
    const manifest = JSON.parse(contents.get('app/package.json') ?? '') as { scripts?: { build?: string }; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const validation = JSON.parse(contents.get('validation-report.json') ?? '') as { passed?: boolean; limitation?: string }
    check(checks, 'artifact:static-report', validation.passed === true, 'Existing server static artifact validation passed')
    check(checks, 'app:index-html', /<!doctype html>/i.test(appIndex) && /<html[^>]+lang=["']en["']/i.test(appIndex) && /name=["']viewport["']/i.test(appIndex) && /id=["']root["']/.test(appIndex), 'Portable app/index.html has doctype, language, viewport, and root contracts')
    check(checks, 'app:index-entry', /<script[^>]+type=["']module["'][^>]+src=["']\/src\/main\.tsx["']/.test(appIndex), 'Portable app/index.html points to /src/main.tsx as a module entry')
    check(checks, 'app:entry-contract', /from ['"]react['"]/.test(appEntry) && /from ['"]react-dom\/client['"]/.test(appEntry) && /import ['"]\.\/styles\.css['"]/.test(appEntry) && /from ['"]\.\/App['"]/.test(appEntry) && /createRoot\(document\.getElementById\(['"]root['"]\)!\)/.test(appEntry) && /\.render\(<App \/>\)/.test(appEntry), 'Portable React entry imports App/styles and renders into #root')
    check(checks, 'app:build-script', typeof manifest.scripts?.build === 'string' && manifest.scripts.build.length > 0, 'Portable app declares a build script')

    const finalReport: ProofReport = checks.some((item) => item.status === 'failed')
      ? { artifact: 'website', taskStatus: task.status, staticChecks: checks, build: { status: 'not-run', method: 'not-run', detail: 'Static contract checks failed; generated build was not attempted.' }, browserEvidence: 'not-run', limitation: validation.limitation ?? 'Static contract evidence only.' }
      : { artifact: 'website', taskStatus: task.status, staticChecks: checks, build: await runBuild(path.join(artifactDirectory, 'app'), manifest), browserEvidence: 'not-run', limitation: 'This proof covers generated source extraction, the existing static artifact report, and an optional bounded local/temporary build. It does not perform browser automation, generate browser evidence, inspect dependency provenance, or prove deployment safety.' }
    console.log(JSON.stringify(finalReport, null, 2))
    if (finalReport.build.status !== 'passed' || checks.some((item) => item.status === 'failed')) process.exitCode = 1
  } finally {
    await stopApi(api)
    await rm(dataDirectory, { recursive: true, force: true })
    await rm(artifactDirectory, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
