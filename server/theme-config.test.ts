import { describe, expect, it } from 'vitest'
import { resolveTenantTheme, sanitizeSvg, tenantThemeConfigSchema } from './theme-config.js'

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

  it('strips script blocks from SVG content', () => {
    const svg = '<svg><script>alert(1)</script><circle r="1"/></svg>'
    expect(sanitizeSvg(svg)).toBe('<svg><circle r="1"/></svg>')
  })

  it('strips foreignObject blocks from SVG content', () => {
    const svg = '<svg><foreignObject><body onload="alert(1)"/></foreignObject><rect/></svg>'
    expect(sanitizeSvg(svg)).toBe('<svg><rect/></svg>')
  })

  it('strips inline event-handler attributes regardless of quoting', () => {
    expect(sanitizeSvg('<svg onload="alert(1)"><rect/></svg>')).toBe('<svg><rect/></svg>')
    expect(sanitizeSvg("<svg onload='alert(1)'><rect/></svg>")).toBe('<svg><rect/></svg>')
    expect(sanitizeSvg('<circle onclick=alert(1) r="1"/>')).toBe('<circle r="1"/>')
  })

  it('strips javascript: hrefs', () => {
    const svg = '<svg><a href="javascript:alert(1)">click</a></svg>'
    expect(sanitizeSvg(svg)).not.toMatch(/javascript:/i)
  })

  it('strips data: URIs from href and src', () => {
    const svg = '<svg><image href="data:image/svg+xml;base64,abc123" src=\'data:text/html,<script>1</script>\'/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toMatch(/data:/i)
  })

  it('strips use elements that reference an external document but keeps local fragment references', () => {
    const svg = '<svg><use xlink:href="https://evil.example/payload.svg#x"/><use href="#local-icon"/></svg>'
    const result = sanitizeSvg(svg)
    expect(result).not.toMatch(/evil\.example/i)
    expect(result).toContain('<use href="#local-icon"/>')
  })

  it('leaves a benign SVG unchanged', () => {
    const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#123456"/><use href="#local-icon"/></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })

  it('resolves server-controlled scope in session, deployment, host, then base order', () => {
    const configs = { 'onevibe-base': base, acme }
    expect(resolveTenantTheme({ configs, base, sessionTenantId: 'acme', deploymentTenantId: 'missing', host: 'acme.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } })).toMatchObject({ source: 'session', config: acme })
    expect(resolveTenantTheme({ configs, base, deploymentTenantId: 'acme', host: 'acme.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } }).source).toBe('deployment')
    expect(resolveTenantTheme({ configs, base, host: 'acme.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } }).source).toBe('host')
    expect(resolveTenantTheme({ configs, base, host: 'evil.example.com', hostTenantAllowList: { 'acme.example.com': 'acme' } })).toMatchObject({ source: 'base', config: base })
  })
})
