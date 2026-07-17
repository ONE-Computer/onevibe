import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ThemeProfile = {
  id: string
  fontUi: string
  tokens: Record<string, string>
  darkTokens?: Record<string, string>
}

const PROFILE_PATH = path.resolve(__dirname, '../src/theme/reference-profiles.json')

const REQUIRED_TOKEN_KEYS = [
  'colorBgPage',
  'colorBgSurface',
  'colorNavBg',
  'colorNavText',
  'colorTextPrimary',
  'colorTextSecondary',
  'colorBorderDefault',
  'colorBrandPrimary',
  'colorBrandSecondary',
] as const

const FONT_ALLOWLIST = ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] as const

function linearizeChannel(value: number): number {
  const channel = value / 255
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const cleaned = hex.replace('#', '')
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  const R = linearizeChannel(r)
  const G = linearizeChannel(g)
  const B = linearizeChannel(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA)
  const lumB = relativeLuminance(hexB)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

function loadProfiles(): ThemeProfile[] {
  const raw = readFileSync(PROFILE_PATH, 'utf8')
  const parsed = JSON.parse(raw) as { profiles?: ThemeProfile[] }
  if (!Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
    throw new Error('reference-profiles.json must contain a non-empty profiles array')
  }
  return parsed.profiles
}

describe('theme reference profiles', () => {
  it('exist and are non-empty', () => {
    const profiles = loadProfiles()
    expect(profiles.length).toBeGreaterThan(0)
    for (const profile of profiles) {
      expect(typeof profile.id).toBe('string')
      expect(profile.id.length).toBeGreaterThan(0)
    }
  })

  it('use only allowed CSS token names and complete token sets', () => {
    const profiles = loadProfiles()
    for (const profile of profiles) {
      const tokens = profile.tokens
      const keys = Object.keys(tokens)
      expect(keys.length).toBe(REQUIRED_TOKEN_KEYS.length)
      for (const requiredKey of REQUIRED_TOKEN_KEYS) {
        expect(tokens).toHaveProperty(requiredKey)
        expect(typeof tokens[requiredKey]).toBe('string')
        expect(tokens[requiredKey].length).toBeGreaterThan(0)
      }
      for (const key of keys) {
        expect(REQUIRED_TOKEN_KEYS).toContain(key)
      }
    }
  })

  it('satisfies WCAG AA contrast (>= 4.5:1) for critical text-on-background pairs', () => {
    const profiles = loadProfiles()
    const requiredPairs: Array<{ foreground: string; background: string; min: number }> = [
      { foreground: 'colorTextPrimary', background: 'colorBgPage', min: 4.5 },
      { foreground: 'colorTextPrimary', background: 'colorBgSurface', min: 4.5 },
      { foreground: 'colorTextSecondary', background: 'colorBgPage', min: 4.5 },
      { foreground: 'colorTextSecondary', background: 'colorBgSurface', min: 4.5 },
      { foreground: 'colorNavText', background: 'colorNavBg', min: 4.5 },
    ]

    for (const profile of profiles) {
      for (const pair of requiredPairs) {
        const fg = profile.tokens[pair.foreground]
        const bg = profile.tokens[pair.background]
        const ratio = contrastRatio(fg, bg)
        expect(ratio, `${profile.id}: ${pair.foreground} on ${pair.background}`).toBeGreaterThanOrEqual(pair.min)
      }
    }
  })

  it('keeps brand color distinct and legible enough for UI accents (>= 3:1 on surface)', () => {
    const profiles = loadProfiles()
    for (const profile of profiles) {
      const ratio = contrastRatio(profile.tokens.colorBrandPrimary, profile.tokens.colorBgSurface)
      expect(ratio, `${profile.id}: brand primary on surface`).toBeGreaterThanOrEqual(3)
    }
  })

  it('uses only allowed UI fonts', () => {
    const profiles = loadProfiles()
    for (const profile of profiles) {
      expect(FONT_ALLOWLIST, `${profile.id} fontUi`).toContain(profile.fontUi)
    }
  })

  it('provides dark-mode token completeness when darkTokens are present', () => {
    const profiles = loadProfiles()
    for (const profile of profiles) {
      if (profile.darkTokens === undefined) {
        continue
      }
      const darkKeys = Object.keys(profile.darkTokens)
      expect(darkKeys.length, `${profile.id} darkTokens completeness`).toBe(REQUIRED_TOKEN_KEYS.length)
      for (const requiredKey of REQUIRED_TOKEN_KEYS) {
        expect(profile.darkTokens).toHaveProperty(requiredKey)
      }
      // Also ensure dark-mode critical pairs still meet WCAG when provided.
      const darkPairs: Array<{ foreground: string; background: string }> = [
        { foreground: 'colorTextPrimary', background: 'colorBgPage' },
        { foreground: 'colorTextPrimary', background: 'colorBgSurface' },
        { foreground: 'colorNavText', background: 'colorNavBg' },
      ]
      for (const pair of darkPairs) {
        const ratio = contrastRatio(profile.darkTokens[pair.foreground], profile.darkTokens[pair.background])
        expect(ratio, `${profile.id} dark ${pair.foreground} on ${pair.background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
