import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { OneComputerClient } from '../onecomputer-client.js'
import { RuntimeLeaseService } from '../runtime-lease-service.js'
import { describeModel } from '../model-registry.js'
import { probeMcpConfig } from '../mcp-facade.js'
import { writeDocumentReviewArtifacts } from '../mode-artifacts.js'
import { isInternalWorkspacePath, isPrivateWorkspacePath, normalizeWorkspacePath } from '../artifact-path.js'
import { encodeRuntimeEventFrame, eventsAfterLastEventId, openReplayLiveHandoff } from '../task-event-stream.js'
import { evaluateAction } from '../policy.js'
import { approvalIntentHash, evidenceHeadFor } from '../approval-intent.js'
import { baseTenantThemeConfig, tenantThemeConfigSchema } from '../theme-config.js'
import { loadReferenceThemeProfile } from '../theme-reference-profiles.js'
import { serveStatic } from '../static-files.js'
import { fetchMarketplaceSkill, loadMarketplaceCatalog, publicMarketplaceEntry } from '../skill-marketplace.js'
import { skillPackCatalog } from '../skill-packs.js'
import type { AuthService } from '../auth.js'
import type { RuntimeAdapter } from '../runtime-adapter.js'
import type { RuntimeRegistry } from '../runtime-registry.js'
import type { TaskStore } from '../store.js'
import type { UserInputBroker } from '../user-input-broker.js'
import type { WalletApprovalService } from '../wallet-approval-service.js'
import type { resolvePersistenceConfig } from '../persistence/driver-config.js'
import type { TurnExecutor } from '../turn-executor.js'
import type { RuntimeWiring } from '../runtime-wiring.js'
import type { FollowUpOps } from './follow-up.js'
import { json, readBody } from './helpers.js'
import {
  assignTaskAgentInput, builtInSkillIdSet, configuredThemeOrganization, contentHash, createOrganizationInput, createProjectInput,
  createScheduleInput, createTaskInput, editFileInput, followUpInput, followUpReconcileInput, forkTaskInput, idempotencyKeyInput,
  inputAnswer, mcpConfigInput, moveTaskProjectInput, organizationMemberInput, parseTenantThemeConfig, projectAttachment,
  restoreProjectFileInput, retryInput, runtimeProviderInput, scheduleStateInput, taskSkill, tenantThemeUpdateInput, textFilePattern,
  updateProjectInput, updateTaskBoardInput, updateTaskEpicInput, updateTaskTagsInput, walletDecision,
} from './schemas.js'

export interface RouterContext {
  store: TaskStore
  inputBroker: UserInputBroker
  walletService: WalletApprovalService | undefined
  persistenceConfig: ReturnType<typeof resolvePersistenceConfig>
  // authService and applicationReady are mutated by the entrypoint during boot
  // and shutdown; handlers must always read them live from this object.
  authService: AuthService | undefined
  applicationReady: boolean
  runtimeSnapshot: RuntimeWiring['runtimeSnapshot']
  providerAvailability: RuntimeWiring['providerAvailability']
  oneComputerReachability: RuntimeWiring['oneComputerReachability']
  executeTask: TurnExecutor['executeTask']
  dispatchSchedule: TurnExecutor['dispatchSchedule']
  materializeFollowUpOperation: FollowUpOps['materializeFollowUpOperation']
  scheduleReadyFollowUpOperation: FollowUpOps['scheduleReadyFollowUpOperation']
  stageFollowUpAttachments: FollowUpOps['stageFollowUpAttachments']
  operationResponse: FollowUpOps['operationResponse']
  followUpRequestHash: FollowUpOps['followUpRequestHash']
  activeRuns: Map<string, AbortController>
  activeAdapters: Map<string, RuntimeAdapter>
  runtimeRegistry: RuntimeRegistry
  env: {
    HOST: string
    PORT: number
    REMOTE_RUNTIME_URL: string | undefined
    ONECOMPUTER_API_URL: string | undefined
    ONECOMPUTER_SERVICE_TOKEN: string | undefined
    ONECOMPUTER_PROJECT_ID: string | undefined
    oneComputerConfigured: boolean
    claudeConfigured: boolean
  }
}

export const createRouter = (context: RouterContext) => {
  const { store, inputBroker, walletService, persistenceConfig, runtimeSnapshot, providerAvailability, oneComputerReachability, executeTask, dispatchSchedule, materializeFollowUpOperation, scheduleReadyFollowUpOperation, stageFollowUpAttachments, operationResponse, followUpRequestHash, activeRuns, activeAdapters, runtimeRegistry } = context
  const { HOST, PORT, REMOTE_RUNTIME_URL, ONECOMPUTER_API_URL, ONECOMPUTER_SERVICE_TOKEN, ONECOMPUTER_PROJECT_ID, oneComputerConfigured, claudeConfigured } = context.env

  const skillCatalog = async (ownerUserId?: string) => {
    const builtins = skillPackCatalog().map((skill) => ({ ...skill, source: 'builtin' as const, installed: true }))
    const installed = await store.listSkillInstallations(ownerUserId)
    const installedById = new Map(installed.map((skill) => [skill.id, skill]))
    const marketplace = await loadMarketplaceCatalog()
    const entries = marketplace.map((entry) => publicMarketplaceEntry(entry, installedById.has(entry.id)))
    const remoteIds = new Set(entries.map((entry) => entry.id))
    return [...builtins, ...entries, ...installed.filter((skill) => !remoteIds.has(skill.id))]
  }

  const route = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${HOST}:${PORT}`}`)
    const segments = url.pathname.split('/').filter(Boolean)

    if (request.method === 'GET' && url.pathname === '/api/auth/session') {
      if (!context.authService?.isEnabled) return json(response, 200, { enabled: false, session: null })
      return json(response, 200, { enabled: true, session: await context.authService.getSession(request) })
    }
    if (url.pathname.startsWith('/api/auth/')) {
      if (!context.authService?.isEnabled) return json(response, 404, { error: 'Authentication is disabled in this local mode' })
      await context.authService.handle(request, response)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(response, 200, {
        status: 'healthy',
        ready: context.applicationReady,
        runtime: REMOTE_RUNTIME_URL ? 'remote_available' : 'demo_only',
        approvalAuthority: 'external_vti_wallet',
        walletResolutionConfigured: Boolean(walletService),
        oneComputerSandboxConfigured: oneComputerConfigured,
        authEnabled: Boolean(context.authService?.isEnabled),
      })
    }
    if (request.method === 'GET' && url.pathname === '/api/health/live') return json(response, 200, { status: 'alive' })
    if (request.method === 'GET' && url.pathname === '/api/health/ready') {
      const readiness = await store.readiness()
      return json(response, context.applicationReady && readiness.ready ? 200 : 503, { status: readiness.ready && context.applicationReady ? 'ready' : 'not_ready', applicationReady: context.applicationReady, ...readiness })
    }
    // ONEComputer middleware contract path (outside /api); Bearer-guarded like the wallet routes, before the session gate.
    if (request.method === 'GET' && url.pathname === '/onevibe/capabilities') {
      if (!walletService) return json(response, 503, { error: 'External wallet resolution is not configured' })
      walletService.authorize(request.headers.authorization)
      return json(response, 200, {
        version: '1',
        sandboxBackends: [
          { id: 'kasm', name: 'Kasm Workspaces', status: 'available' },
          { id: 'daytona', name: 'Daytona', status: 'unavailable' },
        ],
        connectors: [],
        features: { vtiConsentGate: false, approvalWebhook: false },
      })
    }
    const publicReadOnly = request.method === 'GET' && (url.pathname === '/api/runtime' || url.pathname.startsWith('/api/shares/'))
    const actorUserId = context.authService?.isEnabled && !publicReadOnly ? (await context.authService.getSession(request))?.user.id : undefined
    if (context.authService?.isEnabled && !publicReadOnly && !actorUserId) return json(response, 401, { error: 'Authentication required', code: 'unauthorized' })
    if (persistenceConfig.active === 'postgres' && !actorUserId && !publicReadOnly && url.pathname !== '/api/runtime' && url.pathname !== '/api/diagnostics') {
      return json(response, 401, { error: 'Authenticated owner scope is required for Postgres-backed data', code: 'owner_scope_required' })
    }
    await store.refreshPostgresState(actorUserId)
    if (request.method === 'GET' && url.pathname === '/api/runtime') return json(response, 200, await runtimeSnapshot())
    if (request.method === 'GET' && url.pathname === '/api/diagnostics') {
      const readiness = await runtimeSnapshot()
      const reachable = await oneComputerReachability()
      const mcpConfigs = actorUserId ? await store.listMcpConfigs(actorUserId) : []
      const mcpChecks = await Promise.all(mcpConfigs.map(async (config) => ({ name: config.name, ...(await probeMcpConfig({ ...config, env: {} })) })))
      const healthyMcpCount = mcpChecks.filter((check) => check.status === 'online').length
      const themeAudit = actorUserId ? await store.summarizeTenantThemeAudit(actorUserId) : { tenantCount: 0, eventCount: 0, latestOperation: null, latestAt: null }
      return json(response, 200, {
        modelBoundary: { name: 'LiteLLM', configured: claudeConfigured, directFirstPartyAllowed: false, detail: claudeConfigured ? 'Model traffic is configured to traverse the server-controlled LiteLLM relay.' : 'Configure the server-controlled LiteLLM relay; direct first-party model credentials are not accepted.' },
        auth: { enabled: Boolean(context.authService?.isEnabled), sessionScoped: Boolean(actorUserId), productionReady: false, detail: context.authService?.isEnabled ? 'Local user scope is active; Postgres/org/production acceptance remains open.' : 'Authentication is disabled in local mode.' },
        persistence: persistenceConfig,
        runtime: { providers: readiness.providers, defaultProvider: readiness.defaultProvider },
        sandbox: { configured: oneComputerConfigured, ...(reachable !== undefined ? { reachable } : {}), boundary: oneComputerConfigured ? 'development ONEComputer adapter' : 'host-process local runtime', detail: oneComputerConfigured ? (reachable ? 'ONEComputer health probe is reachable; production attestation remains open.' : 'ONEComputer is configured but the health probe is unreachable.') : 'No isolated sandbox is configured.' },
        mcp: { configuredCount: mcpConfigs.length, healthyCount: healthyMcpCount, checks: mcpChecks, secretValuesAccepted: false, detail: mcpConfigs.length ? `${healthyMcpCount}/${mcpConfigs.length} configured MCP servers returned a tool catalog.` : 'No MCP declarations are configured.' },
        theme: { persistent: persistenceConfig.active === 'postgres', audit: themeAudit, detail: persistenceConfig.active === 'postgres' ? 'Theme audit counters are owner-scoped and contain no theme content or actor identifiers.' : 'Theme persistence is unavailable in local SQLite mode.' },
        readiness: await store.readiness(),
      })
    }
    if (request.method === 'GET' && url.pathname === '/api/theme/current') {
      const referenceTheme = await loadReferenceThemeProfile(process.env.ONEVIBE_TENANT_ID)
      if (referenceTheme) return json(response, 200, { tenantId: referenceTheme.tenantId, config: referenceTheme, source: 'fixture', persistent: false, previewOnly: true })
      const selectedTenantId = process.env.ONEVIBE_THEME_TENANT_ID?.trim()
      if (!selectedTenantId || persistenceConfig.active !== 'postgres') return json(response, 200, { config: baseTenantThemeConfig(), source: 'base', persistent: false })
      if (!actorUserId) return json(response, 401, { error: 'Authentication required', code: 'unauthorized' })
      const theme = await store.getTenantTheme(selectedTenantId, actorUserId)
      return json(response, 200, { tenantId: theme.tenantId, config: parseTenantThemeConfig(theme.configJson), source: 'tenant', persistent: true, customized: theme.customized, version: theme.version, updatedAt: theme.updatedAt })
    }
    if (segments[0] === 'api' && segments[1] === 'theme' && segments.length === 2 && request.method === 'GET') {
      if (persistenceConfig.active !== 'postgres') return json(response, 200, { themes: [], persistent: false })
      if (!actorUserId) return json(response, 401, { error: 'Authentication required', code: 'unauthorized' })
      const themes = await store.listTenantThemes(actorUserId)
      return json(response, 200, { persistent: true, themes: themes.map((theme) => ({ tenantId: theme.tenantId, organizationId: theme.organizationId, version: theme.version, updatedAt: theme.updatedAt })) })
    }
    if (segments[0] === 'api' && segments[1] === 'theme' && segments[2] && segments.length >= 3) {
      const tenantId = segments[2]
      if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantId)) throw new RangeError('Tenant theme id is invalid')
      if (persistenceConfig.active !== 'postgres') return json(response, 409, { error: 'Tenant theme persistence requires Postgres', code: 'postgres_required' })
      if (!actorUserId) return json(response, 401, { error: 'Authentication required', code: 'unauthorized' })
      if (segments.length === 3 && request.method === 'GET') {
        const theme = await store.getTenantTheme(tenantId, actorUserId)
        return json(response, 200, { tenantId: theme.tenantId, config: parseTenantThemeConfig(theme.configJson), customized: theme.customized, version: theme.version, organizationId: theme.organizationId, updatedAt: theme.updatedAt })
      }
      if (segments.length === 3 && request.method === 'PUT') {
        const input = tenantThemeUpdateInput.parse(await readBody(request))
        const config = tenantThemeConfigSchema.parse({ ...input.config, tenantId })
        const theme = await store.putTenantTheme(tenantId, configuredThemeOrganization(tenantId), JSON.stringify(config), actorUserId, input.expectedVersion)
        return json(response, 200, { tenantId: theme.tenantId, config: parseTenantThemeConfig(theme.configJson), customized: theme.customized, version: theme.version, organizationId: theme.organizationId, updatedAt: theme.updatedAt })
      }
      if (request.method === 'POST' && segments[3] === 'reset' && segments.length === 4) {
        const input = z.object({ expectedVersion: z.number().int().min(1).max(1_000_000) }).strict().parse(await readBody(request))
        const base = baseTenantThemeConfig()
        const resetConfig = tenantThemeConfigSchema.parse({ ...base, tenantId })
        const theme = await store.resetTenantTheme(tenantId, JSON.stringify(resetConfig), actorUserId, input.expectedVersion)
        return json(response, 200, { tenantId: theme.tenantId, config: parseTenantThemeConfig(theme.configJson), customized: theme.customized, version: theme.version, organizationId: theme.organizationId, updatedAt: theme.updatedAt })
      }
    }
    if (request.method === 'POST' && segments[0] === 'api' && segments[1] === 'runtime' && segments[2] === 'test' && segments[3] && segments.length === 4) {
      const provider = runtimeProviderInput.parse(segments[3])
      const readiness = await runtimeSnapshot()
      return json(response, 200, { provider, health: await runtimeRegistry.test(provider, readiness.providers) })
    }

    if (request.method === 'GET' && url.pathname === '/api/conversations') {
      await store.reconcileExpiredApprovals(actorUserId)
      const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined
      return json(response, 200, store.listConversations({ cursor: url.searchParams.get('cursor') ?? undefined, limit, projectId: url.searchParams.get('projectId') ?? undefined, query: url.searchParams.get('q') ?? undefined, ownerUserId: actorUserId }))
    }

    if (request.method === 'GET' && url.pathname === '/api/tasks') {
      await store.reconcileExpiredApprovals(actorUserId)
      return json(response, 200, { tasks: store.listTasks(actorUserId) })
    }
    if (request.method === 'GET' && url.pathname === '/api/models') {
      const litellmUrl = (process.env.ONEVIBE_LITELLM_URL ?? 'http://127.0.0.1:4100').trim().replace(/\/+$/, '')
      const apiKey = process.env.ONEVIBE_LITELLM_API_KEY ?? ''
      try {
        const relay = await fetch(`${litellmUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5_000),
        })
        if (!relay.ok) return json(response, 503, { error: 'Model registry unavailable' })
        const data = await relay.json() as { data?: Array<{ id?: unknown }> }
        const models = (Array.isArray(data.data) ? data.data : [])
          .map((entry) => typeof entry?.id === 'string' ? entry.id : null)
          .filter((id): id is string => Boolean(id))
          .map((id) => describeModel(id))
        return json(response, 200, { models })
      } catch {
        return json(response, 503, { error: 'Model registry unavailable' })
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/skills') return json(response, 200, { skills: await skillCatalog(actorUserId) })
    if (request.method === 'POST' && url.pathname === '/api/skills/install') {
      const input = z.object({ skillId: taskSkill }).parse(await readBody(request))
      if (builtInSkillIdSet.has(input.skillId)) return json(response, 409, { error: 'Built-in skills do not require installation' })
      const entry = (await loadMarketplaceCatalog()).find((candidate) => candidate.id === input.skillId)
      if (!entry) return json(response, 404, { error: 'Marketplace skill not found in the configured GitHub catalog' })
      const content = await fetchMarketplaceSkill(entry)
      return json(response, 201, await store.installSkillInstallation({
        id: entry.id, version: entry.version, title: entry.title, summary: entry.summary, sha256: entry.sha256,
        content, contentUrl: entry.contentUrl, sourceUrl: entry.sourceUrl,
      }, actorUserId))
    }
    if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'skills' && segments[2] && segments.length === 3) {
      if (!await store.removeSkillInstallation(segments[2], actorUserId)) return json(response, 404, { error: 'Installed marketplace skill not found' })
      return json(response, 200, { id: segments[2], deleted: true })
    }
    if (request.method === 'GET' && url.pathname === '/api/mcp') return json(response, 200, { configs: await store.listMcpConfigs(actorUserId) })
    if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'mcp' && segments[2] && segments[3] === 'health' && segments.length === 4) {
      const config = (await store.listMcpConfigs(actorUserId)).find((candidate) => candidate.id === segments[2])
      if (!config) return json(response, 404, { error: 'MCP configuration not found' })
      const health = await probeMcpConfig({ ...config, env: {} })
      return json(response, 200, { id: config.id, ...health })
    }
    if (request.method === 'POST' && url.pathname === '/api/mcp') {
      const input = mcpConfigInput.parse(await readBody(request))
      if (['sh', 'bash', 'zsh', 'fish', 'cmd', 'powershell'].includes(path.basename(input.command).toLowerCase())) {
        throw new RangeError('Shell interpreters cannot be registered as MCP commands')
      }
      return json(response, 201, await store.createMcpConfig(input, actorUserId))
    }
    if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'mcp' && segments[2] && segments.length === 3) {
      if (!await store.deleteMcpConfig(segments[2], actorUserId)) return json(response, 404, { error: 'MCP configuration not found' })
      return json(response, 200, { id: segments[2], deleted: true })
    }
    if (segments[0] === 'api' && segments[1] === 'organizations') {
      if (!actorUserId) return json(response, 401, { error: 'Authentication required', code: 'unauthorized' })
      if (request.method === 'GET' && segments.length === 2) return json(response, 200, { organizations: await store.listOrganizations(actorUserId) })
      if (request.method === 'POST' && segments.length === 2) {
        const input = createOrganizationInput.parse(await readBody(request))
        return json(response, 201, await store.createOrganization(input.name, actorUserId))
      }
      if (segments[2] && request.method === 'GET' && segments.length === 4 && segments[3] === 'members') {
        return json(response, 200, { members: await store.listOrganizationMembers(segments[2], actorUserId) })
      }
      if (segments[2] && request.method === 'POST' && segments.length === 4 && segments[3] === 'members') {
        const input = organizationMemberInput.parse(await readBody(request))
        return json(response, 201, await store.addOrganizationMember(segments[2], input.userId, actorUserId))
      }
      if (segments[2] && segments[3] === 'members' && segments[4] && request.method === 'DELETE' && segments.length === 5) {
        return json(response, 200, await store.removeOrganizationMember(segments[2], segments[4], actorUserId))
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/library') return json(response, 200, { items: await store.listLibrary(actorUserId) })
    if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'library' && segments[2]) return json(response, 200, await store.hideLibraryItem(segments[2], actorUserId))

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      let projects = store.listProjects(actorUserId)
      if (actorUserId && projects.length === 0) {
        await store.createProject('Personal workspace', 'Private workspace created for the authenticated user.', actorUserId)
        projects = store.listProjects(actorUserId)
      }
      return json(response, 200, { projects })
    }
    if (request.method === 'POST' && url.pathname === '/api/projects') {
      const input = createProjectInput.parse(await readBody(request))
      return json(response, 201, await store.createProject(input.name, input.context, actorUserId, input.organizationId))
    }
    if (request.method === 'PATCH' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments.length === 3) {
      const input = updateProjectInput.parse(await readBody(request))
      return json(response, 200, await store.updateProjectContext(segments[2], input.context, actorUserId))
    }
    if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'files' && segments[4] === 'versions') {
      const filePath = url.searchParams.get('path')
      if (!filePath) throw new Error('Project knowledge file path is required')
      return json(response, 200, { versions: store.listProjectFileVersions(segments[2], filePath, actorUserId) })
    }
    if (request.method === 'POST' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'files' && segments[4] === 'versions' && segments[5] === 'restore') {
      const filePath = url.searchParams.get('path')
      const versionId = url.searchParams.get('version')
      if (!filePath || !versionId) throw new Error('Project knowledge file path and revision are required')
      const input = restoreProjectFileInput.parse(await readBody(request))
      return json(response, 200, await store.restoreProjectFileVersion(segments[2], filePath, versionId, input.expectedHash, actorUserId))
    }
    if (request.method === 'POST' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'files' && segments.length === 4) {
      const input = projectAttachment.parse(await readBody(request, 500_000))
      const bytes = Buffer.from(input.dataBase64, 'base64')
      if (!bytes.length || bytes.byteLength > 256 * 1024) throw new Error('Each project knowledge file must be between 1 byte and 256 KiB')
      return json(response, 201, await store.addProjectFile(segments[2], { name: input.name, mimeType: input.mimeType || 'application/octet-stream', bytes }, actorUserId))
    }
    if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'files' && segments.length === 4) {
      const filePath = url.searchParams.get('path')
      if (!filePath) throw new Error('Project knowledge file path is required')
      return json(response, 200, await store.readProjectFile(segments[2], filePath, actorUserId))
    }
    if (request.method === 'PUT' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'files' && segments.length === 4) {
      const filePath = url.searchParams.get('path')
      if (!filePath) throw new Error('Project knowledge file path is required')
      const input = editFileInput.parse(await readBody(request))
      return json(response, 200, await store.updateProjectFile(segments[2], filePath, input.content, input.expectedHash, actorUserId))
    }
    if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'projects' && segments[2] && segments[3] === 'files' && segments.length === 4) {
      const filePath = url.searchParams.get('path')
      if (!filePath) throw new Error('Project knowledge file path is required')
      return json(response, 200, await store.removeProjectFile(segments[2], filePath, actorUserId))
    }
    if (request.method === 'GET' && url.pathname === '/api/schedules') return json(response, 200, { schedules: store.listSchedules(actorUserId) })
    if (request.method === 'POST' && url.pathname === '/api/schedules') {
      const input = createScheduleInput.parse(await readBody(request))
      const { state } = await providerAvailability(input.provider)
      if (!state?.available) return json(response, 409, { error: `${state?.label ?? input.provider} is unavailable: ${state?.detail ?? 'runtime is not configured'}` })
      return json(response, 201, await store.createSchedule(input, actorUserId))
    }
    if (request.method === 'PATCH' && segments[0] === 'api' && segments[1] === 'schedules' && segments[2]) {
      const input = scheduleStateInput.parse(await readBody(request))
      return json(response, 200, await store.setScheduleEnabled(segments[2], input.enabled, actorUserId))
    }
    if (request.method === 'DELETE' && segments[0] === 'api' && segments[1] === 'schedules' && segments[2]) {
      return json(response, 200, await store.deleteSchedule(segments[2], actorUserId))
    }
    if (request.method === 'POST' && segments[0] === 'api' && segments[1] === 'schedules' && segments[2] && segments[3] === 'run') {
      const schedule = await store.claimScheduleNow(segments[2], new Date(), actorUserId)
      const task = await dispatchSchedule(schedule, 'manual')
      return json(response, 201, { schedule, task })
    }

    if (request.method === 'GET' && url.pathname === '/api/search') {
      const query = url.searchParams.get('q') ?? ''
      if (query.trim().length < 2) return json(response, 200, { results: [] })
      return json(response, 200, { results: store.searchMessages(query, 50, actorUserId).map(({ task, message }) => ({ taskId: task.id, taskTitle: task.title, message })) })
    }

    if (segments[0] === 'api' && segments[1] === 'wallet') {
      if (!walletService) return json(response, 503, { error: 'External wallet resolution is not configured' })
      walletService.authorize(request.headers.authorization)
      if (request.method === 'GET' && segments[2] === 'approvals' && segments.length === 3) {
        return json(response, 200, { approvals: await walletService.listPending(actorUserId) })
      }
      if (request.method === 'POST' && segments[2] === 'approvals' && segments[3] && segments[4] === 'decision') {
        const input = walletDecision.parse(await readBody(request))
        return json(response, 200, await walletService.decide(segments[3], input.decision, input.signer, actorUserId))
      }
    }

    if (request.method === 'GET' && segments[0] === 'api' && segments[1] === 'shares' && segments[2]) {
      const sharedTask = store.findTaskByShare(segments[2])
      if (segments[3] === 'preview') {
        const html = await store.readWorkspaceFile(sharedTask.id, 'index.html')
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'",
          'Cache-Control': 'public, max-age=60',
        })
        response.end(html)
        return
      }
      return json(response, 200, { id: sharedTask.share?.id, title: sharedTask.title, mode: sharedTask.mode, createdAt: sharedTask.share?.createdAt })
    }

    if (request.method === 'POST' && url.pathname === '/api/tasks') {
      const input = createTaskInput.parse(await readBody(request, 1_500_000))
      const projectId = input.projectId ?? store.listProjects(actorUserId)[0]?.id ?? 'project_onevibe'
      const readiness = await runtimeSnapshot()
      const provider = input.provider ?? runtimeRegistry.defaultProvider(input.mode, readiness.providers)
      const providerState = readiness.providers.find((candidate) => candidate.id === provider)
      if (!providerState?.available) return json(response, 409, { error: `${providerState?.label ?? provider} is unavailable: ${providerState?.detail ?? 'runtime is not configured'}` })
      const requestedSkills = [...new Set(input.skills)]
      const installedSkillIds = new Set((await store.listSkillInstallations(actorUserId)).map((skill) => skill.id))
      const unavailableSkill = requestedSkills.find((skill) => !builtInSkillIdSet.has(skill) && !installedSkillIds.has(skill))
      if (unavailableSkill) return json(response, 400, { error: `Skill '${unavailableSkill}' is not installed in this workspace` })
      const normalizedAttachments = input.attachments.map((attachment) => {
        const name = path.basename(attachment.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
        if (!name || name === '.' || name === '..') throw new RangeError('Invalid attachment filename')
        const bytes = Buffer.from(attachment.dataBase64, 'base64')
        if (!bytes.length || bytes.byteLength > 256 * 1024) throw new RangeError('Each attachment must be between 1 byte and 256 KiB')
        return { name, mimeType: attachment.mimeType || 'application/octet-stream', bytes }
      })
      const totalAttachmentBytes = normalizedAttachments.reduce((total, attachment) => total + attachment.bytes.byteLength, 0)
      if (totalAttachmentBytes > 1_000_000) throw new RangeError('Task attachments exceed the 1 MiB total limit')
      const attachments = normalizedAttachments.map((attachment, index) => ({ name: attachment.name, path: `inputs/${String(index + 1).padStart(2, '0')}-${attachment.name}`, size: attachment.bytes.byteLength, mimeType: attachment.mimeType }))
      const task = await store.createTask(input.prompt, provider, input.mode, projectId, undefined, input.references, attachments, requestedSkills, actorUserId, input.model)
      await Promise.all(attachments.map((attachment, index) => store.writeWorkspaceBytes(task.id, attachment.path, normalizedAttachments[index]!.bytes)))
      setTimeout(() => executeTask(task.id, input.prompt, false), 25)
      return json(response, 201, task)
    }

    const taskId = segments[2]
    if (segments[0] === 'api' && segments[1] === 'tasks' && taskId) {
      if (actorUserId) store.assertTaskOwner(taskId, actorUserId)
      if (request.method === 'GET' && segments.length === 3) {
        await store.reconcileExpiredApprovals(actorUserId)
        return json(response, 200, await store.snapshot(taskId))
      }
      if (request.method === 'POST' && segments[3] === 'cancel') {
        const task = store.getTask(taskId)
        if (!['running', 'pending', 'waiting_for_user_input', 'waiting_for_approval'].includes(task.status)) {
          return json(response, 409, { error: `Task cannot be cancelled from ${task.status}` })
        }
        const controller = activeRuns.get(taskId)
        if (!controller) return json(response, 409, { error: 'Task execution is not active' })
        void activeAdapters.get(taskId)?.cancel()
        controller.abort()
        return json(response, 202, { status: 'cancelling' })
      }
      if (request.method === 'POST' && segments[3] === 'sandbox' && segments[4] === 'release') {
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before releasing its conversation sandbox' })
        if (!ONECOMPUTER_API_URL || !ONECOMPUTER_SERVICE_TOKEN) return json(response, 503, { error: 'ONEComputer is not configured' })
        const client = new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL, serviceToken: ONECOMPUTER_SERVICE_TOKEN, projectId: ONECOMPUTER_PROJECT_ID })
        const lease = await new RuntimeLeaseService(store, client).release(taskId)
        if (!lease) return json(response, 200, { status: 'not_allocated' })
        const task = store.getTask(taskId)
        await store.updateTask(taskId, { securityContext: {
          ...task.securityContext!, sandboxState: 'destroyed', destroyedAt: lease.releasedAt ?? undefined,
          runtimeSessionId: undefined, runtimeSessionLeaseId: undefined, runtimeSessionLeaseGeneration: undefined,
        } })
        await store.appendEvent(taskId, {
          type: 'activity_delta', lane: 'control', label: 'Conversation sandbox released',
          content: 'The retained ONEComputer development sandbox was explicitly released. A future turn will receive a new fenced generation.',
          payload: { sandboxId: lease.providerSandboxId, leaseId: lease.id, leaseGeneration: lease.generation, lifecycle: 'released' },
        })
        return json(response, 200, { status: 'released', leaseId: lease.id, generation: lease.generation })
      }
      if (request.method === 'PATCH' && segments[3] === 'project') {
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before moving it to another project' })
        const input = moveTaskProjectInput.parse(await readBody(request))
        return json(response, 200, await store.moveTaskToProject(taskId, input.projectId, actorUserId))
      }
      if (request.method === 'PATCH' && segments[3] === 'tags') {
        const input = updateTaskTagsInput.parse(await readBody(request))
        return json(response, 200, await store.updateTaskTags(taskId, input.tags, actorUserId))
      }
      if (request.method === 'PATCH' && segments[3] === 'agent') {
        const input = assignTaskAgentInput.parse(await readBody(request))
        return json(response, 200, await store.updateTask(taskId, { assignedAgent: input.assignedAgent ?? undefined }))
      }
      if (request.method === 'PATCH' && segments[3] === 'epic') {
        const input = updateTaskEpicInput.parse(await readBody(request))
        return json(response, 200, await store.updateTask(taskId, { epicId: input.epicId ?? undefined, epicLabel: input.epicLabel ?? undefined }))
      }
      if (request.method === 'PATCH' && segments.length === 3) {
        const input = updateTaskBoardInput.parse(await readBody(request))
        return json(response, 200, await store.updateTaskBoardMetadata(taskId, { boardStatus: input.status, priority: input.priority }, actorUserId))
      }
      if (request.method === 'POST' && segments[3] === 'messages' && segments[4] === 'reconcile') {
        const input = followUpReconcileInput.parse(await readBody(request))
        const operation = await store.findFollowUpOperation(taskId, input.idempotencyKey)
        if (!operation) return json(response, 404, { error: 'Follow-up operation not found' })
        if (operation.providerState !== 'unknown') return json(response, 409, { error: 'Only a provider-unknown follow-up operation can be acknowledged', operationId: operation.id, providerState: operation.providerState })
        const acknowledged = await store.updateFollowUpOperation(operation, {
          errorJson: JSON.stringify({ code: 'PROVIDER_OUTCOME_UNKNOWN_ACKNOWLEDGED', message: 'An operator acknowledged the unknown provider outcome. ONEVibe did not retry the external request.', retryable: false, acknowledgedAt: new Date().toISOString() }),
          completedAt: operation.completedAt ?? new Date().toISOString(),
        })
        return json(response, 200, { operationId: acknowledged.id, status: 'acknowledged_unknown', providerState: acknowledged.providerState, retried: false })
      }
      if (request.method === 'POST' && segments[3] === 'messages') {
        const input = followUpInput.parse(await readBody(request, 1_500_000))
        const task = store.getTask(taskId)
        const headerIdempotencyKey = typeof request.headers['idempotency-key'] === 'string' ? request.headers['idempotency-key'] : undefined
        if (input.idempotencyKey && headerIdempotencyKey && input.idempotencyKey !== headerIdempotencyKey) throw new RangeError('Body and Idempotency-Key header must match')
        const idempotencyKey = input.idempotencyKey ?? (headerIdempotencyKey ? idempotencyKeyInput.parse(headerIdempotencyKey) : undefined)
        const operationScope = `follow-up:${taskId}`
        const requestHash = idempotencyKey ? followUpRequestHash(taskId, input.prompt, input.attachments) : undefined
        const isActive = activeRuns.has(taskId) || task.status === 'running' || task.status === 'pending'
        if (!isActive) {
          const providerState = (await providerAvailability(task.provider)).state
          if (!providerState?.available) return json(response, 409, { error: `${providerState?.label ?? task.provider} is unavailable: ${providerState?.detail ?? 'runtime is not configured'}` })
        }
        if (isActive) {
          if (task.queuedGuidance.length >= 8) return json(response, 409, { error: 'Task already has the maximum of 8 queued guidance messages' })
        }
        if (idempotencyKey && requestHash) {
          const operationClaim = await store.createFollowUpOperation(taskId, idempotencyKey, requestHash, input.prompt, JSON.stringify(input.attachments), isActive ? 'queued' : 'immediate', task.ownerUserId ?? actorUserId)
          if (operationClaim.claimed && process.env.NODE_ENV !== 'production' && process.env.ONEVIBE_TEST_CRASH_AFTER_FOLLOW_UP_PREPARED === 'true') {
            setImmediate(() => process.exit(97))
            return json(response, 202, { status: 'crash_injected', operationId: operationClaim.operation.id })
          }
          if (!operationClaim.claimed) {
            if (operationClaim.operation.state === 'failed') return json(response, 409, { error: 'This follow-up operation failed and requires a new request key', operationId: operationClaim.operation.id })
            return json(response, operationClaim.operation.state === 'completed' ? 200 : 202, operationResponse(operationClaim.operation) ?? { status: 'processing', taskId, idempotencyKey, operationId: operationClaim.operation.id })
          }
          const ready = await materializeFollowUpOperation(operationClaim.operation)
          if (ready.executionMode === 'immediate') await scheduleReadyFollowUpOperation(ready)
          return json(response, 202, operationResponse(ready) ?? { status: 'queued', taskId, idempotencyKey, operationId: ready.id })
        }
        if (isActive) {
          const attachments = await stageFollowUpAttachments(taskId, input.attachments, idempotencyKey)
          const guidance = await store.queueGuidance(taskId, input.prompt, attachments.map((attachment) => attachment.path), idempotencyKey ? `guidance_${contentHash(idempotencyKey).slice(0, 24)}` : undefined)
          const accepted = { status: 'queued', taskId, guidanceId: guidance.id, ...(idempotencyKey ? { idempotencyKey } : {}) }
          if (idempotencyKey) await store.completeIdempotentOperation(operationScope, idempotencyKey, accepted)
          return json(response, 202, accepted)
        }
        const attachments = await stageFollowUpAttachments(taskId, input.attachments, idempotencyKey)
        await store.updateTask(taskId, { status: 'pending' })
        setTimeout(() => executeTask(taskId, input.prompt, true, attachments.map((attachment) => attachment.path), idempotencyKey), 25)
        const accepted = { status: 'queued', taskId, ...(idempotencyKey ? { idempotencyKey } : {}) }
        if (idempotencyKey) await store.completeIdempotentOperation(operationScope, idempotencyKey, accepted)
        return json(response, 202, accepted)
      }
      if (request.method === 'POST' && segments[3] === 'fork') {
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before creating a conversation branch' })
        const input = forkTaskInput.parse(await readBody(request))
        const source = store.getTask(taskId)
        const providerState = (await providerAvailability(source.provider)).state
        if (!providerState?.available) return json(response, 409, { error: `${providerState?.label ?? source.provider} is unavailable: ${providerState?.detail ?? 'runtime is not configured'}` })
        const fork = await store.forkTask(taskId, input.fromMessageId, input.newPrompt)
        setTimeout(() => executeTask(fork.id, input.newPrompt, false), 25)
        return json(response, 201, await store.snapshot(fork.id))
      }
      if (request.method === 'POST' && segments[3] === 'retry') {
        const input = retryInput.parse(await readBody(request))
        const task = store.getTask(taskId)
        const existingRetry = await store.getRetry(taskId, input.idempotencyKey)
        if (existingRetry) return json(response, existingRetry.state === 'pending' ? 202 : 200, existingRetry.response ?? { status: 'processing', taskId, retryKey: input.idempotencyKey })
        if (activeRuns.has(taskId) || task.activeRunId || ['running', 'pending', 'waiting_for_user_input', 'waiting_for_approval'].includes(task.status)) {
          return json(response, 409, { error: 'Task execution is still active; wait for a terminal state before retrying' })
        }
        if (task.status !== 'failed' && task.status !== 'cancelled') {
          return json(response, 409, { error: `Task cannot be retried from ${task.status}` })
        }
        const retryProvider = input.provider ?? task.provider
        const retryReadiness = await runtimeSnapshot()
        const retryState = retryReadiness.providers.find((candidate) => candidate.id === retryProvider)
        const retrySuggestion = retryReadiness.suggestions?.[task.mode]?.find((candidate) => candidate.id === retryProvider)
        if (!retryState?.available) return json(response, 409, { error: `${retryState?.label ?? retryProvider} is unavailable: ${retryState?.detail ?? 'runtime is not configured'}` })
        if (retrySuggestion?.compatible === false) return json(response, 409, { error: `${retryState.label} does not support ${task.mode} mode: ${retrySuggestion.reason}` })
        const prompt = 'Retry this task using the existing workspace. Inspect the prior evidence and address the failed or cancelled step before continuing.'
        const claim = await store.claimRetry(taskId, input.idempotencyKey, prompt)
        if (!claim.claimed) {
          return json(response, claim.state === 'pending' ? 202 : 200, claim.response ?? { status: 'processing', taskId, retryKey: input.idempotencyKey })
        }
        const accepted = { status: 'queued', taskId, retryKey: input.idempotencyKey }
        await store.completeRetry(taskId, input.idempotencyKey, accepted)
        await store.updateTask(taskId, { status: 'pending', ...(retryProvider !== task.provider ? { provider: retryProvider, securityContext: undefined } : {}) })
        if (retryProvider !== task.provider) await store.appendEvent(taskId, {
          type: 'activity_delta', lane: 'control', label: 'Runtime switched by user',
          content: `The retry will run on ${retryState.label}. ONEVibe did not switch runtimes automatically.`,
          payload: { previousProvider: task.provider, provider: retryProvider, userChoice: true },
        })
        setTimeout(() => executeTask(taskId, prompt, true, undefined, input.idempotencyKey), 25)
        return json(response, 202, accepted)
      }
      if (request.method === 'DELETE' && segments[3] === 'messages' && segments[4]) {
        return json(response, 200, await store.cancelQueuedGuidance(taskId, segments[4]))
      }
      if (request.method === 'GET' && segments[3] === 'messages') {
        return json(response, 200, store.listMessages(taskId, {
          cursor: url.searchParams.get('cursor') ?? undefined,
          limit: Number(url.searchParams.get('limit') ?? 100),
          query: url.searchParams.get('q') ?? undefined,
        }))
      }
      if (request.method === 'POST' && segments[3] === 'inputs' && segments[4]) {
        const input = inputAnswer.parse(await readBody(request))
        await inputBroker.resolve(taskId, segments[4], input.answer)
        return json(response, 200, { status: 'resumed' })
      }
      if (request.method === 'POST' && segments[3] === 'copy') {
        const source = store.getTask(taskId)
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before copying it' })
        const copied = await store.createTask(`${source.title} — copy`, source.provider, source.mode, source.projectId, undefined, source.references, [], source.skills, source.ownerUserId, source.model)
        const fileCount = await store.copyWorkspace(source.id, copied.id)
        const sourceHead = store.listEvents(source.id).at(-1)?.eventHash ?? 'GENESIS'
        await store.updateTask(copied.id, {
          status: 'completed',
          previewPath: fileCount ? `/api/tasks/${copied.id}/preview` : undefined,
          securityContext: { mode: 'local_demo', gatewayEnforced: false },
        })
        await store.appendEvent(copied.id, {
          type: 'artifact_created', lane: 'artifact', status: 'completed', label: 'Task copied',
          content: `Copied ${fileCount} workspace files from ${source.id}.`,
          payload: { sourceTaskId: source.id, sourceEvidenceHash: sourceHead, fileCount },
        })
        await store.createWorkspaceVersion(copied.id, `Copied from ${source.title}`)
        return json(response, 201, await store.snapshot(copied.id))
      }
      if (request.method === 'POST' && segments[3] === 'share') {
        const task = store.getTask(taskId)
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before requesting a share' })
        if (task.share) return json(response, 200, { share: task.share, url: `/share/${task.share.id}` })
        const policy = evaluateAction('share_artifact')
        if (policy.decision !== 'approval_required') return json(response, 403, { error: `Sharing is not permitted by ${policy.policyId}` })
        const approvalId = `approval_${randomUUID().replaceAll('-', '').slice(0, 12)}`
        const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString()
        const walletUrl = `openvtc://trust-task/${approvalId}`
        const evidenceHash = evidenceHeadFor(store.listEvents(taskId))
        const intentHash = approvalIntentHash({ approvalId, taskId, action: 'share_artifact', expiresAt, evidenceHash })
        const approval = { id: approvalId, action: 'share_artifact', intentHash, evidenceHash, state: 'pending' as const, walletUrl, expiresAt }
        await store.updateTask(taskId, { approval })
        await store.appendEvent(taskId, {
          type: 'approval_requested', lane: 'approval', status: 'waiting_for_approval', label: 'External share approval required',
          content: 'A separate wallet must approve creation of a read-only share link.',
          payload: { approvalId, action: 'share_artifact', intentHash, evidenceHash, walletUrl, expiresAt, policy, browserCanApprove: false },
        })
        return json(response, 202, { approval })
      }
      if (request.method === 'GET' && segments[3] === 'events') {
        const lastEventId = typeof request.headers['last-event-id'] === 'string' ? request.headers['last-event-id'] : undefined
        // Validate the task-bound cursor before sending headers. The handoff
        // below then subscribes before reading replay, so an event appended
        // during connection setup is buffered rather than lost.
        eventsAfterLastEventId(store.listEvents(taskId), taskId, lastEventId)
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        response.write('retry: 1500\n\n')
        const closeHandoff = openReplayLiveHandoff({
          replay: () => eventsAfterLastEventId(store.listEvents(taskId), taskId, lastEventId),
          subscribe: (listener) => store.subscribe(taskId, listener),
          send: (event) => response.write(encodeRuntimeEventFrame(event)),
        })
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000)
        request.on('close', () => {
          clearInterval(heartbeat)
          closeHandoff()
        })
        return
      }
      if (request.method === 'GET' && segments[3] === 'files' && segments.length === 4) {
        return json(response, 200, { files: await store.listPublicWorkspaceFiles(taskId) })
      }
      if (request.method === 'GET' && segments[3] === 'versions' && segments.length === 4) {
        return json(response, 200, { versions: await store.listWorkspaceVersions(taskId) })
      }
      if (request.method === 'GET' && segments[3] === 'versions' && segments[4] && segments[5] === 'compare') {
        return json(response, 200, await store.compareWorkspaceVersion(taskId, segments[4]))
      }
      if (request.method === 'GET' && segments[3] === 'visual' && segments[4] === 'screenshot') {
        const task = store.getTask(taskId)
        const sandboxId = task.securityContext?.sandboxId
        if (!sandboxId || task.securityContext?.executionBoundary !== 'onecomputer_sandbox') return json(response, 404, { error: 'Task has no ONEComputer visual runtime' })
        if (task.securityContext.sandboxState === 'destroyed') return json(response, 410, { error: 'The ephemeral sandbox has been destroyed' })
        if (!ONECOMPUTER_API_URL || !ONECOMPUTER_SERVICE_TOKEN) return json(response, 503, { error: 'ONEComputer is not configured' })
        const client = new OneComputerClient({ baseUrl: ONECOMPUTER_API_URL, serviceToken: ONECOMPUTER_SERVICE_TOKEN, projectId: ONECOMPUTER_PROJECT_ID })
        const frame = await client.getVisualScreenshot(sandboxId)
        response.writeHead(200, {
          'Content-Type': 'image/png', 'Content-Length': frame.png.byteLength,
          'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff',
          ...(frame.capturedAt ? { 'X-OneComputer-Captured-At': frame.capturedAt } : {}),
        })
        response.end(frame.png)
        return
      }
      if (request.method === 'POST' && segments[3] === 'versions' && segments[4] && segments[5] === 'restore') {
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before restoring a version' })
        const version = await store.restoreWorkspaceVersion(taskId, segments[4])
        const restoredTask = store.getTask(taskId)
        if (restoredTask.mode === 'document') await writeDocumentReviewArtifacts(restoredTask, store)
        await store.appendEvent(taskId, {
          type: 'artifact_updated', lane: 'artifact', label: 'Workspace version restored',
          content: version.label, payload: { versionId: version.id, evidenceHash: version.evidenceHash },
        })
        await store.updateTask(taskId, { previewPath: `/api/tasks/${taskId}/preview` })
        return json(response, 200, { version })
      }
      if (request.method === 'GET' && segments[3] === 'file') {
        const filePath = url.searchParams.get('path')
        if (!filePath) return json(response, 400, { error: 'Missing path' })
        const task = store.getTask(taskId)
        const privateAttachmentPaths = new Set(task.attachments.map((attachment) => normalizeWorkspacePath(attachment.path)))
        if (isInternalWorkspacePath(filePath) || isPrivateWorkspacePath(filePath) || privateAttachmentPaths.has(normalizeWorkspacePath(filePath))) return json(response, 404, { error: 'Private runtime file is not user-visible' })
        if (url.searchParams.get('raw') === '1') {
          if (!/\.(?:png|jpe?g|gif|svg)$/i.test(filePath)) return json(response, 415, { error: 'Raw rendering is limited to image artifacts' })
          const bytes = await store.readWorkspaceBytes(taskId, filePath)
          const contentType = filePath.endsWith('.svg') ? 'image/svg+xml' : filePath.endsWith('.png') ? 'image/png' : filePath.endsWith('.gif') ? 'image/gif' : 'image/jpeg'
          response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; object-src 'none'; base-uri 'none'" })
          response.end(bytes)
          return
        }
        if (url.searchParams.get('download') === '1') {
          const bytes = await store.readWorkspaceBytes(taskId, filePath)
          const contentType = filePath.endsWith('.pdf') ? 'application/pdf' : filePath.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/octet-stream'
          response.writeHead(200, {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${path.basename(filePath).replaceAll('"', '')}"`,
            'Content-Length': bytes.byteLength,
            'Cache-Control': 'no-store',
          })
          response.end(bytes)
          return
        }
        if (url.searchParams.get('excerpt') === '1') {
          if (!textFilePattern.test(filePath) || filePath.startsWith('inputs/') || filePath.startsWith('evidence/')) return json(response, 415, { error: 'Rail previews are limited to generated text artifacts' })
          const file = (await store.listWorkspaceFiles(taskId)).find((candidate) => candidate.path === filePath)
          if (!file) return json(response, 404, { error: 'Artifact file was not found' })
          if (file.size > 64 * 1024) return json(response, 413, { error: 'Artifact is too large for a rail preview' })
          const content = await store.readWorkspaceFile(taskId, filePath)
          const limit = 12_000
          return json(response, 200, { path: filePath, content: content.slice(0, limit), truncated: content.length > limit })
        }
        const content = await store.readWorkspaceFile(taskId, filePath)
        return json(response, 200, { path: filePath, content, contentHash: contentHash(content) })
      }
      if (request.method === 'PUT' && segments[3] === 'file') {
        const filePath = url.searchParams.get('path')
        if (!filePath) return json(response, 400, { error: 'Missing path' })
        if (isInternalWorkspacePath(filePath) || isPrivateWorkspacePath(filePath) || store.getTask(taskId).attachments.some((attachment) => normalizeWorkspacePath(attachment.path) === normalizeWorkspacePath(filePath))) return json(response, 404, { error: 'Private runtime file is not editable' })
        if (!textFilePattern.test(filePath)) return json(response, 415, { error: 'Only recognized text artifacts can be edited' })
        if (activeRuns.has(taskId)) return json(response, 409, { error: 'Stop the active task before editing source' })
        const input = editFileInput.parse(await readBody(request))
        const current = await store.readWorkspaceFile(taskId, filePath)
        const beforeHash = contentHash(current)
        if (beforeHash !== input.expectedHash) return json(response, 409, { error: 'File changed since it was opened; reload before saving' })
        await store.createWorkspaceVersion(taskId, `Before editing ${filePath}`)
        await store.writeWorkspaceFile(taskId, filePath, input.content)
        const afterHash = contentHash(input.content)
        await store.appendEvent(taskId, {
          type: 'artifact_updated', lane: 'artifact', label: 'Source file edited', content: filePath,
          payload: { path: filePath, beforeHash, afterHash, editor: 'embedded_workspace' },
        })
        if (store.getTask(taskId).mode === 'document' && filePath === 'document.md') {
          await writeDocumentReviewArtifacts(store.getTask(taskId), store)
          await store.updateTask(taskId, { previewPath: `/api/tasks/${taskId}/preview` })
          await store.appendEvent(taskId, {
            type: 'artifact_updated', lane: 'artifact', label: 'Document preview and PDF regenerated',
            content: 'document.pdf', payload: { sourcePath: filePath, derivedPaths: ['index.html', 'document.pdf', 'artifact-manifest.json'] },
          })
        }
        return json(response, 200, { path: filePath, content: input.content, contentHash: afterHash })
      }
      if (request.method === 'GET' && segments[3] === 'preview') {
        const html = await store.readWorkspaceFile(taskId, 'index.html')
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'",
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          'Cache-Control': 'no-store',
        })
        response.end(html)
        return
      }
      if (request.method === 'GET' && segments[3] === 'evidence') {
        return json(response, 200, { valid: store.verifyChain(taskId), events: store.listEvents(taskId) })
      }
      if (request.method === 'GET' && segments[3] === 'download') {
        const archive = await store.exportWorkspaceZip(taskId)
        response.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="onevibe-${taskId}.zip"`,
          'Content-Length': archive.byteLength,
          'Cache-Control': 'no-store',
        })
        response.end(Buffer.from(archive))
        return
      }
    }

    if (process.env.NODE_ENV === 'production' && (request.method === 'GET' || request.method === 'HEAD')) {
      if (await serveStatic(path.resolve(process.cwd(), 'dist'), url.pathname, response)) return
    }
    return json(response, 404, { error: 'Not found' })
  }

  return route
}
