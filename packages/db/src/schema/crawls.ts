import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { crawlStatusEnum } from './enums.js';
import { sites } from './sites.js';

export const crawls = pgTable(
  'crawls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    status: crawlStatusEnum('status').notNull().default('queued'),
    pagesTotal: integer('pages_total').notNull().default(0),
    pagesScanned: integer('pages_scanned').notNull().default(0),
    pagesRendered: integer('pages_rendered').notNull().default(0),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crawls_site_idx').on(t.siteId, t.createdAt)],
);

export type CrawlRow = typeof crawls.$inferSelect;
export type NewCrawlRow = typeof crawls.$inferInsert;
