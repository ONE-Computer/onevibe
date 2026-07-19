import { createHash } from 'node:crypto'
import path from 'node:path'
import { z } from 'zod'
import { builtInSkillIds } from '../skill-packs.js'
import { tenantThemeConfigSchema, type TenantThemeConfig } from '../theme-config.js'

export const runtimeProviderInput = z.enum(['demo', 'claude_sdk', 'codex', 'agentcore', 'onecomputer', 'remote', 'a2a', 'kimi'])

export const referenceUrl = z.string().url().max(2_048).refine((value) => {
  const url = new URL(value)
  return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !/(?:token|secret|api[_-]?key|password)=/i.test(url.search)
}, 'References must be ordinary HTTP(S) URLs without embedded credentials or secret query parameters')
export const taskAttachment = z.object({ name: z.string().min(1).max(160), mimeType: z.string().max(160).default('application/octet-stream'), dataBase64: z.string().min(1).max(350_000) })
export const projectAttachment = z.object({ name: z.string().min(1).max(160), mimeType: z.string().max(160).default('application/octet-stream'), dataBase64: z.string().min(1).max(350_000) })
// Built-in packs use stable snake_case identifiers; marketplace IDs remain
// constrained by their GitHub catalog schema. Keep both bounded and opaque.
export const taskSkill = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/)
export const builtInSkillIdSet = new Set<string>(builtInSkillIds)
export const createTaskInput = z.object({
  prompt: z.string().trim().min(3).max(8_000),
  provider: z.enum(['demo', 'claude_sdk', 'codex', 'agentcore', 'onecomputer', 'remote']).optional(),
  mode: z.enum(['chat', 'general', 'website', 'slides', 'document', 'research', 'data', 'design', 'app', 'game']).default('chat'),
  projectId: z.string().regex(/^project_[a-z0-9]+$/).optional(),
  references: z.array(referenceUrl).max(8).default([]),
  attachments: z.array(taskAttachment).max(4).default([]),
  skills: z.array(taskSkill).max(4).default([]),
  model: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/).optional(),
})
export const createProjectInput = z.object({ name: z.string().trim().min(2).max(100), context: z.string().trim().max(8_000).default(''), organizationId: z.string().regex(/^org_[a-z0-9]+$/).optional() })
export const updateProjectInput = z.object({ context: z.string().trim().max(8_000) })
export const createOrganizationInput = z.object({ name: z.string().trim().min(2).max(160) })
export const organizationMemberInput = z.object({ userId: z.string().trim().min(1).max(255) })
export const tenantThemeUpdateInput = z.object({
  expectedVersion: z.number().int().min(0).max(1_000_000).default(0),
  config: tenantThemeConfigSchema.omit({ tenantId: true }),
}).strict()

export const parseTenantThemeConfig = (configJson: string): TenantThemeConfig => {
  let value: unknown
  try { value = JSON.parse(configJson) } catch { throw new Error('Persisted tenant theme is not valid JSON') }
  return tenantThemeConfigSchema.parse(value)
}

export const configuredThemeOrganization = (tenantId: string): string | undefined => {
  const raw = process.env.ONEVIBE_THEME_TENANT_ORG_MAP?.trim()
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const value = (parsed as Record<string, unknown>)[tenantId]
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
  } catch { return undefined }
}
export const createScheduleInput = z.object({
  name: z.string().trim().min(2).max(100), prompt: z.string().trim().min(3).max(8_000),
  provider: z.enum(['demo', 'claude_sdk', 'codex', 'agentcore', 'onecomputer', 'remote']).default('demo'),
  mode: z.enum(['chat', 'general', 'website', 'slides', 'document', 'research', 'data', 'design', 'app', 'game']).default('general'),
  projectId: z.string().regex(/^project_[a-z0-9]+$/), intervalMinutes: z.number().int().min(15).max(10_080),
})
export const scheduleStateInput = z.object({ enabled: z.boolean() })
export const idempotencyKeyInput = z.string().regex(/^[a-zA-Z0-9._:-]{8,120}$/)
export const followUpInput = z.object({ prompt: z.string().trim().min(1).max(8_000), attachments: z.array(taskAttachment).max(4).default([]), idempotencyKey: idempotencyKeyInput.optional() })
export const followUpReconcileInput = z.object({ idempotencyKey: idempotencyKeyInput, decision: z.literal('acknowledge_unknown') })
export const forkTaskInput = z.object({ fromMessageId: z.string().regex(/^message_[a-f0-9]+$/), newPrompt: z.string().trim().min(1).max(8_000) })
export const retryInput = z.object({ idempotencyKey: z.string().regex(/^[a-zA-Z0-9._:-]{8,120}$/), provider: runtimeProviderInput.optional() })
export const moveTaskProjectInput = z.object({ projectId: z.string().regex(/^project_[a-z0-9]+$/) })
export const updateTaskTagsInput = z.object({ tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/)).max(8) })
// Comma-separated assignee ids so a task can be assigned to an agent, a human, or both (e.g. "codex,human").
export const assigneeIdSegment = '[a-z0-9][a-z0-9._-]{0,63}'
export const assignTaskAgentInput = z.object({ assignedAgent: z.string().trim().min(1).max(280).regex(new RegExp(`^${assigneeIdSegment}(,${assigneeIdSegment}){0,7}$`)).nullable() })
export const updateTaskEpicInput = z.object({ epicId: z.string().trim().min(1).max(120).nullable(), epicLabel: z.string().trim().min(1).max(120).nullable() })
// P12-05: user-managed board metadata. `status` is the board column override (stored as boardStatus);
// the runtime-owned RunStatus is never writable through this route. Null clears the override/value.
export const updateTaskBoardInput = z.object({
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'cancelled']).nullable().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).nullable().optional(),
}).refine((value) => value.status !== undefined || value.priority !== undefined, { message: 'Provide status or priority' })
export const editFileInput = z.object({ content: z.string().max(60_000), expectedHash: z.string().regex(/^[a-f0-9]{64}$/) })
export const restoreProjectFileInput = z.object({ expectedHash: z.string().regex(/^[a-f0-9]{64}$/) })
export const inputAnswer = z.object({ answer: z.string().trim().min(1).max(4_000) })
export const walletDecision = z.object({ decision: z.enum(['approved', 'denied']), signer: z.string().trim().min(2).max(120) })
export const mcpConfigInput = z.object({
  name: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/),
  command: z.string().trim().min(1).max(200).regex(/^[a-zA-Z0-9._/-]+$/),
  args: z.array(z.string().max(512).refine((value) => !/[\r\n;&|`$<>]/.test(value) && !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value), 'MCP arguments cannot contain shell composition or path traversal')).max(32).default([]),
})
export const textFilePattern = /\.(?:html?|css|js|jsx|ts|tsx|json|md|txt|ya?ml|toml|xml|svg|gitignore|prettierrc)$/i
export const contentHash = (content: string) => createHash('sha256').update(content).digest('hex')
export const bytesHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export const normalizedAttachmentName = (name: string) => path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
