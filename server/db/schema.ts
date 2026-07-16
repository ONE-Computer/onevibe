import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

const createdAt = (name = 'created_at') => timestamp(name, { withTimezone: true }).notNull()
const updatedAt = (name = 'updated_at') => timestamp(name, { withTimezone: true }).notNull()

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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('task_owner_updated_idx').on(table.ownerUserId, table.updatedAt), index('task_project_idx').on(table.projectId), index('task_org_idx').on(table.orgId)])

export const turn = pgTable('turn', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  clientRequestId: text('client_request_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  status: text('status').notNull(),
  createdAt: createdAt(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [uniqueIndex('turn_request_idx').on(table.taskId, table.clientRequestId), index('turn_task_idx').on(table.taskId, table.ordinal)])

export const message = pgTable('message', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => task.id, { onDelete: 'cascade' }),
  turnId: text('turn_id').references(() => turn.id, { onDelete: 'set null' }),
  sequence: integer('sequence').notNull(),
  role: text('role').notNull(),
  contentJson: jsonb('content_json').notNull(),
  revision: integer('revision').notNull().default(0),
  status: text('status').notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('message_task_sequence_idx').on(table.taskId, table.sequence), index('message_task_idx').on(table.taskId, table.createdAt)])

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
}, (table) => [uniqueIndex('runtime_lease_task_generation_idx').on(table.taskId, table.generation), index('runtime_lease_task_idx').on(table.taskId, table.updatedAt)])

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

export const runtimeMcpConfig = pgTable('runtime_mcp_config', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  command: text('command').notNull(),
  argsJson: jsonb('args_json').notNull().default([]),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('runtime_mcp_owner_name_idx').on(table.ownerUserId, table.name), index('runtime_mcp_owner_updated_idx').on(table.ownerUserId, table.updatedAt)])

export const orgTables = { org, orgMember }
export const authTables = { user, session, account, verification }
export const oneVibeTables = { project, task, turn, message, runtimeEvent, nativeEvent, idempotencyKey, runtimeLease, schedule, workspaceVersion, runtimeMcpConfig }
