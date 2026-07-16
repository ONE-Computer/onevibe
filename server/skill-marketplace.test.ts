import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { fetchMarketplaceSkill, parseMarketplaceCatalog, publicMarketplaceEntry, resetMarketplaceCacheForTests } from './skill-marketplace.js'

const catalogUrl = 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json'

describe('skill marketplace boundary', () => {
  it('accepts only pinned GitHub catalog entries and exposes uninstalled state', () => {
    const entry = parseMarketplaceCatalog({ skills: [{
      id: 'meeting-brief', version: 1, title: 'Meeting brief', summary: 'Brief',
      sha256: 'a'.repeat(64), contentUrl: 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/meeting-brief/SKILL.md',
    }] }, catalogUrl)[0]!
    expect(publicMarketplaceEntry(entry, false)).toMatchObject({ id: 'meeting-brief', source: 'marketplace', installed: false })
    expect(() => parseMarketplaceCatalog({ skills: [{ ...entry, id: 'bad_skill' }] }, catalogUrl)).toThrow()
    expect(() => parseMarketplaceCatalog({ skills: [{ ...entry, contentUrl: 'https://example.com/skill.md' }] }, catalogUrl)).toThrow(/raw.githubusercontent.com/)
  })

  it('verifies downloaded content against the catalog digest and frontmatter', async () => {
    const content = '---\nname: meeting-brief\n---\n\n# Brief\n'
    const sha256 = createHash('sha256').update(content).digest('hex')
    const entry = parseMarketplaceCatalog({ skills: [{
      id: 'meeting-brief', version: 1, title: 'Meeting brief', summary: 'Brief', sha256,
      contentUrl: 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/meeting-brief/SKILL.md',
    }] }, catalogUrl)[0]!
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(content, { status: 200 }))
    await expect(fetchMarketplaceSkill(entry, fetchImpl)).resolves.toBe(content)
    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect(fetchMarketplaceSkill({ ...entry, sha256: 'b'.repeat(64) }, fetchImpl)).rejects.toThrow(/SHA-256/)
  })

  it('rejects invalid source URLs and resets its cache seam for tests', () => {
    expect(() => parseMarketplaceCatalog([], 'http://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json')).toThrow(/HTTPS/)
    resetMarketplaceCacheForTests()
  })
})
