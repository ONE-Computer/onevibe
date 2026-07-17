import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { tenantThemeConfigSchema, type TenantThemeConfig } from './theme-config.js'

const referenceProfileId = z.enum(['reference-institutional', 'reference-financial', 'reference-philanthropic'])
const referenceProfilesSchema = z.array(tenantThemeConfigSchema).max(3)
const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/fixtures/themes/reference-profiles.json')

let profilesPromise: Promise<TenantThemeConfig[]> | undefined

export const parseReferenceThemeProfiles = (value: unknown): TenantThemeConfig[] => referenceProfilesSchema.parse(value)

const readReferenceProfiles = async () => {
  profilesPromise ??= readFile(fixturePath, 'utf8').then((contents) => parseReferenceThemeProfiles(JSON.parse(contents) as unknown))
  return profilesPromise
}

/**
 * Read-only, non-production fixture preview. The identifier is an exact
 * allow-listed reference profile; it is never a tenant resource selector and
 * cannot be used by PUT/reset or to select a runtime/policy.
 */
export const loadReferenceThemeProfile = async (tenantId: string | undefined, environment: NodeJS.ProcessEnv = process.env): Promise<TenantThemeConfig | undefined> => {
  if (environment.NODE_ENV === 'production') return undefined
  const candidate = tenantId?.trim()
  if (!candidate || !referenceProfileId.safeParse(candidate).success) return undefined
  const profiles = await readReferenceProfiles()
  return profiles.find((profile) => profile.tenantId === candidate)
}

