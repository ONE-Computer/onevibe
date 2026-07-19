import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { DemoRuntimeAdapter } from './demo-runner.js'
import { ClaudeSdkRuntimeAdapter } from './claude-sdk-runner.js'
import { CodexRuntimeAdapter } from './codex-runner.js'
import { AgentCoreRuntimeAdapter } from './agentcore-runner.js'
import { OneComputerClient } from './onecomputer-client.js'
import { OneComputerSandboxRuntimeAdapter } from './onecomputer-sandbox-runner.js'
import { RemoteRuntimeAdapter } from './remote-runner.js'
import { A2aRuntimeAdapter } from './a2a-adapter.js'
import { KimiRuntimeAdapter } from './kimi-runner.js'
import type { RuntimeAdapter } from './runtime-adapter.js'
import { TaskStore } from './store.js'
import { UserInputBroker } from './user-input-broker.js'
import { WalletApprovalService } from './wallet-approval-service.js'
import { RuntimeRegistry } from './runtime-registry.js'
import { claudeProviderConfig } from './claude-provider-config.js'
import { resolveTurnTimeoutMs } from './turn-deadline.js'
import { AuthService } from './auth.js'
import { resolvePersistenceConfig } from './persistence/driver-config.js'
import { IdempotencyConflictError, OptimisticConflictError, RecordNotFoundError, ThemeVersionConflictError } from './persistence/errors.js'
import { createRuntimeWiring } from './runtime-wiring.js'
import { createTurnExecutor } from './turn-executor.js'
import { createFollowUpOps } from './http/follow-up.js'
import { createRouter, type RouterContext } from './http/router.js'
import { json } from './http/helpers.js'

const PORT = Number(process.env.ONEVIBE_API_PORT ?? 4311)
const HOST = process.env.ONEVIBE_API_HOST ?? '127.0.0.1'
const REMOTE_RUNTIME_URL = process.env.ONEVIBE_RUNTIME_URL
const REMOTE_RUNTIME_TOKEN = process.env.ONEVIBE_RUNTIME_BEARER_TOKEN
const A2A_BASE_URL = process.env.ONEVIBE_A2A_BASE_URL
const A2A_BEARER_TOKEN = process.env.ONEVIBE_A2A_BEARER_TOKEN
const KIMI_SERVER_URL = process.env.KIMI_SERVER_URL
const KIMI_SESSION_ID = process.env.KIMI_SESSION_ID
const AGENTCORE_RUNTIME_URL = process.env.AGENTCORE_RUNTIME_URL
const AGENTCORE_RUNTIME_TOKEN = process.env.AGENTCORE_RUNTIME_BEARER_TOKEN
const AGENTCORE_LITELLM_ROUTED = process.env.ONEVIBE_AGENTCORE_LITELLM_ROUTED === 'true'
const ONECOMPUTER_API_URL = process.env.ONECOMPUTER_API_URL
const ONECOMPUTER_SERVICE_TOKEN = process.env.ONECOMPUTER_SERVICE_TOKEN
const ONECOMPUTER_PROJECT_ID = process.env.ONECOMPUTER_PROJECT_ID
const ONECOMPUTER_GATEWAY_ENFORCED = process.env.ONECOMPUTER_GATEWAY_ENFORCED === 'true'
const ONECOMPUTER_RETAIN_SANDBOX = process.env.ONECOMPUTER_RETAIN_SANDBOX === 'true'
const ONECOMPUTER_VISUAL_RUNTIME = process.env.ONECOMPUTER_VISUAL_RUNTIME !== 'false'
const ONECOMPUTER_BROWSER_AUTOMATION = process.env.ONECOMPUTER_BROWSER_AUTOMATION === 'true'
const WALLET_TOKEN = process.env.ONEVIBE_WALLET_TOKEN
const TURN_TIMEOUT_MS = resolveTurnTimeoutMs()
const FOLLOW_UP_LEASE_MS = Math.max(30_000, Math.min(Number(process.env.ONEVIBE_FOLLOW_UP_LEASE_MS ?? 120_000), 15 * 60_000))
const FOLLOW_UP_WORKER_ID = `onevibe-worker-${randomUUID()}`
const persistenceConfig = resolvePersistenceConfig()
// Only this readiness boolean is sent to the browser. Credential material
// remains server-only and is never copied into task evidence.
const claudeProvider = claudeProviderConfig()
const claudeConfigured = claudeProvider.configured
const store = new TaskStore(undefined, { driver: persistenceConfig.active, databaseUrl: process.env.DATABASE_URL })
const activeRuns = new Map<string, AbortController>()
const activeAdapters = new Map<string, RuntimeAdapter>()
const inputBroker = new UserInputBroker(store)
const walletService = WALLET_TOKEN ? new WalletApprovalService(store, WALLET_TOKEN) : undefined
const oneComputerConfigured = Boolean(ONECOMPUTER_API_URL && ONECOMPUTER_SERVICE_TOKEN && (!ONECOMPUTER_SERVICE_TOKEN.startsWith('oc_org_') || ONECOMPUTER_PROJECT_ID))

const runtimeRegistry = new RuntimeRegistry({
  defaultProvider: process.env.ONEVIBE_DEFAULT_PROVIDER,
  factories: {
    demo: () => new DemoRuntimeAdapter(),
    claude_sdk: () => new ClaudeSdkRuntimeAdapter(),
    codex: () => new CodexRuntimeAdapter(),
    agentcore: () => new AgentCoreRuntimeAdapter(AGENTCORE_RUNTIME_URL as string, AGENTCORE_RUNTIME_TOKEN),
    remote: () => new RemoteRuntimeAdapter(REMOTE_RUNTIME_URL as string, REMOTE_RUNTIME_TOKEN),
    a2a: () => new A2aRuntimeAdapter(A2A_BASE_URL as string, A2A_BEARER_TOKEN),
    kimi: () => new KimiRuntimeAdapter(KIMI_SERVER_URL as string, KIMI_SESSION_ID, process.cwd()),
    onecomputer: () => new OneComputerSandboxRuntimeAdapter(new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL!, serviceToken: ONECOMPUTER_SERVICE_TOKEN!, projectId: ONECOMPUTER_PROJECT_ID }), {
      gatewayEnforced: ONECOMPUTER_GATEWAY_ENFORCED, retainSandbox: ONECOMPUTER_RETAIN_SANDBOX,
      visualRuntime: ONECOMPUTER_VISUAL_RUNTIME, browserAutomation: ONECOMPUTER_BROWSER_AUTOMATION,
    }),
  },
})

const runtimeWiring = createRuntimeWiring({
  runtimeRegistry, claudeProvider, oneComputerConfigured,
  env: { AGENTCORE_RUNTIME_URL, AGENTCORE_LITELLM_ROUTED, REMOTE_RUNTIME_URL, A2A_BASE_URL, KIMI_SERVER_URL, ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN, ONECOMPUTER_PROJECT_ID },
})
const turnExecutor = createTurnExecutor({
  store, runtimeRegistry, inputBroker, activeRuns, activeAdapters,
  fallbackRuntimeFor: runtimeWiring.fallbackRuntimeFor,
  providerAvailability: runtimeWiring.providerAvailability,
  TURN_TIMEOUT_MS, FOLLOW_UP_WORKER_ID, FOLLOW_UP_LEASE_MS,
})
const followUpOps = createFollowUpOps({ store, activeRuns, executeTask: turnExecutor.executeTask, FOLLOW_UP_LEASE_MS, FOLLOW_UP_WORKER_ID })

const context: RouterContext = {
  store, inputBroker, walletService, persistenceConfig,
  authService: undefined, applicationReady: false,
  runtimeSnapshot: runtimeWiring.runtimeSnapshot,
  providerAvailability: runtimeWiring.providerAvailability,
  oneComputerReachability: runtimeWiring.oneComputerReachability,
  executeTask: turnExecutor.executeTask,
  dispatchSchedule: turnExecutor.dispatchSchedule,
  materializeFollowUpOperation: followUpOps.materializeFollowUpOperation,
  scheduleReadyFollowUpOperation: followUpOps.scheduleReadyFollowUpOperation,
  stageFollowUpAttachments: followUpOps.stageFollowUpAttachments,
  operationResponse: followUpOps.operationResponse,
  followUpRequestHash: followUpOps.followUpRequestHash,
  activeRuns, activeAdapters, runtimeRegistry,
  env: { HOST, PORT, REMOTE_RUNTIME_URL, ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN, ONECOMPUTER_PROJECT_ID, oneComputerConfigured, claudeConfigured },
}
const route = createRouter(context)

await store.initialize()
const authService = new AuthService(store.authDatabaseHandle(), store.authDatabaseDriver())
context.authService = authService
await authService.initialize()
const recoverFollowUpOperations = async () => {
  for (const operation of await store.listRecoverableFollowUpOperations()) {
    try {
      if (operation.state === 'running') {
        if (operation.providerState === 'not_started') {
          const reset = await store.updateFollowUpOperation(operation, { state: 'ready', leaseOwner: null, leaseExpiresAt: null, errorJson: null })
          if (reset.executionMode === 'immediate' || reset.guidanceId !== null) await followUpOps.scheduleReadyFollowUpOperation(reset)
        } else {
          await store.updateFollowUpOperation(operation, {
            state: 'failed', providerState: 'unknown', leaseOwner: null, leaseExpiresAt: null,
            errorJson: JSON.stringify({ code: 'PROVIDER_OUTCOME_UNKNOWN', message: 'Process restarted after the provider request was durably marked started; automatic replay is disabled because the external outcome is unknown.', retryable: false, reconciliationRequired: true }),
            completedAt: new Date().toISOString(), providerCompletedAt: new Date().toISOString(),
          })
          await store.updateTask(operation.taskId, { status: 'failed' })
        }
        continue
      }
      const ready = operation.state === 'prepared' ? await followUpOps.materializeFollowUpOperation(operation) : operation
      if (ready.state === 'ready' && (ready.executionMode === 'immediate' || ready.guidanceId !== null)) await followUpOps.scheduleReadyFollowUpOperation(ready)
    } catch (error) {
      console.error(`Follow-up operation recovery failed for ${operation.id}:`, error instanceof Error ? error.message : String(error))
    }
  }
}
await recoverFollowUpOperations()
context.applicationReady = true
void runtimeWiring.runtimeSnapshot().catch(() => undefined)
const runDueSchedules = async () => {
  for (const schedule of await store.claimDueSchedules()) {
    await turnExecutor.dispatchSchedule(schedule, 'scheduled')
  }
}
setInterval(() => { void runDueSchedules().catch((error: unknown) => console.error('Schedule dispatch failed', error)) }, 15_000).unref()
const httpServer = createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const status = error instanceof z.ZodError || error instanceof RangeError ? 400
      : error instanceof IdempotencyConflictError || error instanceof OptimisticConflictError ? 409
      : message === 'Wallet authorization failed' ? 401
          : message === 'Organization owner access required' ? 403
          : error instanceof RecordNotFoundError || /not found(?:$|\s)/.test(message) ? 404
          : /(?:not pending|has expired|no longer active|cannot remove themselves)/.test(message) ? 409
            : 500
    json(response, status, { error: message, ...(error instanceof ThemeVersionConflictError ? { code: 'theme_version_conflict' } : {}) })
  })
})
let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  context.applicationReady = false
  const closed = new Promise<void>((resolve) => httpServer.close(() => resolve()))
  await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 5_000))])
  await store.close()
}
process.once('SIGTERM', () => { void shutdown().then(() => process.exit(0)).catch(() => process.exit(1)) })
process.once('SIGINT', () => { void shutdown().then(() => process.exit(0)).catch(() => process.exit(1)) })
httpServer.listen(PORT, HOST, () => {
  console.log(`ONEVibe API listening at http://${HOST}:${PORT}`)
})
