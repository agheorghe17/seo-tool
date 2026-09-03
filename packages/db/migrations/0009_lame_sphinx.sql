ALTER TABLE "competitor_pages" ADD COLUMN "main_text" text;--> statement-breakpoint
ALTER TABLE "page_blueprints" ADD COLUMN "competitor_insight" jsonb;--> statement-breakpoint
ALTER TABLE "page_blueprints" ADD COLUMN "agent_rationale" text;--> statement-breakpoint
ALTER TABLE "page_blueprints" ADD COLUMN "agent_priority" integer;