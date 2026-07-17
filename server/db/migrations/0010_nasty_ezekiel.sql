ALTER TABLE "follow_up_operation" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "execution_id" text;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "provider_state" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "provider_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ADD COLUMN "provider_completed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "follow_up_operation" SET "execution_id" = 'execution_' || "id" WHERE "execution_id" IS NULL;--> statement-breakpoint
UPDATE "follow_up_operation" SET "provider_request_id" = 'onevibe:' || "execution_id" WHERE "provider_request_id" IS NULL;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ALTER COLUMN "execution_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_up_operation" ALTER COLUMN "provider_request_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_operation_execution_id_idx" ON "follow_up_operation" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "follow_up_operation_lease_idx" ON "follow_up_operation" USING btree ("state","lease_expires_at");
