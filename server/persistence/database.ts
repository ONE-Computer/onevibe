import Database from 'better-sqlite3'

export interface DatabaseOptions {
  readonly?: boolean
  fileMustExist?: boolean
  timeoutMs?: number
}

export function openDatabase(filename: string, options: DatabaseOptions = {}): Database.Database {
  const timeoutMs = options.timeoutMs ?? 5_000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new RangeError('timeoutMs must be a non-negative safe integer')

  const database = new Database(filename, {
    readonly: options.readonly ?? false,
    fileMustExist: options.fileMustExist ?? false,
    timeout: timeoutMs,
  })

  try {
    database.pragma('foreign_keys = ON')
    database.pragma(`busy_timeout = ${timeoutMs}`)
    if (!options.readonly) {
      database.pragma('journal_mode = WAL')
      database.pragma('synchronous = FULL')
    }

    if (database.pragma('foreign_keys', { simple: true }) !== 1) throw new Error('SQLite foreign key enforcement is unavailable')
    if (!options.readonly && database.pragma('synchronous', { simple: true }) !== 2) throw new Error('SQLite synchronous=FULL was not applied')
    return database
  } catch (error) {
    database.close()
    throw error
  }
}
