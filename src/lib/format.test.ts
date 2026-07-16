import { describe, expect, it } from 'vitest'
import { readableBytes } from './format.js'

describe('readableBytes', () => {
  it('handles missing and byte-sized values', () => {
    expect(readableBytes()).toBeUndefined()
    expect(readableBytes(512)).toBe('512 B')
  })

  it('uses stable KB and MB labels', () => {
    expect(readableBytes(1024)).toBe('1 KB')
    expect(readableBytes(1024 * 1024)).toBe('1.0 MB')
  })
})
