export type ValidationCheck = { id: string; status: 'passed' | 'failed' | 'skipped'; detail: string }
export type ValidationReport = { version: number; mode: string; checkedAt: string; passed: boolean; checks: ValidationCheck[]; limitation: string }

export const parseValidationReport = (content: string): ValidationReport | undefined => {
  try {
    const value = JSON.parse(content) as Partial<ValidationReport>
    if (typeof value.version !== 'number' || typeof value.mode !== 'string' || typeof value.checkedAt !== 'string' || typeof value.passed !== 'boolean' || typeof value.limitation !== 'string' || !Array.isArray(value.checks)) return undefined
    const checks = value.checks.filter((check): check is ValidationCheck => Boolean(check) && typeof check.id === 'string' && typeof check.detail === 'string' && (check.status === 'passed' || check.status === 'failed' || check.status === 'skipped'))
    return checks.length === value.checks.length ? { version: value.version, mode: value.mode, checkedAt: value.checkedAt, passed: value.passed, checks, limitation: value.limitation } : undefined
  } catch {
    return undefined
  }
}
