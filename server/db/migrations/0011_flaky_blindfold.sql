CREATE TABLE "follow_up_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"task_id" text NOT NULL,
	"owner_user_id" text,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" "bytea" NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follow_up_attachment" ADD CONSTRAINT "follow_up_attachment_operation_id_follow_up_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."follow_up_operation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_attachment" ADD CONSTRAINT "follow_up_attachment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_attachment" ADD CONSTRAINT "follow_up_attachment_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follow_up_attachment_operation_path_idx" ON "follow_up_attachment" USING btree ("operation_id","path");--> statement-breakpoint
CREATE INDEX "follow_up_attachment_operation_idx" ON "follow_up_attachment" USING btree ("operation_id","created_at");--> statement-breakpoint
CREATE INDEX "follow_up_attachment_task_idx" ON "follow_up_attachment" USING btree ("task_id","path");