export type PolicyDecision = {
  decision: 'allow' | 'deny' | 'approval_required'
  policyId: string
  reason: string
  controls: string[]
}

export const evaluateAction = (action: string): PolicyDecision => {
  if (action === 'publish_preview') {
    return {
      decision: 'approval_required',
      policyId: 'global.external-publication.v1',
      reason: 'Public exposure requires a separate manager wallet decision.',
      controls: ['external_wallet', 'intent_binding', '15_minute_expiry', 'no_web_approval'],
    }
  }
  if (action === 'read_workspace' || action === 'write_workspace') {
    return {
      decision: 'allow',
      policyId: 'workspace.local-confined.v1',
      reason: 'The local demo adapter is confined to the task workspace root.',
      controls: ['path_confinement', 'no_shell', 'evidence_event'],
    }
  }
  return {
    decision: 'deny',
    policyId: 'global.default-deny.v1',
    reason: 'No explicit policy allows this action.',
    controls: ['default_deny'],
  }
}
