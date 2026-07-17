import { describe, expect, it } from 'vitest'
import { loadReferenceThemeProfile, parseReferenceThemeProfiles } from './theme-reference-profiles.js'

describe('read-only reference theme profiles', () => {
  it('parses the checked-in reference matrix and keeps IDs bounded', () => {
    const profiles = parseReferenceThemeProfiles([
      { schemaVersion: 1, tenantId: 'reference-institutional', tenantName: 'Institutional', brand: {}, homePage: { announcementBannerVisible: false, featureCards: [] }, navigation: { items: [] }, features: { showComputerTab: true, showMcpMarketplace: true, showRuntimePicker: true, showDebugPanel: false }, compliance: {} },
    ])
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.tenantId).toBe('reference-institutional')
  })

  it('loads only exact reference IDs and never arbitrary tenant data', async () => {
    const institutional = await loadReferenceThemeProfile('reference-institutional', { NODE_ENV: 'development' })
    expect(institutional?.tenantId).toBe('reference-institutional')
    expect(await loadReferenceThemeProfile('customer-acme', { NODE_ENV: 'development' })).toBeUndefined()
    expect(await loadReferenceThemeProfile('../reference-institutional', { NODE_ENV: 'development' })).toBeUndefined()
  })

  it('fails closed for production even when a fixture ID is configured', async () => {
    expect(await loadReferenceThemeProfile('reference-financial', { NODE_ENV: 'production' })).toBeUndefined()
  })

  it('keeps presentation fixtures free of privileged control fields', async () => {
    const profile = await loadReferenceThemeProfile('reference-philanthropic', { NODE_ENV: 'development' })
    expect(profile).toBeDefined()
    expect(profile).not.toHaveProperty('provider')
    expect(profile).not.toHaveProperty('credentials')
    expect(profile).not.toHaveProperty('approval')
    expect(profile).not.toHaveProperty('sandbox')
  })
})

