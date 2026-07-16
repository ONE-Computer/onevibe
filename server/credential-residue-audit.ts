export type CredentialResidueFinding = { source: string; detector: string }

const detectors = [
  { name: 'private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'aws_access_key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'anthropic_key', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/ },
  { name: 'openai_key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/ },
  { name: 'authorization_value', pattern: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+(?!\[REDACTED\])\S+/i },
  { name: 'credential_assignment', pattern: /\b(?:ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN)\s*=\s*(?!\[REDACTED\])\S+/ },
] as const

export const credentialResidueFindings = (source: string, bytes: Uint8Array): CredentialResidueFinding[] => {
  if (bytes.byteLength > 1024 * 1024 || bytes.includes(0)) return []
  const text = Buffer.from(bytes).toString('utf8')
  return detectors.filter(({ pattern }) => pattern.test(text)).map(({ name }) => ({ source, detector: name }))
}
