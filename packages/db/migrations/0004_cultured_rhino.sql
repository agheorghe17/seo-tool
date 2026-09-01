CREATE TYPE "public"."content_status" AS ENUM('idea', 'prompt_ready', 'review', 'published', 'discarded');--> statement-breakpoint
ALTER TYPE "public"."secret_kind" ADD VALUE 'ga4_refresh_token';--> statement-breakpoint
ALTER TYPE "public"."secret_kind" ADD VALUE 'gbp_refresh_token';--> statement-breakpoint
CREATE TABLE "content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"keyword_id" uuid,
	"status" "content_status" DEFAULT 'idea' NOT NULL,
	"title" text,
	"prompt_text" text,
	"article_md" text,
	"wp_post_id" integer,
	"wp_edit_link" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "ga4_property" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "gbp_location" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_keyword_id_keyword_data_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keyword_data"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_drafts_site_idx" ON "content_drafts" USING btree ("site_id","status");