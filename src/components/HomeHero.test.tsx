import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HomeHero } from './HomeHero'
import { ThemeContext, type ThemeContextValue } from '../lib/theme'
import type { TenantThemeConfig } from '../types'

const theme: TenantThemeConfig = {
  schemaVersion: 1,
  tenantId: 'reference-acme',
  tenantName: 'Acme Workspace',
  homePage: {
    heroHeadline: 'A governed workspace',
    heroSubheadline: 'Bounded content rendered as typed React components.',
    announcementBannerText: 'Internal preview',
    announcementBannerUrl: '/docs',
    announcementBannerVisible: true,
    featureCards: [{ title: 'Research', description: 'Evidence-backed work.', accent: 'brand' }],
  },
}

const context: ThemeContextValue = {
  config: theme,
  source: 'tenant',
  customized: true,
  isLoading: false,
  error: null,
  refresh: async () => undefined,
}

describe('HomeHero tenant content projection', () => {
  it('renders bounded homepage config through typed markup', () => {
    const html = renderToStaticMarkup(<ThemeContext.Provider value={context}><HomeHero name="operator" /></ThemeContext.Provider>)
    expect(html).toContain('A governed workspace')
    expect(html).toContain('Internal preview')
    expect(html).toContain('Research')
    expect(html).not.toContain('customSectionsHtml')
  })

  it('escapes tenant copy instead of treating it as markup', () => {
    const unsafeTextTheme = { ...theme, homePage: { ...theme.homePage, heroHeadline: '<script>alert(1)</script>' } }
    const html = renderToStaticMarkup(<ThemeContext.Provider value={{ ...context, config: unsafeTextTheme }}><HomeHero /></ThemeContext.Provider>)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
