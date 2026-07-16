CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"owner_user_id" text,
	"request_hash" text NOT NULL,
	"state" text NOT NULL,
	"response_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "idempotency_key_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"turn_id" text,
	"sequence" integer NOT NULL,
	"role" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "native_event" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text NOT NULL,
	"source" text NOT NULL,
	"source_event_id" text NOT NULL,
	"source_sequence" integer NOT NULL,
	"native_type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_member" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "org_member_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"files_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_event" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"lane" text NOT NULL,
	"status" text,
	"label" text,
	"content" text,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"previous_hash" text NOT NULL,
	"event_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_lease" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"generation" integer NOT NULL,
	"provider_name" text NOT NULL,
	"provider_sandbox_id" text,
	"status" text NOT NULL,
	"allocation_operation_id" text NOT NULL,
	"allocation_idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"release_requested_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"last_error_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "runtime_mcp_config" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"command" text NOT NULL,
	"args_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"org_id" text,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"interval_minutes" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"org_id" text,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"skills_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"queued_guidance_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"references_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"security_context_json" jsonb,
	"approval_json" jsonb,
	"input_request_json" jsonb,
	"share_json" jsonb,
	"preview_path" text,
	"library_hidden_at" timestamp with time zone,
	"active_run_id" text,
	"schedule_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"client_request_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_version" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"label" text NOT NULL,
	"file_count" integer NOT NULL,
	"evidence_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_turn_id_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_event" ADD CONSTRAINT "native_event_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_member" ADD CONSTRAINT "org_member_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_member" ADD CONSTRAINT "org_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_event" ADD CONSTRAINT "runtime_event_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_lease" ADD CONSTRAINT "runtime_lease_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_mcp_config" ADD CONSTRAINT "runtime_mcp_config_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_version" ADD CONSTRAINT "workspace_version_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" USING btree ("providerId","accountId");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idempotency_owner_idx" ON "idempotency_key" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_task_sequence_idx" ON "message" USING btree ("task_id","sequence");--> statement-breakpoint
CREATE INDEX "message_task_idx" ON "message" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "native_event_source_id_idx" ON "native_event" USING btree ("task_id","run_id","source","source_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "native_event_source_sequence_idx" ON "native_event" USING btree ("task_id","run_id","source","source_sequence");--> statement-breakpoint
CREATE INDEX "org_member_user_idx" ON "org_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_owner_idx" ON "project" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "project_org_idx" ON "project" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_event_task_sequence_idx" ON "runtime_event" USING btree ("task_id","sequence");--> statement-breakpoint
CREATE INDEX "runtime_event_task_created_idx" ON "runtime_event" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_lease_task_generation_idx" ON "runtime_lease" USING btree ("task_id","generation");--> statement-breakpoint
CREATE INDEX "runtime_lease_task_idx" ON "runtime_lease" USING btree ("task_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_mcp_owner_name_idx" ON "runtime_mcp_config" USING btree ("owner_user_id","name");--> statement-breakpoint
CREATE INDEX "runtime_mcp_owner_updated_idx" ON "runtime_mcp_config" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "schedule_owner_idx" ON "schedule" USING btree ("owner_user_id","next_run_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "task_owner_updated_idx" ON "task" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "task_project_idx" ON "task" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "task_org_idx" ON "task" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_request_idx" ON "turn" USING btree ("task_id","client_request_id");--> statement-breakpoint
CREATE INDEX "turn_task_idx" ON "turn" USING btree ("task_id","ordinal");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "workspace_version_task_idx" ON "workspace_version" USING btree ("task_id","created_at");