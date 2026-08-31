DROP INDEX "keyword_data_site_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "keyword_data_site_keyword_uq" ON "keyword_data" USING btree ("site_id","keyword");