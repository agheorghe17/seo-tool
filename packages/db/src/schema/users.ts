import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { planEnum } from './enums.js';

/**
 * Mirrors Supabase `auth.users` by id. Row created on first sign-in.
 * RLS: a user may read/update only their own row.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // == auth.users.id
  email: text('email').notNull(),
  plan: planEnum('plan').notNull().default('free'),
  quotaPagesMonth: integer('quota_pages_month').notNull().default(2000),
  quotaUsed: integer('quota_used').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
