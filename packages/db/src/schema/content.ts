import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contentStatusEnum } from './enums.js';
import { sites } from './sites.js';
import { keywordData } from './keywords.js';

export interface ArticleCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}
export interface ArticleVerdict {
  checks: ArticleCheck[];
  score: number;
  pass: boolean;
  ranAt: string;
}

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
    /** 'standalone' = user-picked idea; 'supporting' = part of the auto blog plan. */
    kind: text('kind').notNull().default('standalone'),
    title: text('title'),
    /** The ready-to-paste prompt assembled from the brief + structured context. */
    promptText: text('prompt_text'),
    /** The article the user pasted back (markdown). */
    articleMd: text('article_md'),
    // --- Phase 4: supporting-content plan + internal linking ---
    cluster: text('cluster'),
    pillarKeyword: text('pillar_keyword'),
    /** Own money/pillar page this article should link to. */
    linkTo: text('link_to'),
    linkToLabel: text('link_to_label'),
    anchor: text('anchor'),
    secondaryKeywords: jsonb('secondary_keywords').$type<string[]>().default([]),
    targetWords: integer('target_words'),
    phase: integer('phase'), // 30 | 60 | 90
    estClicks: jsonb('est_clicks').$type<{ low: number; mid: number; high: number } | null>(),
    /** Last verification result (checkArticle). */
    verify: jsonb('verify').$type<ArticleVerdict | null>(),
    autoPublished: boolean('auto_published').notNull().default(false),
    wpPostId: integer('wp_post_id'),
    wpEditLink: text('wp_edit_link'),
    wpLink: text('wp_link'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('content_drafts_site_idx').on(t.siteId, t.status)],
);

export type ContentDraftRow = typeof contentDrafts.$inferSelect;
export type NewContentDraftRow = typeof contentDrafts.$inferInsert;
