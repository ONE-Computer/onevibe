import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadThemePackageManifest, parseAllowedThemePackages, parseThemePackageManifest, selectAllowedThemePackage, sha256Hex, verifyThemePackageIntegrity } from './theme-package.js'

const entry = new TextEncoder().encode('export const manifest = { contractVersion: 1 }')

describe('deployment-time theme package contract', () => {
  it('accepts a bounded manifest and verifies its artifact digest', () => {
    const manifest = parseThemePackageManifest({ contractVersion: 1, packageName: '@onevibe/reference-theme', packageVersion: '1.2.3', entryPath: 'dist/theme.js', entrySha256: sha256Hex(entry), slots: ['home.hero'], routes: ['home'], tokenDefaults: { colorBrandPrimary: '#123456', fontUi: 'Inter' } })
    expect(manifest.packageName).toBe('@onevibe/reference-theme')
    expect(verifyThemePackageIntegrity(entry, manifest.entrySha256)).toBe(true)
    expect(verifyThemePackageIntegrity(new TextEncoder().encode('tampered'), manifest.entrySha256)).toBe(false)
  })

  it('rejects traversal, arbitrary routes, CSS artifacts, and unsafe package data', () => {
    expect(() => parseThemePackageManifest({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: '../theme.js', entrySha256: 'a'.repeat(64) })).toThrow()
    expect(() => parseThemePackageManifest({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: 'a'.repeat(64), cssPath: 'theme.css' })).toThrow()
    expect(() => parseThemePackageManifest({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: 'a'.repeat(64), routes: ['/impact'] })).toThrow()
    expect(() => parseThemePackageManifest({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: 'a'.repeat(64), tokenDefaults: { fontUi: 'Comic Sans' } })).toThrow()
  })

  it('uses exact operator allow-list selection and never treats an unlisted package as loadable', () => {
    expect(parseAllowedThemePackages('alpha, @scope/theme,alpha')).toEqual(['alpha', '@scope/theme'])
    expect(selectAllowedThemePackage(undefined, ['alpha'])).toBeNull()
    expect(selectAllowedThemePackage('@scope/theme', ['@scope/theme'])).toBe('@scope/theme')
    expect(() => selectAllowedThemePackage('attacker', ['alpha'])).toThrow(/allow-list/i)
  })

  it('loads only a digest-matching manifest from the operator-owned root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-theme-package-'))
    try {
      await writeFile(path.join(root, 'theme.js'), entry)
      const digest = sha256Hex(entry)
      await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: digest, slots: [], routes: [] }))
      const loaded = await loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: 'reference-theme', ONEVIBE_ALLOWED_THEME_PACKAGES: 'reference-theme', ONEVIBE_THEME_PACKAGE_VERSION: '1.0.0', ONEVIBE_THEME_PACKAGE_INTEGRITY: digest, ONEVIBE_THEME_PACKAGE_ROOT: root, ONEVIBE_THEME_PACKAGE_MANIFEST: path.join(root, 'manifest.json') })
      expect(loaded?.manifest.packageName).toBe('reference-theme')
      expect(loaded?.entryPath).toBe(await realpath(path.join(root, 'theme.js')))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('requires an operator integrity pin and does not accept package self-attestation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-theme-package-pin-'))
    try {
      await writeFile(path.join(root, 'theme.js'), entry)
      const digest = sha256Hex(entry)
      await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: digest, slots: [], routes: [] }))
      await expect(loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: 'reference-theme', ONEVIBE_ALLOWED_THEME_PACKAGES: 'reference-theme', ONEVIBE_THEME_PACKAGE_VERSION: '1.0.0', ONEVIBE_THEME_PACKAGE_INTEGRITY: 'b'.repeat(64), ONEVIBE_THEME_PACKAGE_ROOT: root, ONEVIBE_THEME_PACKAGE_MANIFEST: path.join(root, 'manifest.json') })).rejects.toThrow(/operator integrity pin/i)
      await expect(loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: 'reference-theme', ONEVIBE_ALLOWED_THEME_PACKAGES: 'reference-theme', ONEVIBE_THEME_PACKAGE_VERSION: '1.0.0', ONEVIBE_THEME_PACKAGE_INTEGRITY: digest, ONEVIBE_THEME_PACKAGE_ROOT: root, ONEVIBE_THEME_PACKAGE_MANIFEST: path.join(root, 'manifest.json'), })).resolves.toMatchObject({ manifest: { packageVersion: '1.0.0' } })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('defaults missing slots and routes to empty arrays and does not crash', () => {
    const manifest = parseThemePackageManifest({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: sha256Hex(entry) })
    expect(manifest.slots).toEqual([])
    expect(manifest.routes).toEqual([])
    expect(manifest.tokenDefaults).toEqual({})
  })

  it('returns null when no package is selected (base theme fallback)', async () => {
    const loaded = await loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: undefined })
    expect(loaded).toBeNull()
  })

  it('throws on a missing manifest so the caller can fall back to base theme', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-theme-package-missing-'))
    try {
      await expect(loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: 'reference-theme', ONEVIBE_ALLOWED_THEME_PACKAGES: 'reference-theme', ONEVIBE_THEME_PACKAGE_VERSION: '1.0.0', ONEVIBE_THEME_PACKAGE_INTEGRITY: sha256Hex(entry), ONEVIBE_THEME_PACKAGE_ROOT: root, ONEVIBE_THEME_PACKAGE_MANIFEST: path.join(root, 'manifest.json') })).rejects.toThrow(/manifest/i)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('caller catch + null fallback simulates rollback to base theme', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-theme-package-rollback-'))
    try {
      await writeFile(path.join(root, 'theme.js'), entry)
      const digest = sha256Hex(entry)
      await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: digest, slots: [], routes: [] }))
      let result: Awaited<ReturnType<typeof loadThemePackageManifest>> = null
      try {
        result = await loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: 'reference-theme', ONEVIBE_ALLOWED_THEME_PACKAGES: 'reference-theme', ONEVIBE_THEME_PACKAGE_VERSION: '1.0.0', ONEVIBE_THEME_PACKAGE_INTEGRITY: 'b'.repeat(64), ONEVIBE_THEME_PACKAGE_ROOT: root, ONEVIBE_THEME_PACKAGE_MANIFEST: path.join(root, 'manifest.json') })
      } catch {
        result = null
      }
      expect(result).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects an entry symlink that resolves outside the operator package root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'onevibe-theme-package-symlink-'))
    const outside = await mkdtemp(path.join(os.tmpdir(), 'onevibe-theme-package-outside-'))
    try {
      const digest = sha256Hex(entry)
      await writeFile(path.join(outside, 'theme.js'), entry)
      await symlink(path.join(outside, 'theme.js'), path.join(root, 'theme.js'))
      await writeFile(path.join(root, 'manifest.json'), JSON.stringify({ contractVersion: 1, packageName: 'reference-theme', packageVersion: '1.0.0', entryPath: 'theme.js', entrySha256: digest, slots: [], routes: [] }))
      await expect(loadThemePackageManifest({ ONEVIBE_THEME_PACKAGE: 'reference-theme', ONEVIBE_ALLOWED_THEME_PACKAGES: 'reference-theme', ONEVIBE_THEME_PACKAGE_VERSION: '1.0.0', ONEVIBE_THEME_PACKAGE_INTEGRITY: digest, ONEVIBE_THEME_PACKAGE_ROOT: root, ONEVIBE_THEME_PACKAGE_MANIFEST: path.join(root, 'manifest.json') })).rejects.toThrow(/escapes/i)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})
