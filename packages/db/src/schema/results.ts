import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { interventionKindEnum, interventionOutcomeEnum, scoreCategoryEnum } from './enums.js';
import { sites } from './sites.js';
import { keywordData } from './keywords.js';

/**
 * Epic 23 — the verification loop. Every change the user applies is recorded here with a
 * "before" snapshot; a weekly job later measures what actually happened. Outcomes feed
 * `impact_calibration` so the estimator learns this site's real response.
 */
export const interventions = pgTable(
  'interventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    kind: interventionKindEnum('kind').notNull(),
    /** e.g. 'onpage.title-length', 'blueprint', 'geo' — used to bucket calibration. */
    category: text('category'),
    targetUrl: text('target_url'),
    targetKeywordId: uuid('target_keyword_id').references(() => keywordData.id, {
      onDelete: 'set null',
    }),
    label: text('label').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    before: jsonb('before_json').$type<{
      position: number | null;
      clicks: number | null;
      impressions: number | null;
    }>(),
    outcome: interventionOutcomeEnum('outcome').notNull().default('pending'),
    measuredAt: timestamp('measured_at', { withTimezone: true }),
    after: jsonb('after_json').$type<{
      position: number | null;
      clicks: number | null;
      impressions: number | null;
    }>(),
    deltaPosition: real('delta_position'),
    deltaClicks: integer('delta_clicks'),
  },
  (t) => [index('interventions_site_idx').on(t.siteId, t.appliedAt)],
);

/** Epic 23 — observed uplift multiplier per category, learned from intervention outcomes. */
export const impactCalibration = pgTable(
  'impact_calibration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    category: scoreCategoryEnum('category').notNull(),
    observedMultiplier: real('observed_multiplier').notNull().default(1),
    sampleN: integer('sample_n').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('impact_calibration_site_cat_uq').on(t.siteId, t.category)],
);

/** Epic 23 — monthly GSC clicks/impressions/position per page, for the content-decay radar. */
export const pageTrafficHistory = pgTable(
  'page_traffic_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    month: text('month').notNull(), // 'YYYY-MM'
    clicks: integer('clicks').notNull().default(0),
    impressions: integer('impressions').notNull().default(0),
    position: real('position'),
  },
  (t) => [
    uniqueIndex('page_traffic_history_uq').on(t.siteId, t.url, t.month),
    index('page_traffic_history_site_idx').on(t.siteId, t.month),
  ],
);

export type InterventionRow = typeof interventions.$inferSelect;
export type NewInterventionRow = typeof interventions.$inferInsert;
export type ImpactCalibrationRow = typeof impactCalibration.$inferSelect;
export type PageTrafficHistoryRow = typeof pageTrafficHistory.$inferSelect;
