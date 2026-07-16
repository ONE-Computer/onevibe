import { describe, expect, it } from 'vitest'
import { credentialResidueFindings } from './credential-residue-audit.js'

describe('credential residue audit', () => {
  it('reports detector names without returning secret material', () => {
    const value = 'ANTHROPIC_AUTH_TOKEN=example-secret-value-that-must-not-be-returned'
    const findings = credentialResidueFindings('events.json', Buffer.from(value))
    expect(findings).toEqual([{ source: 'events.json', detector: 'credential_assignment' }])
    expect(JSON.stringify(findings)).not.toContain('example-secret-value')
  })

  it('accepts redacted placeholders and ignores binary or oversized inputs', () => {
    expect(credentialResidueFindings('safe.json', Buffer.from('Authorization: Bearer [REDACTED]'))).toEqual([])
    expect(credentialResidueFindings('image.png', Uint8Array.from([0, 1, 2]))).toEqual([])
    expect(credentialResidueFindings('large.txt', new Uint8Array(1024 * 1024 + 1))).toEqual([])
  })
})
