CREATE TABLE "tenant_theme_config_event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"org_id" text NOT NULL,
	"version" integer NOT NULL,
	"operation" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"config_json" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_theme_config" ADD COLUMN "customized" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_theme_config_event" ADD CONSTRAINT "tenant_theme_config_event_tenant_id_tenant_theme_config_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant_theme_config"("tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_theme_config_event" ADD CONSTRAINT "tenant_theme_config_event_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_theme_config_event" ADD CONSTRAINT "tenant_theme_config_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_theme_config_event_tenant_idx" ON "tenant_theme_config_event" USING btree ("tenant_id","version");--> statement-breakpoint
CREATE INDEX "tenant_theme_config_event_org_idx" ON "tenant_theme_config_event" USING btree ("org_id","created_at");