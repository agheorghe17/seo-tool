CREATE TYPE "public"."intervention_kind" AS ENUM('blueprint', 'recommendation', 'content', 'roadmap', 'internal_link', 'manual');--> statement-breakpoint
CREATE TYPE "public"."intervention_outcome" AS ENUM('pending', 'gain', 'loss', 'flat', 'inconclusive');--> statement-breakpoint
CREATE TABLE "impact_calibration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"category" "score_category" NOT NULL,
	"observed_multiplier" real DEFAULT 1 NOT NULL,
	"sample_n" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" "intervention_kind" NOT NULL,
	"category" text,
	"target_url" text,
	"target_keyword_id" uuid,
	"label" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before_json" jsonb,
	"outcome" "intervention_outcome" DEFAULT 'pending' NOT NULL,
	"measured_at" timestamp with time zone,
	"after_json" jsonb,
	"delta_position" real,
	"delta_clicks" integer
);
--> statement-breakpoint
CREATE TABLE "page_traffic_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"url" text NOT NULL,
	"month" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"position" real
);
--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "internal_links" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "main_text" text;--> statement-breakpoint
ALTER TABLE "traffic_estimates" ADD COLUMN "backtest_json" jsonb;--> statement-breakpoint
ALTER TABLE "job_runs" ADD COLUMN "site_id" uuid;--> statement-breakpoint
ALTER TABLE "impact_calibration" ADD CONSTRAINT "impact_calibration_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_target_keyword_id_keyword_data_id_fk" FOREIGN KEY ("target_keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_traffic_history" ADD CONSTRAINT "page_traffic_history_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "impact_calibration_site_cat_uq" ON "impact_calibration" USING btree ("site_id","category");--> statement-breakpoint
CREATE INDEX "interventions_site_idx" ON "interventions" USING btree ("site_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_traffic_history_uq" ON "page_traffic_history" USING btree ("site_id","url","month");--> statement-breakpoint
CREATE INDEX "page_traffic_history_site_idx" ON "page_traffic_history" USING btree ("site_id","month");--> statement-breakpoint
CREATE INDEX "job_runs_site_idx" ON "job_runs" USING btree ("site_id","started_at");