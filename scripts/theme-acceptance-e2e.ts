/**
 * Theme release-gate acceptance.
 *
 * The static half validates every checked-in reference profile and the
 * presentation-only/browser asset boundaries. When DATABASE_URL is supplied,
 * it delegates the authenticated owner/member/save/reset/restart proof to the
 * real Postgres HTTP harness rather than duplicating that test infrastructure.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseTenantThemeConfig, resolveTenantTheme } from '../server/theme-config.js'
import { validateReferenceThemeSeed } from './theme-seed.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = path.join(repoRoot, 'docs', 'fixtures', 'themes', 'reference-profiles.json')

const luminance = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (!match) return undefined
  const channels = [0, 1, 2].map((index) => Number.parseInt(match[1]!.slice(index * 2, index * 2 + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

const ratio = (foreground: string | undefined, background: string | undefined) => {
  if (!foreground || !background) return undefined
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  if (foregroundLuminance === undefined || backgroundLuminance === undefined) return undefined
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

const runPostgresProof = async () => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the persistence half of e2e:themes; apply reviewed migrations first')
  const tsxEntry = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxEntry, path.join(repoRoot, 'scripts', 'postgres-auth-http-e2e.ts')], { cwd: repoRoot, env: process.env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Postgres theme proof exited with ${code ?? signal}`)))
  })
}

const main = async () => {
  const raw = JSON.parse(await readFile(profilePath, 'utf8')) as unknown
  const themes = validateReferenceThemeSeed(raw)
  assert.equal(themes.length, 3, 'reference matrix must contain institutional, financial, and philanthropic profiles')
  assert.equal(new Set(themes.map((theme) => theme.tenantId)).size, themes.length, 'reference tenant IDs must be unique')
  const base = baseTenantThemeConfig()
  const configs = Object.fromEntries(themes.map((theme) => [theme.tenantId, theme]))
  const resolvedBase = resolveTenantTheme({ configs, base, sessionTenantId: 'missing', deploymentTenantId: 'missing', host: 'untrusted.example', hostTenantAllowList: {} })
  assert.equal(resolvedBase.source, 'base', 'unresolved scope must fall back to the base theme')
  const resolvedSession = resolveTenantTheme({ configs, base, sessionTenantId: themes[0]!.tenantId })
  assert.equal(resolvedSession.source, 'session', 'server-derived session scope must win')
  for (const theme of themes) {
    const contrast = { navRatio: ratio(theme.tokens?.colorNavText, theme.tokens?.colorNavBg), pageRatio: ratio(theme.tokens?.colorTextPrimary, theme.tokens?.colorBgPage) }
    assert.ok((contrast.navRatio ?? 0) >= 4.5, `${theme.tenantId} navigation contrast must meet 4.5:1`)
    assert.ok((contrast.pageRatio ?? 0) >= 4.5, `${theme.tenantId} page contrast must meet 4.5:1`)
    assert.ok((theme.homePage?.featureCards?.length ?? 0) <= 6, `${theme.tenantId} reference profile must fit the editor bound`)
    assert.equal(theme.tokens?.fontUi, 'Inter', `${theme.tenantId} must preserve the sans-serif reference contract`)
    const serialized = JSON.stringify(theme)
    assert.ok(!/<\/?(?:script|iframe|style)\b/i.test(serialized), `${theme.tenantId} must not contain executable markup`)
    assert.ok(!/(?:api[_-]?key|secret|password|token)\s*[:=]/i.test(serialized), `${theme.tenantId} must not contain credential-like fields`)
  }
  const [css, provider] = await Promise.all([
    readFile(path.join(repoRoot, 'src', 'index.css'), 'utf8'),
    readFile(path.join(repoRoot, 'src', 'components', 'ThemeProvider.tsx'), 'utf8'),
  ])
  assert.match(css, /prefers-reduced-motion\s*:\s*reduce/, 'production CSS must retain reduced-motion handling')
  assert.match(css, /tenant-feature-grid/, 'tenant feature cards must have a dedicated responsive surface')
  assert.match(provider, /credentials:\s*'omit'/, 'theme assets must not receive ambient credentials')
  assert.match(provider, /redirect:\s*'error'/, 'theme assets must fail closed on redirects')
  assert.match(provider, /2 \* 1024 \* 1024/, 'theme assets must retain the 2 MiB cap')
  await runPostgresProof()
  console.log(JSON.stringify({ valid: true, profiles: themes.map((theme) => theme.tenantId), staticChecks: ['base-fallback', 'server-scope-precedence', 'contrast', 'sans-serif', 'markup-boundary', 'reduced-motion', 'asset-boundary'], postgres: 'authenticated-owner-member-save-reset-restart-proof-passed' }, null, 2))
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })
