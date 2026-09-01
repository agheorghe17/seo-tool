CREATE TYPE "public"."blueprint_status" AS ENUM('draft', 'approved', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE "page_blueprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"page_id" uuid,
	"url" text NOT NULL,
	"is_homepage" boolean DEFAULT false NOT NULL,
	"target_keyword" text,
	"target_keyword_id" uuid,
	"secondary_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_json" jsonb,
	"recommended_json" jsonb,
	"potential_json" jsonb,
	"rationale" text,
	"diagnosis" text DEFAULT 'ok' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" "blueprint_status" DEFAULT 'draft' NOT NULL,
	"applied_result_json" jsonb,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "traffic_estimates" ADD COLUMN "phases_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "geo_country" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "geo_language" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "primary_city" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "local_emphasis" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "page_blueprints" ADD CONSTRAINT "page_blueprints_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_blueprints" ADD CONSTRAINT "page_blueprints_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_blueprints" ADD CONSTRAINT "page_blueprints_target_keyword_id_keyword_data_id_fk" FOREIGN KEY ("target_keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_blueprints_site_idx" ON "page_blueprints" USING btree ("site_id","priority");