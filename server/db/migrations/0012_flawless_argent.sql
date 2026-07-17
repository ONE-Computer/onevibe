CREATE TABLE "tenant_theme_config" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"config_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_theme_config" ADD CONSTRAINT "tenant_theme_config_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_theme_config" ADD CONSTRAINT "tenant_theme_config_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_theme_config" ADD CONSTRAINT "tenant_theme_config_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_theme_config" ADD CONSTRAINT "tenant_theme_config_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_theme_config_org_idx" ON "tenant_theme_config" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tenant_theme_config_owner_idx" ON "tenant_theme_config" USING btree ("owner_user_id");