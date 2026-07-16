import type { TaskStore } from './store.js'
import type { Task, TaskMode } from './types.js'
import { PDFDocument } from 'pdf-lib'
import { parseCsv } from '../src/lib/csv.js'

export type ArtifactCheck = {
  id: string
  status: 'passed' | 'failed' | 'skipped'
  detail: string
}

export type ArtifactValidation = {
  version: 2
  mode: TaskMode
  checkedAt: string
  passed: boolean
  checks: ArtifactCheck[]
  limitation: string
}

const required = async (store: TaskStore, taskId: string, filePath: string, checks: ArtifactCheck[]) => {
  try {
    const content = await store.readWorkspaceFile(taskId, filePath)
    checks.push({ id: `file:${filePath}`, status: 'passed', detail: `${filePath} exists` })
    return content
  } catch {
    checks.push({ id: `file:${filePath}`, status: 'failed', detail: `${filePath} is missing` })
    return undefined
  }
}

const check = (checks: ArtifactCheck[], id: string, pass: boolean, detail: string) => checks.push({ id, status: pass ? 'passed' : 'failed', detail })

export const validateModeArtifacts = async (task: Task, store: TaskStore): Promise<ArtifactValidation> => {
  const checks: ArtifactCheck[] = []
  // General tasks may intentionally deliver a Markdown, JSON, CSV, or code
  // artifact without pretending that a browser preview exists. Preview-backed
  // modes retain their explicit index.html contract below.
  const preview = task.mode === 'general' ? await store.readWorkspaceFile(task.id, 'index.html').catch(() => undefined) : await required(store, task.id, 'index.html', checks)
  if (preview) {
    check(checks, 'preview:language', /<html[^>]+lang=["']en["']/i.test(preview), 'Preview declares document language')
    check(checks, 'preview:viewport', /<meta[^>]+name=["']viewport["']/i.test(preview), 'Preview declares a responsive viewport')
    check(checks, 'preview:title', /<title>[^<]+<\/title>/i.test(preview), 'Preview declares a document title')
    check(checks, 'preview:heading', /<h1[\s>]/i.test(preview), 'Preview includes a primary heading')
    check(checks, 'preview:no-secrets', !/(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}/i.test(preview), 'Preview contains no obvious embedded credential')
  }
  if (task.mode === 'slides') {
    const outline = await required(store, task.id, 'outline.json', checks)
    await required(store, task.id, 'speaker-notes.md', checks)
    const deck = await store.readWorkspaceBytes(task.id, 'deck.pptx').catch(() => undefined)
    check(checks, 'slides:pptx', Boolean(deck?.subarray(0, 2).every((byte, index) => byte === [0x50, 0x4b][index])), 'Deck is a ZIP-based PPTX file')
    const pdf = await store.readWorkspaceBytes(task.id, 'deck.pdf').catch(() => undefined)
    let pdfPages = 0
    try { pdfPages = pdf ? (await PDFDocument.load(pdf)).getPageCount() : 0 } catch { /* recorded below */ }
    check(checks, 'slides:pdf', pdfPages === 8, 'Deck includes a parseable eight-page PDF export')
    let parsedOutline: unknown[] | undefined
    try { parsedOutline = outline ? JSON.parse(outline) as unknown[] : undefined } catch { /* recorded below */ }
    check(checks, 'slides:outline', Array.isArray(parsedOutline) && parsedOutline.length === 8, 'Deck outline has eight slides')
  }
  if (task.mode === 'general') {
    const files = await store.listWorkspaceFiles(task.id)
    const portable = files.filter((file) => !file.path.startsWith('.') && !file.path.startsWith('inputs/') && !file.path.startsWith('evidence/') && !['artifact-manifest.json', 'validation-report.json'].includes(file.path))
    check(checks, 'general:portable-output', portable.length > 0, 'General task produced at least one portable output')
  }
  if (task.mode === 'document') {
    const document = await required(store, task.id, 'document.md', checks)
    const metadata = await required(store, task.id, 'document.json', checks)
    const pdf = await store.readWorkspaceBytes(task.id, 'document.pdf').catch(() => undefined)
    let pdfPages = 0
    try { pdfPages = pdf ? (await PDFDocument.load(pdf)).getPageCount() : 0 } catch { /* recorded below */ }
    check(checks, 'document:pdf', pdfPages > 0, 'Document includes a parseable source-derived PDF export')
    check(checks, 'document:structure', Boolean(/^##\s+Executive summary\s*$/im.test(document ?? '') && /^##\s+Provenance\s*$/im.test(document ?? '')), 'Document has summary and provenance sections')
    try { JSON.parse(metadata ?? '') ; check(checks, 'document:metadata-json', true, 'Document metadata is valid JSON') } catch { check(checks, 'document:metadata-json', false, 'Document metadata is valid JSON') }
  }
  if (task.mode === 'research') {
    const report = await required(store, task.id, 'report.md', checks)
    const sources = await required(store, task.id, 'sources.json', checks)
    check(checks, 'research:findings', Boolean(report?.includes('## Findings')), 'Research report distinguishes findings')
    try { JSON.parse(sources ?? '') ; check(checks, 'research:sources-json', true, 'Sources manifest is valid JSON') } catch { check(checks, 'research:sources-json', false, 'Sources manifest is valid JSON') }
  }
  if (task.mode === 'data') {
    const csv = await required(store, task.id, 'data.csv', checks)
    const analysis = await required(store, task.id, 'analysis.json', checks)
    try {
      const parsed = parseCsv(csv ?? '')
      check(checks, 'data:rows', parsed.rowCount > 0, 'Dataset contains a header and at least one row')
      check(checks, 'data:columns', parsed.columnCount > 0, 'Dataset has a bounded schema')
    } catch (error) {
      check(checks, 'data:rows', false, error instanceof Error ? error.message : 'Dataset CSV could not be parsed')
      check(checks, 'data:columns', false, 'Dataset schema is unavailable because CSV parsing failed')
    }
    try {
      const parsed = JSON.parse(analysis ?? '') as { lineage?: unknown }
      check(checks, 'data:analysis-json', true, 'Analysis manifest is valid JSON')
      check(checks, 'data:lineage', Boolean(parsed && typeof parsed === 'object' && parsed.lineage), 'Analysis metadata records source lineage')
    } catch {
      check(checks, 'data:analysis-json', false, 'Analysis manifest is valid JSON')
      check(checks, 'data:lineage', false, 'Analysis metadata records source lineage')
    }
  }
  if (task.mode === 'design') {
    await required(store, task.id, 'ideas.md', checks)
    const directions = await required(store, task.id, 'design-directions.json', checks)
    const tokens = await required(store, task.id, 'design-tokens.json', checks)
    try { const parsed = JSON.parse(directions ?? '') as { directions?: unknown[] }; check(checks, 'design:directions-json', Array.isArray(parsed.directions) && parsed.directions.length >= 3, 'Design directions include at least three reviewable options') } catch { check(checks, 'design:directions-json', false, 'Design directions are valid JSON') }
    try { JSON.parse(tokens ?? '') ; check(checks, 'design:tokens-json', true, 'Design tokens are valid JSON') } catch { check(checks, 'design:tokens-json', false, 'Design tokens are valid JSON') }
  }
  if (task.mode === 'website' || task.mode === 'app' || task.mode === 'game') {
    const packageJson = await required(store, task.id, 'app/package.json', checks)
    const appIndex = await required(store, task.id, 'app/index.html', checks)
    const appSource = await required(store, task.id, 'app/src/App.tsx', checks)
    const appEntry = await required(store, task.id, 'app/src/main.tsx', checks)
    await required(store, task.id, 'app/src/vite-env.d.ts', checks)
    await required(store, task.id, 'app/vite.config.ts', checks)
    await required(store, task.id, 'app/tsconfig.json', checks)
    await required(store, task.id, 'app/.gitignore', checks)
    const button = await required(store, task.id, 'app/src/components/ui/Button.tsx', checks)
    const classNames = await required(store, task.id, 'app/src/lib/cn.ts', checks)
    const styles = await required(store, task.id, 'app/src/styles.css', checks)
    check(checks, 'app:root-landmark', /<main(?:\s|>)/.test(appSource ?? ''), 'Generated app contains a main landmark')
    check(checks, 'app:html-shell', Boolean(/<html[^>]+lang=["']en["']/i.test(appIndex ?? '') && /name=["']viewport["']/i.test(appIndex ?? '') && /id=["']root["']/.test(appIndex ?? '')), 'Generated app has a language, viewport, and root HTML shell')
    check(checks, 'app:entry-wiring', Boolean(/from ['"]\.\/App['"]/.test(appEntry ?? '') && /styles\.css/.test(appEntry ?? '')), 'Generated app entry wires the React root and styles')
    try {
      const manifest = JSON.parse(packageJson ?? '') as { scripts?: { build?: string; dev?: string; 'server:dev'?: string; 'server:check'?: string }; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      check(checks, 'app:build-script', Boolean(manifest.scripts?.build), 'Portable scaffold declares a build script')
      check(checks, 'app:dev-script', Boolean(manifest.scripts?.dev), 'Portable scaffold declares a development script')
      check(checks, 'app:portable-vite-contract', Boolean(manifest.dependencies?.react && manifest.dependencies['react-dom'] && manifest.devDependencies?.vite && manifest.devDependencies.typescript), 'Portable scaffold declares React, Vite, and TypeScript dependencies')
      check(checks, 'app:tailwind-vite-contract', Boolean(manifest.devDependencies?.tailwindcss && manifest.devDependencies?.['@tailwindcss/vite'] && /@import\s+["']tailwindcss["']/.test(styles ?? '')), 'Portable scaffold declares Tailwind with the Vite integration')
    } catch { check(checks, 'app:build-script', false, 'Portable scaffold declares a build script') }
    check(checks, 'app:component-foundation', Boolean(button?.includes('ButtonHTMLAttributes') && classNames?.includes('export const cn')), 'Portable scaffold includes a typed Button component and class-name helper')
    if (task.mode === 'website') {
      check(checks, 'website:semantic-navigation', /<nav(?:\s|>)/.test(appSource ?? '') && /<footer(?:\s|>)/.test(appSource ?? ''), 'Website includes navigation and footer landmarks')
      check(checks, 'website:faq-disclosure', /<details(?:\s|>)/.test(appSource ?? '') && /<summary(?:\s|>)/.test(appSource ?? ''), 'Website FAQ uses native disclosure semantics')
      check(checks, 'website:responsive-layout', /@media\s*\(max-width:/.test(styles ?? ''), 'Website includes a compact-screen layout')
      check(checks, 'website:reduced-motion', /prefers-reduced-motion/.test(styles ?? ''), 'Website respects reduced-motion preference')
      check(checks, 'website:keyboard-focus', /:focus-visible/.test(styles ?? ''), 'Website supplies a visible keyboard focus treatment')
    }
    if (task.mode === 'app') check(checks, 'app:stateful-interaction', /useState\s*\(/.test(appSource ?? ''), 'App scaffold includes a stateful interaction')
    if (task.mode === 'app') {
      const server = await required(store, task.id, 'app/server/src/index.ts', checks)
      const serverConfig = await required(store, task.id, 'app/server/tsconfig.json', checks)
      const shared = await required(store, task.id, 'app/src/shared/contracts.ts', checks)
      check(checks, 'app:typed-server-foundation', Boolean(server?.includes("createServer") && serverConfig?.includes('NodeNext') && shared?.includes('HealthResponse')), 'App scaffold includes a typed local server and shared contract')
    }
    if (task.mode === 'game') check(checks, 'game:playable-control', /onClick=/.test(appSource ?? '') && /catchSignal/.test(appSource ?? ''), 'Game scaffold includes an interactive control loop')
  }
  const validation: ArtifactValidation = {
    version: 2, mode: task.mode, checkedAt: new Date().toISOString(),
    passed: checks.every((item) => item.status !== 'failed'), checks,
    limitation: 'Static contract validation only. It does not execute generated code, perform browser automation, inspect third-party dependencies, or prove production deployment safety.',
  }
  await store.writeWorkspaceFile(task.id, 'validation-report.json', `${JSON.stringify(validation, null, 2)}\n`)
  return validation
}
