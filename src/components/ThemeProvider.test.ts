import { describe, expect, it } from 'vitest'
import { contrastRatio, relativeLuminance, themeContrastAttributes, themeQueryKey } from '../lib/theme.js'
import type { TenantThemeConfig } from '../types.js'

describe('tenant theme cache boundary', () => {
  it('keys server theme data by authenticated scope', () => {
    expect(themeQueryKey('user-a')).not.toEqual(themeQueryKey('user-b'))
    expect(themeQueryKey('user-a')).toEqual(['theme', 'current', 'user-a'])
  })

  it('calculates WCAG contrast metadata from bounded theme colors', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBe(1)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    const config = { schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', tokens: { colorNavBg: '#000000', colorNavText: '#ffffff', colorBgPage: '#ffffff', colorTextPrimary: '#000000' } } as TenantThemeConfig
    expect(themeContrastAttributes(config)).toMatchObject({ navContrast: 'dark', pageContrast: 'light' })
    expect(themeContrastAttributes(config).navRatio).toBeGreaterThan(4.5)
  })
})
