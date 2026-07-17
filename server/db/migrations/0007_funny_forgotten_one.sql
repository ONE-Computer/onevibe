CREATE TABLE "project_file" (
	"project_id" text NOT NULL,
	"path" text NOT NULL,
	"content" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_file_project_id_path_pk" PRIMARY KEY("project_id","path")
);
--> statement-breakpoint
CREATE TABLE "workspace_file" (
	"task_id" text NOT NULL,
	"path" text NOT NULL,
	"content" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspace_file_task_id_path_pk" PRIMARY KEY("task_id","path")
);
--> statement-breakpoint
CREATE TABLE "workspace_version_file" (
	"version_id" text NOT NULL,
	"path" text NOT NULL,
	"content" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	CONSTRAINT "workspace_version_file_version_id_path_pk" PRIMARY KEY("version_id","path")
);
--> statement-breakpoint
ALTER TABLE "project_file" ADD CONSTRAINT "project_file_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_file" ADD CONSTRAINT "workspace_file_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_version_file" ADD CONSTRAINT "workspace_version_file_version_id_workspace_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workspace_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_file_updated_idx" ON "project_file" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "workspace_file_task_updated_idx" ON "workspace_file" USING btree ("task_id","updated_at");