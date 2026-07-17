import { describe, expect, it } from 'vitest'
import { validateReferenceThemeSeed } from './theme-seed.js'

const reference = {
  schemaVersion: 1, tenantId: 'reference-onevibe', tenantName: 'Reference ONEVibe',
  homePage: { announcementBannerVisible: false, featureCards: [] }, navigation: { items: [] },
  features: { showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false },
}

describe('reference tenant theme seed validation', () => {
  it('accepts bounded non-production reference profiles', () => {
    expect(validateReferenceThemeSeed(reference)[0]?.tenantId).toBe('reference-onevibe')
  })

  it('rejects live-looking tenant ids and credential-like fields', () => {
    expect(() => validateReferenceThemeSeed({ ...reference, tenantId: 'acme' })).toThrow(/reference tenant/)
    expect(() => validateReferenceThemeSeed({ ...reference, homePage: { ...reference.homePage, heroHeadline: 'api_key: secret' } })).toThrow(/credential-like/)
  })
})
