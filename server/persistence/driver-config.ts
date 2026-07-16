export type PersistenceDriver = 'sqlite' | 'postgres'

export type PersistenceConfig = {
  active: 'sqlite'
  postgresContract: true
  runtimeSwitchReady: false
  detail: string
}

/**
 * Resolve persistence before opening the local store. The Postgres contract
 * exists, but no async TaskStore repository adapter exists yet. Refusing a
 * Postgres selection prevents DATABASE_URL from creating a misleading mixed
 * deployment where the app silently continues writing to SQLite.
 */
export const resolvePersistenceConfig = (env: NodeJS.ProcessEnv = process.env): PersistenceConfig => {
  const hasDatabaseUrl = Boolean(env.DATABASE_URL?.trim())
  const requested = env.ONEVIBE_PERSISTENCE_DRIVER?.trim() || (hasDatabaseUrl ? 'postgres' : 'sqlite')
  if (requested !== 'sqlite' && requested !== 'postgres') {
    throw new Error(`Unsupported ONEVIBE_PERSISTENCE_DRIVER '${requested}'. Choose sqlite or postgres.`)
  }
  if (requested === 'postgres') {
    throw new Error('Postgres persistence was requested, but the TaskStore Postgres repository adapter is not ready; refusing to start on a mixed or misleading driver.')
  }
  if (hasDatabaseUrl) {
    throw new Error('DATABASE_URL is set while SQLite was selected, but the TaskStore Postgres repository adapter is not ready; refusing to start on mixed persistence.')
  }
  return {
    active: 'sqlite',
    postgresContract: true,
    runtimeSwitchReady: false,
    detail: 'The running TaskStore uses local SQLite; the reviewed Drizzle/Postgres contract is not the active runtime driver.',
  }
}
