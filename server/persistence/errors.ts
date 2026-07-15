export class PersistenceError extends Error {
  override readonly name: string = 'PersistenceError'
}

export class RecordNotFoundError extends PersistenceError {
  override readonly name = 'RecordNotFoundError'
}

export class OptimisticConflictError extends PersistenceError {
  override readonly name = 'OptimisticConflictError'
}

export class IdempotencyConflictError extends PersistenceError {
  override readonly name = 'IdempotencyConflictError'
}

export class InvalidCursorError extends PersistenceError {
  override readonly name = 'InvalidCursorError'
}

export class LegacyImportValidationError extends PersistenceError {
  override readonly name = 'LegacyImportValidationError'
}
