ALTER TABLE "task" ADD COLUMN "priority" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "labels_json" jsonb DEFAULT '[]'::jsonb NOT NULL;