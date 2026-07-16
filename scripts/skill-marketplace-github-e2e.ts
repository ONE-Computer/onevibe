import { DEFAULT_SKILL_CATALOG_URL, fetchMarketplaceSkill, loadMarketplaceCatalog } from '../server/skill-marketplace.js'

const run = async () => {
  const entries = await loadMarketplaceCatalog(DEFAULT_SKILL_CATALOG_URL)
  if (!entries.length) throw new Error('The pushed GitHub skill catalog returned no entries')

  const verified = []
  for (const entry of entries) {
    const content = await fetchMarketplaceSkill(entry)
    verified.push({ id: entry.id, version: entry.version, bytes: Buffer.byteLength(content, 'utf8'), sha256: entry.sha256 })
  }

  console.log(JSON.stringify({
    catalog: DEFAULT_SKILL_CATALOG_URL,
    entryCount: entries.length,
    verified,
    networkBoundary: 'raw.githubusercontent.com-only content; no credentials supplied',
  }, null, 2))
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
