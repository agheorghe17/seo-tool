import { index, integer, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { keywordSourceEnum } from './enums.js';
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
  },
  (t) => [index('keyword_data_site_idx').on(t.siteId, t.keyword)],
);

export type KeywordDataRow = typeof keywordData.$inferSelect;
export type NewKeywordDataRow = typeof keywordData.$inferInsert;
