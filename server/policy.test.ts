import { describe, expect, it } from 'vitest'
import { evaluateAction } from './policy.js'

describe('governed action policy', () => {
  it('requires an independent wallet for externally shared artifacts', () => {
    expect(evaluateAction('share_artifact')).toEqual({
      decision: 'approval_required',
      policyId: 'global.external-sharing.v1',
      reason: 'External artifact sharing requires a separate manager wallet decision.',
      controls: ['external_wallet', 'intent_binding', '15_minute_expiry', 'no_web_approval', 'read_only_share'],
    })
  })

  it('fails closed for actions without an explicit policy', () => {
    expect(evaluateAction('github_push')).toMatchObject({ decision: 'deny', policyId: 'global.default-deny.v1' })
  })
})
