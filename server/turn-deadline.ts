export const MIN_TURN_TIMEOUT_MS = 1_000
export const MAX_TURN_TIMEOUT_MS = 30 * 60_000

/**
 * Fifteen minutes is long enough for a normal local provider turn while
 * ensuring a stuck adapter cannot hold a task indefinitely by default.
 */
export const DEFAULT_TURN_TIMEOUT_MS = 15 * 60_000

/**
 * Give an adapter a short, bounded window to honor abort after a timeout.
 * If it remains live after this window, the active-run fence stays in place
 * until the adapter promise settles so a retry cannot overlap the provider.
 */
export const TURN_CLEANUP_GRACE_MS = 5_000

const boundedTimeout = (timeoutMs: number) => Math.min(MAX_TURN_TIMEOUT_MS, Math.max(MIN_TURN_TIMEOUT_MS, timeoutMs))

export const resolveTurnTimeoutMs = (env: NodeJS.ProcessEnv = process.env) => {
  const raw = env.ONEVIBE_TURN_TIMEOUT_MS?.trim()
  if (!raw || !/^-?\d+$/.test(raw)) return DEFAULT_TURN_TIMEOUT_MS

  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? boundedTimeout(parsed) : DEFAULT_TURN_TIMEOUT_MS
}

export class TurnTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`Turn exceeded the ${timeoutMs}ms deadline`)
    this.name = 'TurnTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export type TurnDeadline = {
  readonly timeoutMs: number
  readonly expired: boolean
  readonly promise: Promise<never>
  clear: () => void
}

export type TurnSettlement = 'settled' | 'grace_expired'

export const awaitTurnSettlement = async (run: Promise<unknown>, graceMs: number): Promise<TurnSettlement> => {
  if (!Number.isSafeInteger(graceMs) || graceMs < 1) throw new RangeError('Cleanup grace must be a positive safe integer')

  let timer!: ReturnType<typeof setTimeout>
  const settled = run.then(() => 'settled' as const, () => 'settled' as const)
  const grace = new Promise<TurnSettlement>((resolve) => {
    timer = setTimeout(() => resolve('grace_expired'), graceMs)
  })
  try {
    return await Promise.race([settled, grace])
  } finally {
    clearTimeout(timer)
  }
}

export const createTurnDeadline = ({ timeoutMs, onExpire }: {
  timeoutMs: number
  onExpire: () => void
}): TurnDeadline => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new RangeError('Turn timeout must be a positive safe integer')

  let expired = false
  let timer: ReturnType<typeof setTimeout>
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true
      const error = new TurnTimeoutError(timeoutMs)
      try {
        onExpire()
      } finally {
        reject(error)
      }
    }, timeoutMs)
  })

  return {
    timeoutMs,
    get expired() { return expired },
    promise,
    clear: () => clearTimeout(timer),
  }
}
