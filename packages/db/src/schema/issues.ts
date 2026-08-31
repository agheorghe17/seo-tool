import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { pages } from './pages.js';
import { scoreCategoryEnum, severityEnum } from './enums.js';

export const issues = pgTable(
  'issues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    ruleId: text('rule_id').notNull(),
    ruleVersion: integer('rule_version').notNull().default(1),
    category: scoreCategoryEnum('category').notNull(),
    severity: severityEnum('severity').notNull(),
    description: text('description').notNull(),
    detectedValue: text('detected_value'),
    siteLevel: boolean('site_level').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('issues_page_idx').on(t.pageId, t.severity)],
);

export type IssueRow = typeof issues.$inferSelect;
export type NewIssueRow = typeof issues.$inferInsert;
