import { describe, expect, it } from 'vitest'
import { parseValidationReport } from './validation-report'

describe('validation report parsing', () => {
  it('accepts a complete bounded validation report', () => {
    expect(parseValidationReport(JSON.stringify({ version: 2, mode: 'website', checkedAt: '2026-07-16T00:00:00.000Z', passed: true, limitation: 'Static only.', checks: [{ id: 'preview:title', status: 'passed', detail: 'Preview declares a document title' }] }))?.checks[0]?.id).toBe('preview:title')
  })

  it('rejects malformed or unknown check statuses', () => {
    expect(parseValidationReport('{')).toBeUndefined()
    expect(parseValidationReport(JSON.stringify({ version: 2, mode: 'website', checkedAt: 'now', passed: true, limitation: 'Static only.', checks: [{ id: 'preview:title', status: 'unknown', detail: 'x' }] }))).toBeUndefined()
  })
})
