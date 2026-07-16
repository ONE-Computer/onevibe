import { describe, expect, it } from 'vitest'
import { resolvePersistenceConfig } from './driver-config.js'

describe('persistence driver selection', () => {
  it('defaults to the local SQLite driver without cloud configuration', () => {
    expect(resolvePersistenceConfig({})).toMatchObject({ active: 'sqlite', postgresContract: true, runtimeSwitchReady: false })
  })

  it('allows explicit SQLite selection', () => {
    expect(resolvePersistenceConfig({ ONEVIBE_PERSISTENCE_DRIVER: 'sqlite' }).active).toBe('sqlite')
  })

  it('fails closed when DATABASE_URL would otherwise be silently ignored', () => {
    expect(() => resolvePersistenceConfig({ DATABASE_URL: 'postgres://redacted' })).toThrow(/Postgres persistence was requested/)
    expect(() => resolvePersistenceConfig({ DATABASE_URL: 'postgres://redacted', ONEVIBE_PERSISTENCE_DRIVER: 'sqlite' })).toThrow(/refusing to start/)
  })

  it('fails closed for explicit Postgres selection and invalid drivers', () => {
    expect(() => resolvePersistenceConfig({ ONEVIBE_PERSISTENCE_DRIVER: 'postgres' })).toThrow(/Postgres persistence was requested/)
    expect(() => resolvePersistenceConfig({ ONEVIBE_PERSISTENCE_DRIVER: 'memory' })).toThrow(/Unsupported ONEVIBE_PERSISTENCE_DRIVER/)
  })
})
