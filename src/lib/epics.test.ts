import { describe, expect, it } from 'vitest'
import { distinctEpics, matchesEpicFilter } from './epics'

describe('distinctEpics', () => {
  it('returns unique epic labels sorted alphabetically', () => {
    expect(distinctEpics([
      { epicLabel: 'Growth' },
      { epicLabel: 'Platform' },
      { epicLabel: 'Growth' },
      {},
      { epicLabel: '  ' },
    ])).toEqual(['Growth', 'Platform'])
  })

  it('returns an empty list when no item has an epic label', () => {
    expect(distinctEpics([{}, {}, { epicLabel: undefined }])).toEqual([])
  })
})

describe('matchesEpicFilter', () => {
  it('matches every item when the filter is all', () => {
    expect(matchesEpicFilter({ epicLabel: 'Growth' }, 'all')).toBe(true)
    expect(matchesEpicFilter({}, 'all')).toBe(true)
  })

  it('matches only items carrying the selected epic label', () => {
    expect(matchesEpicFilter({ epicLabel: 'Growth' }, 'Growth')).toBe(true)
    expect(matchesEpicFilter({ epicLabel: 'Platform' }, 'Growth')).toBe(false)
    expect(matchesEpicFilter({}, 'Growth')).toBe(false)
  })

  it('reduces a visible task list to the selected epic', () => {
    const tasks = [
      { title: 'Wire up SSO login', epicLabel: 'Platform' },
      { title: 'Audit trail export', epicLabel: 'Platform' },
      { title: 'Export usage CSV', epicLabel: 'Growth' },
      { title: 'Fix sidebar scroll' },
    ]
    expect(tasks.filter((task) => matchesEpicFilter(task, 'Platform')).map((task) => task.title))
      .toEqual(['Wire up SSO login', 'Audit trail export'])
    expect(tasks.filter((task) => matchesEpicFilter(task, 'all'))).toHaveLength(4)
  })
})
