import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { issues } from './issues.js';
import { llmProviderEnum } from './enums.js';

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    fixTitle: text('fix_title').notNull(),
    fixDescriptionAiGenerated: text('fix_description_ai_generated'),
    llmProvider: llmProviderEnum('llm_provider'),
    impactScore: integer('impact_score').notNull().default(3),
    effortScore: integer('effort_score').notNull().default(3),
    priorityRank: integer('priority_rank').notNull().default(0),
    autoFixable: boolean('auto_fixable').notNull().default(false),
    applied: boolean('applied').notNull().default(false),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    /** Holds the previous value(s) for rollback after an auto-fix is applied. */
    appliedResult: jsonb('applied_result_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recommendations_issue_idx').on(t.issueId, t.priorityRank)],
);

export type RecommendationRow = typeof recommendations.$inferSelect;
export type NewRecommendationRow = typeof recommendations.$inferInsert;
