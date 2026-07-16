import { describe, expect, it } from 'vitest'
import { createRefreshScheduler } from './refresh-scheduler'

describe('snapshot refresh scheduler', () => {
  it('coalesces overlapping event refreshes into one trailing reconciliation', async () => {
    let release: (() => void) | undefined
    let calls = 0
    const scheduler = createRefreshScheduler(async () => {
      calls += 1
      if (calls === 1) await new Promise<void>((resolve) => { release = resolve })
    })
    const first = scheduler.run()
    await Promise.resolve()
    const second = scheduler.run()
    const third = scheduler.run()
    expect(calls).toBe(1)
    release?.()
    await Promise.all([first, second, third])
    expect(calls).toBe(2)
  })

  it('does not run trailing work after disposal', async () => {
    let release: (() => void) | undefined
    let calls = 0
    const scheduler = createRefreshScheduler(async () => { calls += 1; await new Promise<void>((resolve) => { release = resolve }) })
    const first = scheduler.run()
    await Promise.resolve()
    void scheduler.run()
    scheduler.dispose()
    release?.()
    await first
    expect(calls).toBe(1)
  })
})
