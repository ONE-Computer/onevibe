export const createRefreshScheduler = (refresh: () => Promise<unknown>) => {
  let running = false
  let pending = false
  let disposed = false
  const run = async () => {
    if (disposed) return
    if (running) { pending = true; return }
    running = true
    try {
      do {
        pending = false
        await refresh()
      } while (pending && !disposed)
    } finally {
      running = false
    }
  }
  return { run, dispose: () => { disposed = true; pending = false } }
}
