import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  expansionSourceEnum,
  keywordBucketEnum,
  keywordIntentEnum,
  keywordSourceEnum,
} from './enums.js';
import { pages } from './pages.js';
import { sites } from './sites.js';

export const keywordData = pgTable(
  'keyword_data',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    keyword: text('keyword').notNull(),
    searchVolume: integer('search_volume').notNull().default(0),
    currentPosition: real('current_position'),
    targetPageId: uuid('target_page_id').references(() => pages.id, { onDelete: 'set null' }),
    difficultyScore: integer('difficulty_score'),
    source: keywordSourceEnum('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),

    // --- Strategy module (Epic 14) ---
    intent: keywordIntentEnum('intent').default('unknown'),
    clusterId: uuid('cluster_id'), // FK added in strategy.ts relations / migration
    businessRelevance: smallint('business_relevance'),
    competition: real('competition'),
    opportunityScore: smallint('opportunity_score'),
    bucket: keywordBucketEnum('bucket').notNull().default('none'),
    hasTargetPage: boolean('has_target_page').notNull().default(false),
    expansionSource: expansionSourceEnum('expansion_source'),
    gl: text('gl').notNull().default(sql`'ro'`),
    hl: text('hl').notNull().default(sql`'ro'`),
  },
  (t) => [
    uniqueIndex('keyword_data_site_keyword_uq').on(t.siteId, t.keyword),
    index('keyword_data_site_bucket_idx').on(t.siteId, t.bucket),
  ],
);

export type KeywordDataRow = typeof keywordData.$inferSelect;
export type NewKeywordDataRow = typeof keywordData.$inferInsert;
