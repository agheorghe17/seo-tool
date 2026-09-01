import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/** Epic 9.2 — per-job execution audit (feeds the cost/usage view, Epic 11.7). */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    crawlId: uuid('crawl_id'),
    /** Epic 23 — set when the job payload carries a siteId (strategy / plan pipeline). */
    siteId: uuid('site_id'),
    status: text('status').notNull(), // running | ok | failed
    attempts: integer('attempts').notNull().default(1),
    error: text('error'),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('job_runs_crawl_idx').on(t.crawlId),
    index('job_runs_type_idx').on(t.type, t.startedAt),
    index('job_runs_site_idx').on(t.siteId, t.startedAt),
  ],
);

/** Epic 10.6 — audit log for sensitive actions. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    subjectId: uuid('subject_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_user_idx').on(t.userId, t.createdAt)],
);

export type JobRunRow = typeof jobRuns.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
