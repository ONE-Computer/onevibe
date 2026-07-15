import { describe, expect, it } from 'vitest'
import { streamInterruptionMessage } from './useTask'

describe('task stream connection semantics', () => {
  it('does not portray a completed history record as a broken live stream', () => {
    expect(streamInterruptionMessage('completed')).toBeNull()
    expect(streamInterruptionMessage('failed')).toBeNull()
    expect(streamInterruptionMessage('cancelled')).toBeNull()
  })

  it('warns when an active conversation stream is interrupted', () => {
    expect(streamInterruptionMessage('running')).toMatch(/interrupted/i)
    expect(streamInterruptionMessage('waiting_for_user_input')).toMatch(/interrupted/i)
  })
})
