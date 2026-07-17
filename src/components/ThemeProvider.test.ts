import { describe, expect, it } from 'vitest'
import { themeQueryKey } from '../lib/theme.js'

describe('tenant theme cache boundary', () => {
  it('keys server theme data by authenticated scope', () => {
    expect(themeQueryKey('user-a')).not.toEqual(themeQueryKey('user-b'))
    expect(themeQueryKey('user-a')).toEqual(['theme', 'current', 'user-a'])
  })
})
