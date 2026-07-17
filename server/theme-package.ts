import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { tenantThemeConfigSchema } from './theme-config.js'

export const themePackageSlotSchema = z.enum([
  'sidebar.header', 'sidebar.footer', 'home.hero', 'home.below-cards', 'nav.right', 'task.toolbar.right',
])

// The host owns the route meaning and canonical path. A package can opt into
// one of these IDs, but cannot introduce or shadow an arbitrary URL.
export const themePackageRouteSchema = z.enum(['home', 'appearance', 'homepage', 'task'])

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest')
const packageName = z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 'Invalid package name')
const packageVersion = z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i, 'Package version must be semver')
const relativeAssetPath = z.string().trim().min(1).max(240).refine((value) => !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..'), 'Asset paths must be relative and traversal-free')
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_ENTRY_BYTES = 5 * 1024 * 1024

export const themePackageManifestSchema = z.object({
  contractVersion: z.literal(1),
  packageName,
  packageVersion,
  entryPath: relativeAssetPath,
  // This is cross-checked against the operator-only integrity pin below; a
  // digest declared only by a package is never treated as provenance.
  entrySha256: sha256,
  slots: z.array(themePackageSlotSchema).max(12).default([]),
  routes: z.array(themePackageRouteSchema).max(4).default([]),
  tokenDefaults: tenantThemeConfigSchema.shape.tokens.optional(),
}).strict()

export type ThemePackageManifest = z.infer<typeof themePackageManifestSchema>
export type ThemePackageLoadResult = { manifest: ThemePackageManifest; packageRoot: string; entryPath: string }

export const parseThemePackageManifest = (value: unknown): ThemePackageManifest => themePackageManifestSchema.parse(value)

export const parseAllowedThemePackages = (value: string | undefined): string[] => [...new Set((value ?? '').split(',').map((candidate) => candidate.trim()).filter(Boolean))]

export const selectAllowedThemePackage = (selected: string | undefined, allowed: string[]): string | null => {
  const value = selected?.trim()
  if (!value) return null
  if (!packageName.safeParse(value).success || !allowed.includes(value)) throw new Error(`Theme package '${value}' is not in the operator allow-list`)
  return value
}

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

export const verifyThemePackageIntegrity = (bytes: Uint8Array, expectedSha256: string) => sha256Hex(bytes).toLowerCase() === expectedSha256.toLowerCase()

const resolveInside = (root: string, relativePath: string) => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, relativePath)
  const relative = path.relative(resolvedRoot, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Theme package asset escapes its package root')
  return resolved
}

const readBoundedFile = async (filePath: string, maxBytes: number, label: string) => {
  const fileStats = await stat(filePath)
  if (!fileStats.isFile()) throw new Error(`${label} must be a regular file`)
  if (fileStats.size > maxBytes) throw new Error(`${label} exceeds the ${maxBytes}-byte limit`)
  return readFile(filePath)
}

const resolvePackageFile = async (root: string, relativePath: string, label: string) => {
  const lexicalPath = resolveInside(root, relativePath)
  const resolvedRoot = await realpath(root)
  const resolvedPath = await realpath(lexicalPath)
  const relative = path.relative(resolvedRoot, resolvedPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes its package root`)
  return resolvedPath
}

/**
 * Reads and verifies only operator-provided package metadata and bytes. It
 * intentionally does not import or execute package code; a later
 * static-build/CSP integration must consume this result.
 */
export const loadThemePackageManifest = async (environment: NodeJS.ProcessEnv = process.env): Promise<ThemePackageLoadResult | null> => {
  const selected = selectAllowedThemePackage(environment.ONEVIBE_THEME_PACKAGE, parseAllowedThemePackages(environment.ONEVIBE_ALLOWED_THEME_PACKAGES))
  if (!selected) return null
  const expectedVersion = environment.ONEVIBE_THEME_PACKAGE_VERSION?.trim()
  if (!expectedVersion || !packageVersion.safeParse(expectedVersion).success) throw new Error('ONEVIBE_THEME_PACKAGE_VERSION is required and must be semver')
  const expectedIntegrity = environment.ONEVIBE_THEME_PACKAGE_INTEGRITY?.trim()
  if (!expectedIntegrity || !sha256.safeParse(expectedIntegrity).success) throw new Error('ONEVIBE_THEME_PACKAGE_INTEGRITY is required and must be a SHA-256 digest')
  const manifestPathValue = environment.ONEVIBE_THEME_PACKAGE_MANIFEST?.trim()
  if (!manifestPathValue) throw new Error('ONEVIBE_THEME_PACKAGE_MANIFEST is required when a theme package is selected')
  const packageRoot = await realpath(path.resolve(environment.ONEVIBE_THEME_PACKAGE_ROOT?.trim() || path.dirname(manifestPathValue)))
  const manifestAbsolutePath = await realpath(path.resolve(manifestPathValue))
  const manifestPath = await resolvePackageFile(packageRoot, path.relative(packageRoot, manifestAbsolutePath), 'Theme package manifest')
  const manifestBytes = await readBoundedFile(manifestPath, MAX_MANIFEST_BYTES, 'Theme package manifest')
  const manifest = parseThemePackageManifest(JSON.parse(manifestBytes.toString('utf8')) as unknown)
  if (manifest.packageName !== selected) throw new Error(`Theme package manifest name '${manifest.packageName}' does not match the selected package`)
  if (manifest.packageVersion !== expectedVersion) throw new Error(`Theme package version '${manifest.packageVersion}' does not match the operator pin`)
  if (manifest.entrySha256.toLowerCase() !== expectedIntegrity.toLowerCase()) throw new Error('Theme package manifest digest does not match the operator integrity pin')
  const entryPath = await resolvePackageFile(packageRoot, manifest.entryPath, 'Theme package entry')
  const entryBytes = await readBoundedFile(entryPath, MAX_ENTRY_BYTES, 'Theme package entry')
  if (!verifyThemePackageIntegrity(entryBytes, manifest.entrySha256)) throw new Error('Theme package entry integrity check failed')
  return { manifest, packageRoot, entryPath }
}

export const themePackageTokenDefaults = (manifest: ThemePackageManifest): ThemePackageManifest['tokenDefaults'] => manifest.tokenDefaults
