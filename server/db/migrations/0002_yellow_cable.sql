CREATE TABLE "skill_installations" (
	"id" text NOT NULL,
	"owner_scope" text NOT NULL,
	"owner_user_id" text,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"sha256" text NOT NULL,
	"content" text NOT NULL,
	"content_url" text NOT NULL,
	"source_url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "skill_installations_owner_scope_id_pk" PRIMARY KEY("owner_scope","id")
);
--> statement-breakpoint
ALTER TABLE "skill_installations" ADD CONSTRAINT "skill_installations_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_installations_owner_updated_idx" ON "skill_installations" USING btree ("owner_scope","updated_at");