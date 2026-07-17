import { boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

const createdAt = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull()
const updatedAt = (name = 'updated_at') => timestamp(name, { withTimezone: true }).notNull()
const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

// Better Auth's default model names are intentionally preserved. The auth
// adapter maps these four tables directly; do not rename them without updating
// the adapter mapping and the generated migration together.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt('createdAt'),
  updatedAt: updatedAt('updatedAt'),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt('createdAt'),
  updatedAt: updatedAt('updatedAt'),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_idx').on(table.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt('createdAt'),
  updatedAt: updatedAt('updatedAt'),
}, (table) => [uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId), index('account_user_idx').on(table.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: createdAt('createdAt'),
  updatedAt: updatedAt('updatedAt'),
}, (table) => [index('verification_identifier_idx').on(table.identifier)])

export const org = pgTable('org', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const orgMember = pgTable('org_member', {
  orgId: text('org_id').notNull().references(() => org.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.orgId, table.userId] }), index('org_member_user_idx').on(table.userId)])

// The conversation is the durable product identity. `task` remains the
// execution/task record during the repository migration, but future reads
// must not infer conversation lineage from process-local maps.
export const conversation = pgTable('conversation', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title'),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('conversation_owner_updated_idx').on(table.ownerUserId, table.updatedAt), index('conversation_status_updated_idx').on(table.status, table.updatedAt)])

export const project = pgTable('project', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  orgId: text('org_id').references(() => org.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  context: text('context').notNull().default(''),
  filesJson: jsonb('files_json').notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('project_owner_idx').on(table.ownerUserId), index('project_org_idx').on(table.orgId)])

export const task = pgTable('task', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  orgId: text('org_id').references(() => org.id, { onDelete: 'set null' }),
  conversationId: text('conversation_id').references(() => conversation.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  prompt: text('prompt').notNull(),
  provider: text('provider').notNull(),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  skillsJson: jsonb('skills_json').notNull().default([]),
  tagsJson: jsonb('tags_json').notNull().default([]),
  queuedGuidanceJson: jsonb('queued_guidance_json').notNull().default([]),
  referencesJson: jsonb('references_json').notNull().default([]),
  attachmentsJson: jsonb('attachments_json').notNull().default([]),
  planJson: jsonb('plan_json').notNull().default([]),
  securityContextJson: jsonb('security_context_json'),
  approvalJson: jsonb('approval_json'),
  inputRequestJson: jsonb('input_request_json'),
  shareJson: jsonb('share_json'),
  previewPath: text('preview_path'),
  libraryHiddenAt: timestamp('library_hidden_at', { withTimezone: true }),
  activeRunId: text('active_run_id'),
  scheduleId: text('schedule_id'),
  parentTaskId: text('parent_task_id'),
  forkedFromMessageId: text('forked_from_message_id'),
  forkedAt: timestamp('forked_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('task_owner_updated_idx').on(table.ownerUserId, table.updatedAt), index('task_project_idx').on(table.projectId), index('task_org_idx').on(table.orgId)])

export const turn = pgTable('turn', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  clientRequestId: text('client_request_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  status: text('status').notNull(),
  errorJson: jsonb('error_json'),
  createdAt: createdAt(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [uniqueIndex('turn_request_idx').on(table.taskId, table.clientRequestId), uniqueIndex('turn_task_ordinal_idx').on(table.taskId, table.ordinal), index('turn_task_idx').on(table.taskId, table.ordinal)])

export const message = pgTable('message', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  turnId: text('turn_id').references(() => turn.id, { onDelete: 'set null' }),
  sequence: integer('sequence').notNull(),
  role: text('role').notNull(),
  contentJson: jsonb('content_json').notNull(),
  providerMessageId: text('provider_message_id'),
  revision: integer('revision').notNull().default(0),
  status: text('status').notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('message_task_sequence_idx').on(table.taskId, table.sequence), uniqueIndex('message_task_provider_idx').on(table.taskId, table.providerMessageId), index('message_task_idx').on(table.taskId, table.createdAt)])

export const runtimeEvent = pgTable('runtime_event', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  runId: text('run_id'),
  sequence: integer('sequence').notNull(),
  type: text('type').notNull(),
  lane: text('lane').notNull(),
  status: text('status'),
  label: text('label'),
  content: text('content'),
  payloadJson: jsonb('payload_json').notNull(),
  createdAt: createdAt(),
  previousHash: text('previous_hash').notNull(),
  eventHash: text('event_hash').notNull(),
}, (table) => [uniqueIndex('runtime_event_task_sequence_idx').on(table.taskId, table.sequence), index('runtime_event_task_created_idx').on(table.taskId, table.createdAt)])

export const nativeEvent = pgTable('native_event', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull(),
  source: text('source').notNull(),
  sourceEventId: text('source_event_id').notNull(),
  sourceSequence: integer('source_sequence').notNull(),
  nativeType: text('native_type').notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  payloadHash: text('payload_hash').notNull(),
  receivedAt: createdAt('received_at'),
}, (table) => [uniqueIndex('native_event_source_id_idx').on(table.taskId, table.runId, table.source, table.sourceEventId), uniqueIndex('native_event_source_sequence_idx').on(table.taskId, table.runId, table.source, table.sourceSequence)])

export const nativeEventProjection = pgTable('native_event_projection', {
  nativeEventId: text('native_event_id').notNull().references(() => nativeEvent.id, { onDelete: 'cascade' }),
  projectionIndex: integer('projection_index').notNull(),
  runtimeEventId: text('runtime_event_id').notNull().references(() => runtimeEvent.id, { onDelete: 'cascade' }).unique(),
  projectorVersion: integer('projector_version').notNull(),
  projectedAt: createdAt('projected_at'),
}, (table) => [primaryKey({ columns: [table.nativeEventId, table.projectionIndex] })])

export const nativeProjectionOffset = pgTable('native_projection_offset', {
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull(),
  source: text('source').notNull(),
  projectorVersion: integer('projector_version').notNull(),
  lastSourceSequence: integer('last_source_sequence').notNull(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ name: 'native_projection_offset_pk', columns: [table.taskId, table.runId, table.source, table.projectorVersion] })])

export const idempotencyKey = pgTable('idempotency_key', {
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'cascade' }),
  requestHash: text('request_hash').notNull(),
  state: text('state').notNull(),
  responseJson: jsonb('response_json'),
  createdAt: createdAt(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [primaryKey({ columns: [table.scope, table.key] }), index('idempotency_owner_idx').on(table.ownerUserId)])

export const runtimeLease = pgTable('runtime_lease', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  generation: integer('generation').notNull(),
  providerName: text('provider_name').notNull(),
  providerSandboxId: text('provider_sandbox_id'),
  status: text('status').notNull(),
  allocationOperationId: text('allocation_operation_id').notNull(),
  allocationIdempotencyKey: text('allocation_idempotency_key').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  releaseRequestedAt: timestamp('release_requested_at', { withTimezone: true }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  lastErrorJson: jsonb('last_error_json'),
}, (table) => [uniqueIndex('runtime_lease_task_generation_idx').on(table.taskId, table.generation), uniqueIndex('runtime_lease_allocation_operation_idx').on(table.allocationOperationId), uniqueIndex('runtime_lease_provider_idempotency_idx').on(table.providerName, table.allocationIdempotencyKey), index('runtime_lease_task_idx').on(table.taskId, table.updatedAt)])

export const schedule = pgTable('schedule', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  orgId: text('org_id').references(() => org.id, { onDelete: 'set null' }),
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prompt: text('prompt').notNull(),
  provider: text('provider').notNull(),
  mode: text('mode').notNull(),
  intervalMinutes: integer('interval_minutes').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('schedule_owner_idx').on(table.ownerUserId, table.nextRunAt)])

export const workspaceVersion = pgTable('workspace_version', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  fileCount: integer('file_count').notNull(),
  evidenceHash: text('evidence_hash').notNull(),
  createdAt: createdAt(),
}, (table) => [index('workspace_version_task_idx').on(table.taskId, table.createdAt)])

// Workspace bytes are a first-class durable boundary. The runtime filesystem
// is only a materialized working copy; these rows are the restart/multi-instance
// source of truth for the opt-in Postgres path.
export const workspaceFile = pgTable('workspace_file', {
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: binary('content').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.taskId, table.path] }), index('workspace_file_task_updated_idx').on(table.taskId, table.updatedAt)])

export const workspaceVersionFile = pgTable('workspace_version_file', {
  versionId: text('version_id').notNull().references(() => workspaceVersion.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: binary('content').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
}, (table) => [primaryKey({ columns: [table.versionId, table.path] })])

export const projectFile = pgTable('project_file', {
  projectId: text('project_id').notNull().references(() => project.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: binary('content').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.projectId, table.path] }), index('project_file_updated_idx').on(table.projectId, table.updatedAt)])

export const runtimeMcpConfig = pgTable('runtime_mcp_config', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  command: text('command').notNull(),
  argsJson: jsonb('args_json').notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('runtime_mcp_owner_name_idx').on(table.ownerUserId, table.name), index('runtime_mcp_owner_updated_idx').on(table.ownerUserId, table.updatedAt)])

export const runtimeMcpConfigEvent = pgTable('runtime_mcp_config_events', {
  id: text('id').primaryKey(),
  // Deliberately not a foreign key: delete events must survive deletion of
  // the active declaration so the configuration history remains append-only.
  configId: text('config_id').notNull(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  configJson: jsonb('config_json').notNull(),
  createdAt: createdAt(),
}, (table) => [index('runtime_mcp_config_event_owner_idx').on(table.ownerUserId, table.createdAt), index('runtime_mcp_config_event_config_idx').on(table.configId, table.createdAt)])

// Import provenance is append-only and intentionally separate from the
// canonical tables. The importer can be rerun safely by source identity and
// must never overwrite an existing canonical conversation silently.
export const legacyImport = pgTable('legacy_imports', {
  sourceKind: text('source_kind').notNull(),
  sourceId: text('source_id').notNull(),
  sourceDigest: text('source_digest').notNull(),
  conversationId: text('conversation_id').references(() => conversation.id, { onDelete: 'set null' }),
  resultJson: jsonb('result_json').notNull(),
  importedAt: createdAt('imported_at'),
}, (table) => [primaryKey({ columns: [table.sourceKind, table.sourceId] }), index('legacy_import_conversation_idx').on(table.conversationId), index('legacy_import_digest_idx').on(table.sourceDigest)])

export const skillInstallation = pgTable('skill_installations', {
  id: text('id').notNull(),
  ownerScope: text('owner_scope').notNull(),
  ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  sha256: text('sha256').notNull(),
  content: text('content').notNull(),
  contentUrl: text('content_url').notNull(),
  sourceUrl: text('source_url').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.ownerScope, table.id] }), index('skill_installations_owner_updated_idx').on(table.ownerScope, table.updatedAt)])

export const orgTables = { org, orgMember }
export const authTables = { user, session, account, verification }
export const oneVibeTables = { conversation, project, task, turn, message, runtimeEvent, nativeEvent, nativeEventProjection, nativeProjectionOffset, idempotencyKey, runtimeLease, schedule, workspaceVersion, runtimeMcpConfig, runtimeMcpConfigEvent, legacyImport, skillInstallation }
