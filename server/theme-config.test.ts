import { describe, expect, it } from 'vitest'
import { resolveTenantTheme, tenantThemeConfigSchema } from './theme-config.js'

const base = tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'onevibe-base', tenantName: 'ONEVibe' })
const acme = tenantThemeConfigSchema.parse({
  schemaVersion: 1,
  tenantId: 'acme',
  tenantName: 'Acme',
  tokens: { colorBrandPrimary: '#123456', radiusBase: '12px' },
})

describe('tenant theme contract', () => {
  it('applies bounded defaults and preserves presentation-only fields', () => {
    expect(base).toMatchObject({ schemaVersion: 1, tenantId: 'onevibe-base', tokens: {}, features: { showComputerTab: true } })
    expect(acme.tokens).toMatchObject({ colorBrandPrimary: '#123456', radiusBase: '12px' })
    expect(JSON.stringify(acme)).not.toMatch(/litellm|credential|approval|sandbox|evidence/i)
  })

  it('rejects CSS injection, unsafe URLs, unbounded content, and non-sans fonts', () => {
    expect(() => tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', tokens: { colorBrandPrimary: 'url(https://attacker)' } })).toThrow()
    expect(() => tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', brand: { logoUrl: 'javascript:alert(1)' } })).toThrow()
    expect(() => tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', tokens: { fontUi: 'Comic Sans' } })).toThrow()
    expect(() => tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', homePage: { heroHeadline: 'x'.repeat(181) } })).toThrow()
    expect(() => tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', brand: { logoUrl: 'https://cdn.example/logo.svg' } })).toThrow(/integrity/i)
    expect(tenantThemeConfigSchema.parse({ schemaVersion: 1, tenantId: 'acme', tenantName: 'Acme', brand: { logoUrl: 'https://cdn.example/logo.svg', logoSha256: 'a'.repeat(64) } }).brand.logoSha256).toBe('a'.repeat(64))
  })

  it('resolves server-controlled scope in session, deployment, host, then base order', () => {
    const configs = { 'onevibe-base': base, acme }
    expect(resolveTenantTheme({ configs, base, sessionTenantId: 'acme', deploymentTenantId: 'missing', host: 'acme.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } })).toMatchObject({ source: 'session', config: acme })
    expect(resolveTenantTheme({ configs, base, deploymentTenantId: 'acme', host: 'acme.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } }).source).toBe('deployment')
    expect(resolveTenantTheme({ configs, base, host: 'acme.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } }).source).toBe('host')
    expect(resolveTenantTheme({ configs, base, host: 'evil.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } })).toMatchObject({ source: 'base', config: base })
  })
})
