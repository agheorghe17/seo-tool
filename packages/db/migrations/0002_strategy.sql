CREATE TYPE "public"."competitor_added_by" AS ENUM('user', 'auto');--> statement-breakpoint
CREATE TYPE "public"."expansion_source" AS ENUM('seed', 'autocomplete', 'keyword_planner', 'gsc', 'serp');--> statement-breakpoint
CREATE TYPE "public"."keyword_bucket" AS ENUM('quick_win', 'build_content', 'long_game', 'tracked', 'none');--> statement-breakpoint
CREATE TYPE "public"."keyword_intent" AS ENUM('informational', 'commercial', 'transactional', 'navigational', 'local', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."rank_source" AS ENUM('gsc', 'serp');--> statement-breakpoint
CREATE TYPE "public"."roadmap_status" AS ENUM('todo', 'doing', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"summary" text,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '["ro"]'::jsonb NOT NULL,
	"audience" text,
	"offer_notes" text,
	"source_crawl_id" uuid,
	"confirmed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_site_id_unique" UNIQUE("site_id")
);
--> statement-breakpoint
CREATE TABLE "competitor_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"h1" text,
	"headings_json" jsonb DEFAULT '[]'::jsonb,
	"word_count" integer DEFAULT 0 NOT NULL,
	"schema_json" jsonb DEFAULT '[]'::jsonb,
	"slug" text,
	"target_keyword_guess" text,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"label" text,
	"added_by" "competitor_added_by" DEFAULT 'user' NOT NULL,
	"notes" text,
	"last_crawl_at" timestamp with time zone,
	"pages_crawled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pillar_keyword" text,
	"intent" "keyword_intent",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid NOT NULL,
	"target_page_id" uuid,
	"brief_json" jsonb,
	"checklist_json" jsonb DEFAULT '[]'::jsonb,
	"llm_provider" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_playbooks_keyword_id_unique" UNIQUE("keyword_id")
);
--> statement-breakpoint
CREATE TABLE "rank_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"position" real,
	"url" text,
	"source" "rank_source" NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"ctr" real,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmap_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"keyword_id" uuid,
	"phase" smallint NOT NULL,
	"title" text NOT NULL,
	"why" text,
	"effort" smallint DEFAULT 3 NOT NULL,
	"impact" smallint DEFAULT 3 NOT NULL,
	"status" "roadmap_status" DEFAULT 'todo' NOT NULL,
	"done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serp_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"position" integer NOT NULL,
	"domain" text NOT NULL,
	"url" text,
	"title" text,
	"is_own" boolean DEFAULT false NOT NULL,
	"is_tracked_competitor" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "intent" "keyword_intent" DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "cluster_id" uuid;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "business_relevance" smallint;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "competition" real;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "opportunity_score" smallint;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "bucket" "keyword_bucket" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "has_target_page" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "expansion_source" "expansion_source";--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "gl" text DEFAULT 'ro' NOT NULL;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD COLUMN "hl" text DEFAULT 'ro' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_source_crawl_id_crawls_id_fk" FOREIGN KEY ("source_crawl_id") REFERENCES "public"."crawls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_pages" ADD CONSTRAINT "competitor_pages_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_clusters" ADD CONSTRAINT "keyword_clusters_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_playbooks" ADD CONSTRAINT "keyword_playbooks_keyword_id_keyword_data_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_playbooks" ADD CONSTRAINT "keyword_playbooks_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_keyword_id_keyword_data_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_keyword_id_keyword_data_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_results" ADD CONSTRAINT "serp_results_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_results" ADD CONSTRAINT "serp_results_keyword_id_keyword_data_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_pages_url_uq" ON "competitor_pages" USING btree ("competitor_id","url");--> statement-breakpoint
CREATE INDEX "competitor_pages_kw_idx" ON "competitor_pages" USING btree ("competitor_id","target_keyword_guess");--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_site_domain_uq" ON "competitors" USING btree ("site_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_clusters_site_name_uq" ON "keyword_clusters" USING btree ("site_id","name");--> statement-breakpoint
CREATE INDEX "rank_snapshots_kw_time_idx" ON "rank_snapshots" USING btree ("keyword_id","captured_at");--> statement-breakpoint
CREATE INDEX "roadmap_items_site_phase_idx" ON "roadmap_items" USING btree ("site_id","phase","sort_order");--> statement-breakpoint
CREATE INDEX "serp_results_kw_time_idx" ON "serp_results" USING btree ("keyword_id","captured_at");--> statement-breakpoint
CREATE INDEX "keyword_data_site_bucket_idx" ON "keyword_data" USING btree ("site_id","bucket");