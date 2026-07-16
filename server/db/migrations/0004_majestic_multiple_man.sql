CREATE TABLE "conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_imports" (
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_digest" text NOT NULL,
	"conversation_id" text,
	"result_json" jsonb NOT NULL,
	"imported_at" timestamp with time zone NOT NULL,
	CONSTRAINT "legacy_imports_source_kind_source_id_pk" PRIMARY KEY("source_kind","source_id")
);
--> statement-breakpoint
CREATE TABLE "runtime_mcp_config_events" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"operation" text NOT NULL,
	"config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "parent_task_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "forked_from_message_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "forked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "error_json" jsonb;--> statement-breakpoint
ALTER TABLE "legacy_imports" ADD CONSTRAINT "legacy_imports_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_mcp_config_events" ADD CONSTRAINT "runtime_mcp_config_events_config_id_runtime_mcp_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."runtime_mcp_config"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_mcp_config_events" ADD CONSTRAINT "runtime_mcp_config_events_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_status_updated_idx" ON "conversation" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "legacy_import_conversation_idx" ON "legacy_imports" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "legacy_import_digest_idx" ON "legacy_imports" USING btree ("source_digest");--> statement-breakpoint
CREATE INDEX "runtime_mcp_config_event_owner_idx" ON "runtime_mcp_config_events" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "runtime_mcp_config_event_config_idx" ON "runtime_mcp_config_events" USING btree ("config_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_task_provider_idx" ON "message" USING btree ("task_id","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_lease_allocation_operation_idx" ON "runtime_lease" USING btree ("allocation_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_lease_provider_idempotency_idx" ON "runtime_lease" USING btree ("provider_name","allocation_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_task_ordinal_idx" ON "turn" USING btree ("task_id","ordinal");