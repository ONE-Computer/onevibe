import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TURN_TIMEOUT_MS,
  MAX_TURN_TIMEOUT_MS,
  MIN_TURN_TIMEOUT_MS,
  TurnTimeoutError,
  awaitTurnSettlement,
  createTurnDeadline,
  resolveTurnTimeoutMs,
} from './turn-deadline.js'

describe('turn deadline', () => {
  it('aborts the adapter signal and rejects on expiry', async () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const onExpire = vi.fn(() => controller.abort())
      const deadline = createTurnDeadline({ timeoutMs: 1_000, onExpire })
      const rejection = expect(deadline.promise).rejects.toEqual(expect.objectContaining({
        name: 'TurnTimeoutError', timeoutMs: 1_000,
      }))

      await vi.advanceTimersByTimeAsync(1_000)

      expect(onExpire).toHaveBeenCalledOnce()
      expect(controller.signal.aborted).toBe(true)
      expect(deadline.expired).toBe(true)
      await rejection
      deadline.clear()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not classify a user abort as a timeout', () => {
    vi.useFakeTimers()
    try {
      const controller = new AbortController()
      const onExpire = vi.fn(() => controller.abort())
      const deadline = createTurnDeadline({ timeoutMs: 1_000, onExpire })

      controller.abort()
      deadline.clear()
      vi.advanceTimersByTime(1_000)

      expect(controller.signal.aborted).toBe(true)
      expect(onExpire).not.toHaveBeenCalled()
      expect(deadline.expired).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears the deadline timer when a run finishes early', () => {
    vi.useFakeTimers()
    try {
      const onExpire = vi.fn()
      const deadline = createTurnDeadline({ timeoutMs: 1_000, onExpire })

      deadline.clear()
      vi.advanceTimersByTime(1_000)

      expect(onExpire).not.toHaveBeenCalled()
      expect(deadline.expired).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a late adapter settlement observable through the cleanup grace', async () => {
    vi.useFakeTimers()
    try {
      let rejectRun!: (reason: Error) => void
      const run = new Promise<void>((_, reject) => { rejectRun = reject })
      const settlement = awaitTurnSettlement(run, 1_000)

      await vi.advanceTimersByTimeAsync(1_000)
      await expect(settlement).resolves.toBe('grace_expired')

      rejectRun(new Error('late provider failure'))
      await expect(run).rejects.toThrow('late provider failure')
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the default for invalid values and clamps valid values to safe bounds', () => {
    expect(resolveTurnTimeoutMs({})).toBe(DEFAULT_TURN_TIMEOUT_MS)
    expect(resolveTurnTimeoutMs({ ONEVIBE_TURN_TIMEOUT_MS: 'not-a-number' })).toBe(DEFAULT_TURN_TIMEOUT_MS)
    expect(resolveTurnTimeoutMs({ ONEVIBE_TURN_TIMEOUT_MS: '1.5' })).toBe(DEFAULT_TURN_TIMEOUT_MS)
    expect(resolveTurnTimeoutMs({ ONEVIBE_TURN_TIMEOUT_MS: '0' })).toBe(MIN_TURN_TIMEOUT_MS)
    expect(resolveTurnTimeoutMs({ ONEVIBE_TURN_TIMEOUT_MS: '-1' })).toBe(MIN_TURN_TIMEOUT_MS)
    expect(resolveTurnTimeoutMs({ ONEVIBE_TURN_TIMEOUT_MS: String(MAX_TURN_TIMEOUT_MS + 1) })).toBe(MAX_TURN_TIMEOUT_MS)
    expect(resolveTurnTimeoutMs({ ONEVIBE_TURN_TIMEOUT_MS: '12345' })).toBe(12_345)
  })

  it('exposes a typed timeout error for fail-closed callers', () => {
    expect(new TurnTimeoutError(1_000)).toBeInstanceOf(Error)
    expect(new TurnTimeoutError(1_000).timeoutMs).toBe(1_000)
  })
})
