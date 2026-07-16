ALTER TABLE "conversation" ADD COLUMN "owner_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_owner_updated_idx" ON "conversation" USING btree ("owner_user_id","updated_at");