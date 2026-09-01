import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { baselineSourceEnum, confidenceLevelEnum } from './enums.js';
import { crawls } from './crawls.js';
import { sites } from './sites.js';

export interface EstimatePhasePoint {
  days: number; // 30 | 60 | 90 | 180
  low: number;
  mid: number;
  high: number;
}

export interface EstimateMonthPoint {
  month: number;
  low: number;
  mid: number;
  high: number;
}

/**
 * Epic 7 — traffic estimates are ALWAYS an interval + assumptions. There is deliberately
 * no single "guaranteed" column.
 */
export const trafficEstimates = pgTable(
  'traffic_estimates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    crawlId: uuid('crawl_id').references(() => crawls.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    baselineMonthlyVisits: integer('baseline_monthly_visits').notNull().default(0),
    baselineSource: baselineSourceEnum('baseline_source').notNull(),
    estimateLow: integer('estimate_low').notNull(),
    estimateMid: integer('estimate_mid').notNull(),
    estimateHigh: integer('estimate_high').notNull(),
    horizonMonths: integer('horizon_months').notNull(),
    assumptions: jsonb('assumptions_json').$type<string[]>().notNull().default([]),
    series: jsonb('series_json').$type<EstimateMonthPoint[]>().notNull().default([]),
    /** Epic 22 — 30/60/90/180-day bands derived from `series`. Additive; still an interval. */
    phases: jsonb('phases_json').$type<EstimatePhasePoint[]>().notNull().default([]),
    confidenceLevel: confidenceLevelEnum('confidence_level').notNull(),
  },
  (t) => [index('traffic_estimates_site_idx').on(t.siteId, t.generatedAt)],
);

export type TrafficEstimateRow = typeof trafficEstimates.$inferSelect;
export type NewTrafficEstimateRow = typeof trafficEstimates.$inferInsert;
