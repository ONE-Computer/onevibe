CREATE TABLE "native_event_projection" (
	"native_event_id" text NOT NULL,
	"projection_index" integer NOT NULL,
	"runtime_event_id" text NOT NULL,
	"projector_version" integer NOT NULL,
	"projected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "native_event_projection_native_event_id_projection_index_pk" PRIMARY KEY("native_event_id","projection_index"),
	CONSTRAINT "native_event_projection_runtime_event_id_unique" UNIQUE("runtime_event_id")
);
--> statement-breakpoint
CREATE TABLE "native_projection_offset" (
	"task_id" text NOT NULL,
	"run_id" text NOT NULL,
	"source" text NOT NULL,
	"projector_version" integer NOT NULL,
	"last_source_sequence" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "native_projection_offset_task_id_run_id_source_projector_version_pk" PRIMARY KEY("task_id","run_id","source","projector_version")
);
--> statement-breakpoint
ALTER TABLE "native_event_projection" ADD CONSTRAINT "native_event_projection_native_event_id_native_event_id_fk" FOREIGN KEY ("native_event_id") REFERENCES "public"."native_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_event_projection" ADD CONSTRAINT "native_event_projection_runtime_event_id_runtime_event_id_fk" FOREIGN KEY ("runtime_event_id") REFERENCES "public"."runtime_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_projection_offset" ADD CONSTRAINT "native_projection_offset_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;