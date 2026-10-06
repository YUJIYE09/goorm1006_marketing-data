CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"target" text,
	"task" text NOT NULL,
	"column_types" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"app_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_task_check" CHECK ("analyses"."task" in ('regression','binary','multiclass','none'))
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_sha256" text NOT NULL,
	"blob_url" text,
	"blob_expires_at" timestamp with time zone NOT NULL,
	"size_bytes" bigint NOT NULL,
	"n_rows" integer,
	"n_cols" integer,
	"delimiter" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"question" text,
	"answer" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_explanations" ADD CONSTRAINT "llm_explanations_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_created_at_idx" ON "analyses" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "datasets_sha_idx" ON "datasets" USING btree ("file_sha256");