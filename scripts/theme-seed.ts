import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { tenantThemeConfigSchema, type TenantThemeConfig } from '../server/theme-config.js'

const fixtureRoot = path.resolve(process.cwd(), 'docs/fixtures/themes')

const assertFixturePath = (filePath: string) => {
  const resolved = path.resolve(filePath)
  const relative = path.relative(fixtureRoot, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Theme seed validation only accepts files under docs/fixtures/themes')
  return resolved
}

export const validateReferenceThemeSeed = (value: unknown): TenantThemeConfig[] => {
  const candidates = Array.isArray(value) ? value : [value]
  if (!candidates.length || candidates.length > 12) throw new RangeError('A reference theme seed must contain between one and twelve themes')
  return candidates.map((candidate) => {
    const config = tenantThemeConfigSchema.parse(candidate)
    if (!config.tenantId.startsWith('reference-')) throw new Error(`Theme ${config.tenantId} is not a non-production reference tenant`)
    const serialized = JSON.stringify(config).toLowerCase()
    if (/(?:api[_-]?key|secret|password|token)\s*[:=]/i.test(serialized)) throw new Error(`Theme ${config.tenantId} contains a credential-like field`)
    return config
  })
}

const main = async () => {
  const filePath = process.argv[2]
  if (!filePath) throw new Error('Usage: npm run theme:validate-seed -- docs/fixtures/themes/reference.json')
  const raw = await readFile(assertFixturePath(filePath), 'utf8')
  const themes = validateReferenceThemeSeed(JSON.parse(raw) as unknown)
  console.log(JSON.stringify({ valid: true, themes: themes.map(({ tenantId, schemaVersion }) => ({ tenantId, schemaVersion })) }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
