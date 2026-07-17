import assert from 'node:assert/strict'

const baseUrl = (process.env.ONEVIBE_API_URL ?? 'http://127.0.0.1:4311').replace(/\/$/, '')

const getJson = async (path: string) => {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) })
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`)
  return response.json() as Promise<Record<string, unknown>>
}

const main = async () => {
  const health = await getJson('/api/health')
  const diagnostics = await getJson('/api/diagnostics')
  assert.equal(health.status, 'healthy')
  const persistence = diagnostics.persistence as { active?: unknown; runtimeSwitchReady?: unknown } | undefined
  assert.equal(persistence?.active, 'postgres')
  assert.equal(persistence?.runtimeSwitchReady, true)
  const modelBoundary = diagnostics.modelBoundary as { directFirstPartyAllowed?: unknown } | undefined
  assert.equal(modelBoundary?.directFirstPartyAllowed, false)
  const protectedTasks = await fetch(`${baseUrl}/api/tasks`, { signal: AbortSignal.timeout(10_000) })
  assert.equal(protectedTasks.status, 401)
  console.log(JSON.stringify({ driver: persistence?.active, runtimeSwitchReady: persistence?.runtimeSwitchReady, routeReads: ['health', 'diagnostics'], ownerScopeProtection: protectedTasks.status, directFirstPartyAllowed: modelBoundary?.directFirstPartyAllowed }))
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1 })
