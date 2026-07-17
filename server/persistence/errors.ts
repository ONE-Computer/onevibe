export class PersistenceError extends Error {
  override readonly name: string = 'PersistenceError'
}

export class RecordNotFoundError extends PersistenceError {
  override readonly name = 'RecordNotFoundError'
}

export class OptimisticConflictError extends PersistenceError {
  override readonly name: string = 'OptimisticConflictError'
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

export class ActiveRuntimeLeaseConflictError extends OptimisticConflictError {
  override readonly name = 'ActiveRuntimeLeaseConflictError'
}

export class RuntimeLeaseGenerationConflictError extends OptimisticConflictError {
  override readonly name = 'RuntimeLeaseGenerationConflictError'
}

export class InvalidRuntimeLeaseTransitionError extends PersistenceError {
  override readonly name = 'InvalidRuntimeLeaseTransitionError'
}

export class RuntimeLeaseAllocationConflictError extends OptimisticConflictError {
  override readonly name = 'RuntimeLeaseAllocationConflictError'
}

export class RuntimeLeaseProviderIdentityConflictError extends OptimisticConflictError {
  override readonly name = 'RuntimeLeaseProviderIdentityConflictError'
}

export class ThemeVersionConflictError extends OptimisticConflictError {
  override readonly name = 'ThemeVersionConflictError'
}
