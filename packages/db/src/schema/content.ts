import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contentStatusEnum } from './enums.js';
import { sites } from './sites.js';
import { keywordData } from './keywords.js';

/**
 * Epic 21 — assisted content. The app assembles a copy-paste prompt from structured
 * data; the user runs it in their own Claude, pastes the article back, and the app
 * publishes it to WordPress AS A DRAFT (never live). No paid LLM API involved.
 */
export const contentDrafts = pgTable(
  'content_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    keywordId: uuid('keyword_id').references(() => keywordData.id, { onDelete: 'set null' }),
    status: contentStatusEnum('status').notNull().default('idea'),
    title: text('title'),
    /** The ready-to-paste prompt assembled from the brief + structured context. */
    promptText: text('prompt_text'),
    /** The article the user pasted back (markdown). */
    articleMd: text('article_md'),
    wpPostId: integer('wp_post_id'),
    wpEditLink: text('wp_edit_link'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_drafts_site_idx').on(t.siteId, t.status)],
);

export type ContentDraftRow = typeof contentDrafts.$inferSelect;
export type NewContentDraftRow = typeof contentDrafts.$inferInsert;
