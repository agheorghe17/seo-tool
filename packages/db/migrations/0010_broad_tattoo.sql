ALTER TABLE "business_profiles" ADD COLUMN "auto_publish_blog" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "kind" text DEFAULT 'standalone' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "cluster" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "pillar_keyword" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "link_to" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "link_to_label" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "anchor" text;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "secondary_keywords" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "target_words" integer;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "phase" integer;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "est_clicks" jsonb;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "verify" jsonb;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "auto_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD COLUMN "wp_link" text;