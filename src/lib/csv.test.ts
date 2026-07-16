import { describe, expect, it } from 'vitest'
import { CsvParseError, parseCsv } from './csv'

describe('bounded CSV parser', () => {
  it('preserves commas, newlines, and escaped quotes inside quoted fields', () => {
    expect(parseCsv('Name,Note\nAlpha,"Review, then approve"\nBeta,"Line one\nLine two"\nGamma,"Say ""go"""')).toEqual({
      headers: ['Name', 'Note'],
      rows: [['Alpha', 'Review, then approve'], ['Beta', 'Line one\nLine two'], ['Gamma', 'Say "go"']],
      rowCount: 3,
      columnCount: 2,
    })
  })

  it('accepts CRLF input and rejects malformed quoting', () => {
    expect(parseCsv('A,B\r\n1,2\r\n3,4\r\n').rowCount).toBe(2)
    expect(() => parseCsv('A,B\n1,"unfinished\n')).toThrow(CsvParseError)
    expect(() => parseCsv('A,B\n1,"closed"oops\n')).toThrow(/closing quote/i)
  })

  it('rejects inconsistent rows and enforces bounded dimensions', () => {
    expect(() => parseCsv('A,B\n1\n')).toThrow(/inconsistent/i)
    expect(() => parseCsv('A,B\n1,2\n3,4\n', { maxRows: 1 })).toThrow(/row limit/i)
    expect(() => parseCsv('A,B,C\n1,2,3\n', { maxColumns: 2 })).toThrow(/column limit/i)
  })
})
