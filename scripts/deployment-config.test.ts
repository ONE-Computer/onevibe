import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('managed deployment contract', () => {
  it('keeps the Fly release command migration-first and health-gated', async () => {
    const manifest = await readFile(path.join(root, 'fly.toml'), 'utf8')
    expect(manifest).toContain('release_command = "npm run db:ops -- migrate"')
    expect(manifest).toContain('path = "/api/health/ready"')
    expect(manifest).toContain('ONEVIBE_PERSISTENCE_DRIVER = "postgres"')
    const configOnly = manifest.replace(/^\s*#.*$/gm, '')
    expect(configOnly).not.toMatch(/DATABASE_URL|LITELLM_API_KEY|BETTER_AUTH_SECRET|TOKEN\s*=/i)
    expect(manifest).toContain('app = "onevibe-change-me"')
  })
})
