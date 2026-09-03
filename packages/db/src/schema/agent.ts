import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
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

/**
 * Rules the agent has "learned" from the user's corrections. The human-curated base
 * lives in `seo-playbook.md` (repo); these rows are merged in at review time and are
 * editable in the app. `site_id` NULL = applies to every site.
 */
export const playbookRules = pgTable(
  'playbook_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    /** The raw correction / context this rule was distilled from. */
    rationale: text('rationale'),
    source: text('source').notNull().default('correction'), // correction | manual | agent
    sourceRef: text('source_ref'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('playbook_rules_site_idx').on(t.siteId, t.createdAt)],
);

export type LlmUsageRow = typeof llmUsage.$inferSelect;
export type SeoAgentNoteRow = typeof seoAgentNotes.$inferSelect;
export type PlaybookRuleRow = typeof playbookRules.$inferSelect;
