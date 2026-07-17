import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from './svg-sanitize'

describe('sanitizeSvg', () => {
  it('strips script blocks', () => {
    expect(sanitizeSvg('<svg><script>alert(1)</script><circle r="1"/></svg>')).toBe('<svg><circle r="1"/></svg>')
  })

  it('strips foreignObject blocks', () => {
    expect(sanitizeSvg('<svg><foreignObject><body/></foreignObject><rect/></svg>')).toBe('<svg><rect/></svg>')
  })

  it('strips inline event handlers regardless of quoting', () => {
    expect(sanitizeSvg('<svg onload="alert(1)"/>')).toBe('<svg/>')
    expect(sanitizeSvg("<svg onload='alert(1)'/>")).toBe('<svg/>')
    expect(sanitizeSvg('<circle onclick=alert(1) r="1"/>')).toBe('<circle r="1"/>')
  })

  it('strips javascript: and data: URI payloads', () => {
    expect(sanitizeSvg('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i)
    expect(sanitizeSvg('<image href="data:image/svg+xml;base64,abc"/>')).not.toMatch(/data:/i)
  })

  it('strips external use references but keeps local fragments', () => {
    const result = sanitizeSvg('<svg><use xlink:href="https://evil.example/x.svg#a"/><use href="#ok"/></svg>')
    expect(result).not.toMatch(/evil\.example/i)
    expect(result).toContain('<use href="#ok"/>')
  })

  it('leaves a benign SVG unchanged', () => {
    const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#123456"/></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })
})
