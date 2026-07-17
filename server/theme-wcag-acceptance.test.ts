import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseReferenceThemeProfiles } from './theme-reference-profiles.js'

const _dir = path.dirname(fileURLToPath(import.meta.url))

const _linearize = (ch: number) => { const c = ch / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const _luminance = (hex: string) => { const h = hex.replace('#', ''); const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16); return 0.2126*_linearize(r) + 0.7152*_linearize(g) + 0.0722*_linearize(b) }
const contrastRatio = (fg: string, bg: string): number | null => { try { const l1 = _luminance(fg), l2 = _luminance(bg); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05) } catch { return null } }

/**
 * P7-07 programmatic acceptance: this test proves what a headless CI run can
 * prove — schema completeness, WCAG contrast math, font allow-listing, and
 * dark/light token parity in the shipped stylesheet. It does not replace a
 * manual browser pass (desktop/mobile layout, keyboard focus order, reduced
 * motion visual check, no-overflow at narrow widths) — see TODO.md P7-07.
 */

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.resolve(serverDir, '../docs/fixtures/themes/reference-profiles.json')
const indexCssPath = path.resolve(serverDir, '../src/index.css')

const profiles = parseReferenceThemeProfiles(JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown)

// Mirrors the fontUi allow-list enforced by tenantThemeConfigSchema in
// server/theme-config.ts (tokens.fontUi). Kept as a literal copy rather than
// importing zod internals, so this test fails loudly if the two ever diverge.
const fontAllowList = new Set(['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'])

// The presentation-only top-level shape of TenantThemeConfig. This is the
// schema boundary that keeps theme profiles from carrying runtime/policy
// fields; cross-cutting isolation (routing, auth, evidence) is proven
// end-to-end by `npm run e2e:themes`, not by this schema-shape check alone.
const allowedTopLevelKeys = new Set([
  'schemaVersion',
  'tenantId',
  'tenantName',
  'tokens',
  'brand',
  'homePage',
  'navigation',
  'features',
  'compliance',
])

const requiredTokenKeys = [
  'colorBrandPrimary',
  'colorBrandSecondary',
  'colorBgPage',
  'colorBgSurface',
  'colorNavBg',
  'colorNavText',
  'colorTextPrimary',
  'colorTextSecondary',
  'colorBorderDefault',
  'fontUi',
  'radiusBase',
  'radiusButton',
] as const

describe('reference tenant theme profiles: schema and WCAG acceptance', () => {
  it('parses exactly three reference profiles with the expected identities', () => {
    expect(profiles).toHaveLength(3)
    expect(profiles.map((profile) => profile.tenantId).sort()).toEqual([
      'reference-financial',
      'reference-institutional',
      'reference-philanthropic',
    ])
  })

  it('every profile defines all required presentation tokens', () => {
    for (const profile of profiles) {
      for (const key of requiredTokenKeys) {
        expect(profile.tokens, `${profile.tenantId} missing token ${key}`).toHaveProperty(key)
      }
    }
  })

  it('every profile stays within the presentation-only schema boundary', () => {
    for (const profile of profiles) {
      for (const key of Object.keys(profile)) {
        expect(allowedTopLevelKeys.has(key), `${profile.tenantId} has out-of-contract key ${key}`).toBe(true)
      }
    }
  })

  it('nav and body text meet WCAG AA contrast (>= 4.5:1) against their backgrounds', () => {
    for (const profile of profiles) {
      const { tokens } = profile
      const navRatio = contrastRatio(tokens.colorNavText!, tokens.colorNavBg!)
      const primaryOnPage = contrastRatio(tokens.colorTextPrimary!, tokens.colorBgPage!)
      const secondaryOnPage = contrastRatio(tokens.colorTextSecondary!, tokens.colorBgPage!)
      const primaryOnSurface = contrastRatio(tokens.colorTextPrimary!, tokens.colorBgSurface!)

      expect(navRatio, `${profile.tenantId} nav text/bg`).not.toBeNull()
      expect(navRatio!, `${profile.tenantId} nav text/bg = ${navRatio}`).toBeGreaterThanOrEqual(4.5)

      expect(primaryOnPage, `${profile.tenantId} primary text/page`).not.toBeNull()
      expect(primaryOnPage!, `${profile.tenantId} primary text/page = ${primaryOnPage}`).toBeGreaterThanOrEqual(4.5)

      expect(secondaryOnPage, `${profile.tenantId} secondary text/page`).not.toBeNull()
      expect(secondaryOnPage!, `${profile.tenantId} secondary text/page = ${secondaryOnPage}`).toBeGreaterThanOrEqual(4.5)

      expect(primaryOnSurface, `${profile.tenantId} primary text/surface`).not.toBeNull()
      expect(primaryOnSurface!, `${profile.tenantId} primary text/surface = ${primaryOnSurface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('every profile uses an allow-listed sans-serif font family', () => {
    for (const profile of profiles) {
      expect(fontAllowList.has(profile.tokens.fontUi!), `${profile.tenantId} fontUi=${profile.tokens.fontUi}`).toBe(true)
    }
  })
})

describe('base theme dark/light token completeness in src/index.css', () => {
  const css = readFileSync(indexCssPath, 'utf8')

  // Semantic tokens introduced by the "Semantic ONEComputer theme layer"
  // comment block; both the dark-default :root block and the [data-theme=light]
  // override must define every one of these so no component silently falls
  // back to an unstyled value when the mode is switched.
  const semanticTokens = [
    'surface-canvas', 'surface-sidebar', 'surface-panel', 'surface-raised', 'surface-hover', 'surface-inset', 'surface-code',
    'border-default', 'border-subtle', 'border-strong',
    'text-primary', 'text-secondary', 'text-muted', 'text-faint',
    'accent', 'accent-strong', 'accent-soft', 'accent-border', 'accent-ink',
    'warning', 'warning-soft', 'danger', 'info', 'info-soft',
    'overlay-topbar', 'overlay-composer', 'grid-line', 'shadow', 'shadow-soft',
  ]

  const extractDeclaredNames = (blockBody: string): Set<string> => {
    const names = new Set<string>()
    const re = /--([a-zA-Z0-9-]+)\s*:/g
    let match: RegExpExecArray | null
    while ((match = re.exec(blockBody))) names.add(match[1])
    return names
  }

  const collectBlockNames = (source: string, selectorRe: RegExp): Set<string> => {
    const names = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = selectorRe.exec(source))) {
      for (const name of extractDeclaredNames(match[1])) names.add(name)
    }
    return names
  }

  it('every :root block collectively defines all semantic tokens', () => {
    const darkNames = collectBlockNames(css, /:root\s*\{([^}]*)\}/g)
    const missing = semanticTokens.filter((token) => !darkNames.has(token))
    expect(missing, `missing semantic tokens in :root: ${missing.join(', ')}`).toEqual([])
  })

  it('every [data-theme=light] block collectively defines all semantic tokens', () => {
    const lightNames = collectBlockNames(css, /\[data-theme=light\]\s*\{([^}]*)\}/g)
    const missing = semanticTokens.filter((token) => !lightNames.has(token))
    expect(missing, `missing semantic tokens in [data-theme=light]: ${missing.join(', ')}`).toEqual([])
  })

  it('does not contain a var(...) reference immediately followed by trailing hex characters', () => {
    // Regression guard for a real bug found during this audit: generated
    // tokens like `var(--theme-color-xxx)fff` are invalid CSS values (the
    // browser drops the whole declaration) rather than the intended fallback
    // color. Every var(...) use must stand alone or use the comma-fallback
    // syntax var(--x, fallback).
    const brokenConcat = /var\(--[a-z0-9-]+\)[0-9a-f]{3,8}\b/gi
    const matches = css.match(brokenConcat) ?? []
    expect(matches, `found invalid concatenated var() values: ${matches.join(', ')}`).toEqual([])
  })
})
