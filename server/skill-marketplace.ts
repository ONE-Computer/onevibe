import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SkillInstallation } from './types.js'

export const DEFAULT_SKILL_CATALOG_URL = 'https://raw.githubusercontent.com/ONE-Computer/onevibe/main/skills/catalog.json'
const CATALOG_TTL_MS = 5 * 60_000
const MAX_CONTENT_BYTES = 256 * 1024
const skillId = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/)
const catalogEntrySchema = z.object({
  id: skillId,
  version: z.number().int().min(1).max(10_000),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  contentUrl: z.string().url(),
  sourceUrl: z.string().url().optional(),
})
const catalogSchema = z.union([z.array(catalogEntrySchema), z.object({ skills: z.array(catalogEntrySchema) })])

export type MarketplaceCatalogEntry = z.infer<typeof catalogEntrySchema> & { sourceUrl: string }

let cache: { url: string; expiresAt: number; entries: MarketplaceCatalogEntry[] } | undefined

const githubUrl = (value: string, label: string) => {
  const url = new URL(value)
  const localTestUrl = process.env.NODE_ENV === 'test' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && url.protocol === 'http:'
  if ((!localTestUrl && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) throw new Error(`${label} must be an HTTPS GitHub URL without credentials or query parameters`)
  if (!localTestUrl && label === 'contentUrl' && url.hostname !== 'raw.githubusercontent.com') throw new Error('Marketplace contentUrl must use raw.githubusercontent.com')
  if (!localTestUrl && label === 'sourceUrl' && url.hostname !== 'github.com' && url.hostname !== 'raw.githubusercontent.com') throw new Error('Marketplace sourceUrl must use GitHub')
  return url.toString()
}

export const parseMarketplaceCatalog = (value: unknown, catalogUrl: string): MarketplaceCatalogEntry[] => {
  const parsed = catalogSchema.parse(value)
  const entries = Array.isArray(parsed) ? parsed : parsed.skills
  const sourceUrl = githubUrl(catalogUrl, 'catalogUrl')
  const seen = new Set<string>()
  return entries.map((entry) => {
    if (seen.has(entry.id)) throw new Error(`Marketplace catalog contains duplicate skill '${entry.id}'`)
    seen.add(entry.id)
    const contentUrl = githubUrl(entry.contentUrl, 'contentUrl')
    const entrySourceUrl = githubUrl(entry.sourceUrl ?? sourceUrl, 'sourceUrl')
    return { ...entry, contentUrl, sourceUrl: entrySourceUrl }
  })
}

const limitedText = async (response: Response): Promise<string> => {
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_CONTENT_BYTES) throw new Error('Marketplace skill content exceeds the 256 KiB limit')
  if (!response.body) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > MAX_CONTENT_BYTES) throw new Error('Marketplace response exceeds the 256 KiB limit')
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_CONTENT_BYTES) throw new Error('Marketplace response exceeds the 256 KiB limit')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

export const loadMarketplaceCatalog = async (
  catalogUrl = process.env.ONEVIBE_SKILL_CATALOG_URL?.trim() || DEFAULT_SKILL_CATALOG_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketplaceCatalogEntry[]> => {
  const now = Date.now()
  if (cache && cache.url === catalogUrl && cache.expiresAt > now) return cache.entries
  try {
    const response = await fetchImpl(catalogUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`Marketplace catalog returned HTTP ${response.status}`)
    const entries = parseMarketplaceCatalog(await response.json() as unknown, catalogUrl)
    cache = { url: catalogUrl, expiresAt: now + CATALOG_TTL_MS, entries }
    return entries
  } catch {
    // A catalog outage must not hide built-in skills. Install requests still
    // surface the error to the caller instead of pretending installation worked.
    cache = { url: catalogUrl, expiresAt: now + 15_000, entries: [] }
    return []
  }
}

export const fetchMarketplaceSkill = async (entry: MarketplaceCatalogEntry, fetchImpl: typeof fetch = fetch): Promise<string> => {
  const response = await fetchImpl(entry.contentUrl, { headers: { Accept: 'text/markdown' }, signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`Marketplace skill content returned HTTP ${response.status}`)
  const content = await limitedText(response)
  const digest = createHash('sha256').update(content, 'utf8').digest('hex')
  if (digest !== entry.sha256) throw new Error(`Marketplace skill '${entry.id}' failed SHA-256 verification`)
  if (!new RegExp(`^name:\\s*${entry.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(content)) throw new Error(`Marketplace skill '${entry.id}' has invalid SKILL.md frontmatter`)
  return content
}

export const publicMarketplaceEntry = (entry: MarketplaceCatalogEntry, installed: boolean): SkillInstallation => ({
  id: entry.id, version: entry.version, title: entry.title, summary: entry.summary, sha256: entry.sha256,
  contentUrl: entry.contentUrl, source: 'marketplace', installed,
})

export const resetMarketplaceCacheForTests = () => { cache = undefined }
