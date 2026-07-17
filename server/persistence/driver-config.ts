export type PersistenceDriver = 'sqlite' | 'postgres'

export type PersistenceConfig = {
  active: PersistenceDriver
  postgresContract: true
  runtimeSwitchReady: boolean
  detail: string
}

/**
 * Resolve persistence before opening the store. Postgres is opt-in through an
 * explicit driver or DATABASE_URL; SQLite cannot start while a database URL is
 * present because that would create a misleading mixed deployment.
 */
export const resolvePersistenceConfig = (env: NodeJS.ProcessEnv = process.env): PersistenceConfig => {
  const hasDatabaseUrl = Boolean(env.DATABASE_URL?.trim())
  const requested = env.ONEVIBE_PERSISTENCE_DRIVER?.trim() || (hasDatabaseUrl ? 'postgres' : 'sqlite')
  if (requested !== 'sqlite' && requested !== 'postgres') {
    throw new Error(`Unsupported ONEVIBE_PERSISTENCE_DRIVER '${requested}'. Choose sqlite or postgres.`)
  }
  if (requested === 'postgres') {
    if (!hasDatabaseUrl) throw new Error('Postgres persistence requires DATABASE_URL; refusing to start without an explicit database connection.')
    return {
      active: 'postgres', postgresContract: true, runtimeSwitchReady: true,
      detail: 'The running TaskStore uses the reviewed owner-scoped Postgres repository; local workspace files are materialized caches and the migration ledger must be applied before startup.',
    }
  }
  if (hasDatabaseUrl) {
    throw new Error('DATABASE_URL is set while SQLite was selected; refusing to start on mixed persistence. Set ONEVIBE_PERSISTENCE_DRIVER=postgres.')
  }
  return {
    active: 'sqlite',
    postgresContract: true,
    runtimeSwitchReady: false,
    detail: 'The running TaskStore uses local SQLite; Postgres remains opt-in through ONEVIBE_PERSISTENCE_DRIVER=postgres and DATABASE_URL.',
  }
}
