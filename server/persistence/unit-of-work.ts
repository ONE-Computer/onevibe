import type Database from 'better-sqlite3'
import type { Repositories, UnitOfWork } from './contracts.js'
import { createSqliteRepositories } from './repositories.js'

export type RepositoryFactory = (database: Database.Database) => Repositories

export class SqliteUnitOfWork implements UnitOfWork {
  readonly #transaction: (work: (repositories: Repositories) => unknown) => unknown

  constructor(database: Database.Database, createRepositories: RepositoryFactory = createSqliteRepositories) {
    const transact = database.transaction((work: (repositories: Repositories) => unknown) => work(createRepositories(database)))
    this.#transaction = (work) => transact.immediate(work)
  }

  run<T>(work: (repositories: Repositories) => T): T {
    return this.#transaction(work) as T
  }
}

export function runInTransaction<T>(database: Database.Database, work: () => T): T {
  return database.transaction(work).immediate()
}
