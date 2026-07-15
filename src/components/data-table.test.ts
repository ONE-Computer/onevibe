import { describe, expect, it } from 'vitest'
import { filterDataRows } from './data-table'

describe('generated data table filter', () => {
  const rows = [['Team', 'Risk'], ['Alpha', 'Low'], ['Beta', 'High'], ['Gamma', 'Medium']]

  it('filters only body rows across every cell without mutating the CSV source', () => {
    expect(filterDataRows(rows, 'high')).toEqual([['Beta', 'High']])
    expect(filterDataRows(rows, 'a')).toHaveLength(3)
    expect(rows[0]).toEqual(['Team', 'Risk'])
  })

  it('returns all body rows for an empty filter', () => {
    expect(filterDataRows(rows, '  ')).toEqual(rows.slice(1))
  })
})
