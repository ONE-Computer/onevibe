CREATE TABLE "project_file_version" (
	"project_id" text NOT NULL,
	"path" text NOT NULL,
	"id" text NOT NULL,
	"content" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_file_version_project_id_path_id_pk" PRIMARY KEY("project_id","path","id")
);
--> statement-breakpoint
ALTER TABLE "project_file_version" ADD CONSTRAINT "project_file_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_file_version_created_idx" ON "project_file_version" USING btree ("project_id","path","created_at");