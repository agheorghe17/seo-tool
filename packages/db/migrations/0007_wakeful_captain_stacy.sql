ALTER TYPE "public"."llm_provider" ADD VALUE 'gemini' BEFORE 'none';--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"day" text PRIMARY KEY NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_agent_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"reviewed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_agent_notes" ADD CONSTRAINT "seo_agent_notes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seo_agent_notes_site_uq" ON "seo_agent_notes" USING btree ("site_id");