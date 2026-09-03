import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { blueprintStatusEnum } from './enums.js';
import { sites } from './sites.js';
import { pages } from './pages.js';
import { keywordData } from './keywords.js';

/**
 * Epic 22 — per-page blueprint: what keyword the page should own and how to rebuild it.
 * Fully config-driven (business_profiles target market) — no niche/market assumptions in code.
 */
export const pageBlueprints = pgTable(
  'page_blueprints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id').references(() => pages.id, { onDelete: 'set null' }),
    url: text('url').notNull(),
    isHomepage: boolean('is_homepage').notNull().default(false),
    targetKeyword: text('target_keyword'),
    targetKeywordId: uuid('target_keyword_id').references(() => keywordData.id, {
      onDelete: 'set null',
    }),
    secondaryKeywords: jsonb('secondary_keywords').$type<string[]>().notNull().default([]),
    current: jsonb('current_json').$type<{
      title: string | null;
      h1: string | null;
      metaLen: number;
      wordCount: number;
      schemaTypes: string[];
      position: number | null;
      monthlyClicks: number | null;
    }>(),
    recommended: jsonb('recommended_json').$type<{
      title: string;
      h1: string;
      metaDescription: string;
      h2Outline: string[];
      schemaType: string;
      internalLinksOut: string[];
      internalLinksIn: string[];
      wordCountTarget: number;
    }>(),
    potential: jsonb('potential_json').$type<{
      searchVolume: number | null;
      /** set when `searchVolume` is borrowed from a broader term (local long-tail with no Planner data) */
      volumeProxyKeyword?: string | null;
      currentClicks: number | null;
      targetPosLow: number;
      targetPosHigh: number;
      clicksLow: number;
      clicksMid: number;
      clicksHigh: number;
      qualitative: boolean;
    }>(),
    /** LLM read of the best competitor page vs this one (Phase 3). */
    competitorInsight: jsonb('competitor_insight').$type<{
      competitorUrl: string;
      missingTopics: string[];
      angle: string;
      depthNote: string;
    } | null>(),
    rationale: text('rationale'),
    /** Phase 3 — agent's in-place edits. NULL = untouched; revert = set back to NULL. */
    agentRationale: text('agent_rationale'),
    agentPriority: integer('agent_priority'),
    /** 'ok' | 'cannibalization' | 'orphan_page' | 'no_target' */
    diagnosis: text('diagnosis').notNull().default('ok'),
    priority: integer('priority').notNull().default(0),
    status: blueprintStatusEnum('status').notNull().default('draft'),
    appliedResult: jsonb('applied_result_json').$type<Record<string, unknown>>(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('page_blueprints_site_idx').on(t.siteId, t.priority)],
);

export type PageBlueprintRow = typeof pageBlueprints.$inferSelect;
export type NewPageBlueprintRow = typeof pageBlueprints.$inferInsert;
