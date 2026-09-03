import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { crawls } from './crawls.js';
import {
  competitorAddedByEnum,
  keywordIntentEnum,
  rankSourceEnum,
  roadmapStatusEnum,
} from './enums.js';
import { keywordData } from './keywords.js';
import { pages } from './pages.js';
import { sites } from './sites.js';

/** Epic 13.1 — business profile: auto-extracted from the crawl, then editable by the user. */
export const businessProfiles = pgTable('business_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id')
    .notNull()
    .unique()
    .references(() => sites.id, { onDelete: 'cascade' }),
  summary: text('summary'),
  services: jsonb('services').$type<string[]>().notNull().default([]),
  locations: jsonb('locations').$type<string[]>().notNull().default([]),
  languages: jsonb('languages').$type<string[]>().notNull().default(['ro']),
  audience: text('audience'),
  offerNotes: text('offer_notes'),
  // Epic 22 — per-site target market. env STRATEGY_GEO/STRATEGY_LANG are only fallbacks now.
  geoCountry: text('geo_country'),
  geoLanguage: text('geo_language'),
  primaryCity: text('primary_city'),
  localEmphasis: boolean('local_emphasis').notNull().default(false),
  sourceCrawlId: uuid('source_crawl_id').references(() => crawls.id, { onDelete: 'set null' }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const competitors = pgTable(
  'competitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    label: text('label'),
    addedBy: competitorAddedByEnum('added_by').notNull().default('user'),
    notes: text('notes'),
    lastCrawlAt: timestamp('last_crawl_at', { withTimezone: true }),
    pagesCrawled: integer('pages_crawled').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('competitors_site_domain_uq').on(t.siteId, t.domain)],
);

export const competitorPages = pgTable(
  'competitor_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    competitorId: uuid('competitor_id')
      .notNull()
      .references(() => competitors.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    h1: text('h1'),
    headings: jsonb('headings_json').$type<{ level: number; text: string }[]>().default([]),
    wordCount: integer('word_count').notNull().default(0),
    schema: jsonb('schema_json').$type<string[]>().default([]),
    /** First ~8 KB of the competitor page's main content — for the LLM gap read. */
    mainText: text('main_text'),
    slug: text('slug'),
    targetKeywordGuess: text('target_keyword_guess'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
    contentHash: text('content_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('competitor_pages_url_uq').on(t.competitorId, t.url),
    index('competitor_pages_kw_idx').on(t.competitorId, t.targetKeywordGuess),
  ],
);

export const keywordClusters = pgTable(
  'keyword_clusters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pillarKeyword: text('pillar_keyword'),
    intent: keywordIntentEnum('intent'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('keyword_clusters_site_name_uq').on(t.siteId, t.name)],
);

/** Epic 15.2 — historical position snapshots (GSC weekly + optional SERP). */
export const rankSnapshots = pgTable(
  'rank_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id')
      .notNull()
      .references(() => keywordData.id, { onDelete: 'cascade' }),
    position: real('position'),
    url: text('url'),
    source: rankSourceEnum('source').notNull(),
    impressions: integer('impressions'),
    clicks: integer('clicks'),
    ctr: real('ctr'),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rank_snapshots_kw_time_idx').on(t.keywordId, t.capturedAt)],
);

/** Epic 16.5 / Epic 19 — one SERP snapshot row per result (own + tracked competitors). */
export const serpResults = pgTable(
  'serp_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id')
      .notNull()
      .references(() => keywordData.id, { onDelete: 'cascade' }),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
    position: integer('position').notNull(),
    domain: text('domain').notNull(),
    url: text('url'),
    title: text('title'),
    isOwn: boolean('is_own').notNull().default(false),
    isTrackedCompetitor: boolean('is_tracked_competitor').notNull().default(false),
  },
  (t) => [index('serp_results_kw_time_idx').on(t.keywordId, t.capturedAt)],
);

/** Epic 17.3 — per-keyword content brief + on-page checklist. */
export const keywordPlaybooks = pgTable('keyword_playbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  keywordId: uuid('keyword_id')
    .notNull()
    .unique()
    .references(() => keywordData.id, { onDelete: 'cascade' }),
  targetPageId: uuid('target_page_id').references(() => pages.id, { onDelete: 'set null' }),
  brief: jsonb('brief_json').$type<{
    title?: string;
    slug?: string;
    h2s?: string[];
    mustCover?: string[];
    faqs?: string[];
    internalLinks?: string[];
    competitorRefs?: string[];
  }>(),
  checklist: jsonb('checklist_json').$type<{ item: string; done: boolean }[]>().default([]),
  llmProvider: text('llm_provider'),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Epic 17.3 — 30/60/90-day action items. */
export const roadmapItems = pgTable(
  'roadmap_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id').references(() => keywordData.id, { onDelete: 'set null' }),
    phase: smallint('phase').notNull(), // 30 | 60 | 90
    title: text('title').notNull(),
    why: text('why'),
    effort: smallint('effort').notNull().default(3),
    impact: smallint('impact').notNull().default(3),
    status: roadmapStatusEnum('status').notNull().default('todo'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('roadmap_items_site_phase_idx').on(t.siteId, t.phase, t.sortOrder)],
);

export type BusinessProfileRow = typeof businessProfiles.$inferSelect;
export type CompetitorRow = typeof competitors.$inferSelect;
export type CompetitorPageRow = typeof competitorPages.$inferSelect;
export type KeywordClusterRow = typeof keywordClusters.$inferSelect;
export type RankSnapshotRow = typeof rankSnapshots.$inferSelect;
export type SerpResultRow = typeof serpResults.$inferSelect;
export type KeywordPlaybookRow = typeof keywordPlaybooks.$inferSelect;
export type RoadmapItemRow = typeof roadmapItems.$inferSelect;
