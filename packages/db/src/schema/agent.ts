import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sites } from './sites.js';

/**
 * Phase "AI agent" — a hard daily cap on LLM calls so a free-tier key can never
 * be pushed past its quota. One row per calendar day (UTC), incremented per call.
 */
export const llmUsage = pgTable('llm_usage', {
  day: text('day').primaryKey(), // 'YYYY-MM-DD' (UTC)
  calls: integer('calls').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The weekly SEO-agent review note. Advisory only — the agent never mutates the
 * deterministic plan, it flags things for the user. One (latest) row per site.
 */
export const seoAgentNotes = pgTable(
  'seo_agent_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    summary: text('summary').notNull(),
    flags: jsonb('flags')
      .$type<{ target: string; problem: string; suggestion: string }[]>()
      .notNull()
      .default([]),
    model: text('model'),
    reviewed: integer('reviewed').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('seo_agent_notes_site_uq').on(t.siteId)],
);

export type LlmUsageRow = typeof llmUsage.$inferSelect;
export type SeoAgentNoteRow = typeof seoAgentNotes.$inferSelect;
