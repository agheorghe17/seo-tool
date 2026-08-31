CREATE TYPE "public"."baseline_source" AS ENUM('gsc', 'keyword_model');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('wordpress', 'universal');--> statement-breakpoint
CREATE TYPE "public"."crawl_status" AS ENUM('queued', 'running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."indexability" AS ENUM('indexable', 'noindex', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."keyword_source" AS ENUM('gsc', 'dataforseo');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('anthropic', 'ollama', 'none');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."rendered_with" AS ENUM('static', 'playwright');--> statement-breakpoint
CREATE TYPE "public"."score_category" AS ENUM('technical', 'cwv', 'onpage', 'content', 'geo');--> statement-breakpoint
CREATE TYPE "public"."secret_kind" AS ENUM('wp_app_password', 'gsc_refresh_token');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('meta_tag', 'html_file', 'dns_txt');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"quota_pages_month" integer DEFAULT 2000 NOT NULL,
	"quota_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" "secret_kind" NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"connection_type" "connection_type" NOT NULL,
	"wp_site_url" text,
	"verification_method" "verification_method",
	"verification_token" text NOT NULL,
	"verified_at" timestamp with time zone,
	"gsc_connected" boolean DEFAULT false NOT NULL,
	"gsc_property" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crawls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"status" "crawl_status" DEFAULT 'queued' NOT NULL,
	"pages_total" integer DEFAULT 0 NOT NULL,
	"pages_scanned" integer DEFAULT 0 NOT NULL,
	"pages_rendered" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crawl_id" uuid NOT NULL,
	"url" text NOT NULL,
	"status_code" smallint,
	"redirect_chain_json" jsonb DEFAULT '[]'::jsonb,
	"indexability" "indexability",
	"rendered_with" "rendered_with" DEFAULT 'static' NOT NULL,
	"content_hash" text,
	"title" text,
	"meta_description" text,
	"h1" text,
	"headings_json" jsonb DEFAULT '[]'::jsonb,
	"word_count" integer DEFAULT 0 NOT NULL,
	"canonical_url" text,
	"schema_json" jsonb DEFAULT '[]'::jsonb,
	"images_json" jsonb DEFAULT '[]'::jsonb,
	"internal_links_count" integer DEFAULT 0 NOT NULL,
	"external_links_count" integer DEFAULT 0 NOT NULL,
	"lcp_ms" integer,
	"inp_ms" integer,
	"cls_score" real,
	"mobile_friendly" boolean,
	"score_technical" smallint,
	"score_cwv" smallint,
	"score_onpage" smallint,
	"score_content" smallint,
	"score_geo" smallint,
	"score_total" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"category" "score_category" NOT NULL,
	"severity" "severity" NOT NULL,
	"description" text NOT NULL,
	"detected_value" text,
	"site_level" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"fix_title" text NOT NULL,
	"fix_description_ai_generated" text,
	"llm_provider" "llm_provider",
	"impact_score" integer DEFAULT 3 NOT NULL,
	"effort_score" integer DEFAULT 3 NOT NULL,
	"priority_rank" integer DEFAULT 0 NOT NULL,
	"auto_fixable" boolean DEFAULT false NOT NULL,
	"applied" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"search_volume" integer DEFAULT 0 NOT NULL,
	"current_position" real,
	"target_page_id" uuid,
	"difficulty_score" integer,
	"source" "keyword_source" NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"crawl_id" uuid,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"baseline_monthly_visits" integer DEFAULT 0 NOT NULL,
	"baseline_source" "baseline_source" NOT NULL,
	"estimate_low" integer NOT NULL,
	"estimate_mid" integer NOT NULL,
	"estimate_high" integer NOT NULL,
	"horizon_months" integer NOT NULL,
	"assumptions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"series_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_level" "confidence_level" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_secrets" ADD CONSTRAINT "site_secrets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crawls" ADD CONSTRAINT "crawls_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_crawl_id_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."crawls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD CONSTRAINT "keyword_data_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_data" ADD CONSTRAINT "keyword_data_target_page_id_pages_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_estimates" ADD CONSTRAINT "traffic_estimates_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_estimates" ADD CONSTRAINT "traffic_estimates_crawl_id_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."crawls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_secrets_site_kind_uq" ON "site_secrets" USING btree ("site_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_user_domain_uq" ON "sites" USING btree ("user_id","domain");--> statement-breakpoint
CREATE INDEX "crawls_site_idx" ON "crawls" USING btree ("site_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_crawl_url_uq" ON "pages" USING btree ("crawl_id","url");--> statement-breakpoint
CREATE INDEX "pages_crawl_score_idx" ON "pages" USING btree ("crawl_id","score_total");--> statement-breakpoint
CREATE INDEX "issues_page_idx" ON "issues" USING btree ("page_id","severity");--> statement-breakpoint
CREATE INDEX "recommendations_issue_idx" ON "recommendations" USING btree ("issue_id","priority_rank");--> statement-breakpoint
CREATE INDEX "keyword_data_site_idx" ON "keyword_data" USING btree ("site_id","keyword");--> statement-breakpoint
CREATE INDEX "traffic_estimates_site_idx" ON "traffic_estimates" USING btree ("site_id","generated_at");