CREATE TABLE "follow_up_operation" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"owner_user_id" text,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"prompt" text NOT NULL,
	"attachments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"execution_mode" text NOT NULL,
	"state" text NOT NULL,
	"guidance_id" text,
	"turn_id" text,
	"response_json" jsonb,
	"error_json" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD CONSTRAINT "follow_up_operation_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD CONSTRAINT "follow_up_operation_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_operation_task_key_idx" ON "follow_up_operation" USING btree ("task_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "follow_up_operation_recovery_idx" ON "follow_up_operation" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "follow_up_operation_task_idx" ON "follow_up_operation" USING btree ("task_id","created_at");