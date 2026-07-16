import { describe, expect, it } from 'vitest'
import { fallbackSkillCatalog, normalizeSelectedSkillIds } from '../lib/api'

describe('Skills Library selection', () => {
  it('validates IDs, removes duplicates, preserves order, and caps selections at four', () => {
    expect(normalizeSelectedSkillIds(['slides', 'unknown', 'slides', 'research', 'document', 'security_review', 'browser_testing'])).toEqual(['slides', 'research', 'document', 'security_review'])
  })

  it('validates persisted IDs against the authoritative catalog', () => {
    const catalog = fallbackSkillCatalog.filter((skill) => skill.id !== 'slides')
    expect(normalizeSelectedSkillIds(['slides', 'research', 'research'], catalog)).toEqual(['research'])
  })
})
