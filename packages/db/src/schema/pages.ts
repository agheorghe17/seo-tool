import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { HeadingNode, PageImage } from 'shared';
import { crawls } from './crawls.js';
import { indexabilityEnum, renderedWithEnum } from './enums.js';

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    crawlId: uuid('crawl_id')
      .notNull()
      .references(() => crawls.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    statusCode: smallint('status_code'),
    redirectChain: jsonb('redirect_chain_json').$type<string[]>().default([]),
    indexability: indexabilityEnum('indexability'),
    renderedWith: renderedWithEnum('rendered_with').notNull().default('static'),
    contentHash: text('content_hash'),

    title: text('title'),
    metaDescription: text('meta_description'),
    h1: text('h1'),
    headings: jsonb('headings_json').$type<HeadingNode[]>().default([]),
    wordCount: integer('word_count').notNull().default(0),
    canonicalUrl: text('canonical_url'),
    schema: jsonb('schema_json').$type<unknown[]>().default([]),
    images: jsonb('images_json').$type<PageImage[]>().default([]),
    internalLinksCount: integer('internal_links_count').notNull().default(0),
    externalLinksCount: integer('external_links_count').notNull().default(0),
    // Epic 23 — outbound same-host links (with anchor) + trimmed main text, for the
    // internal-link engine and the content-decay refresh briefs.
    internalLinks: jsonb('internal_links').$type<{ url: string; anchor: string }[]>().default([]),
    mainText: text('main_text'),

    lcpMs: integer('lcp_ms'),
    inpMs: integer('inp_ms'),
    clsScore: real('cls_score'),
    mobileFriendly: boolean('mobile_friendly'),

    scoreTechnical: smallint('score_technical'),
    scoreCwv: smallint('score_cwv'),
    scoreOnpage: smallint('score_onpage'),
    scoreContent: smallint('score_content'),
    scoreGeo: smallint('score_geo'),
    scoreTotal: smallint('score_total'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pages_crawl_url_uq').on(t.crawlId, t.url),
    index('pages_crawl_score_idx').on(t.crawlId, t.scoreTotal),
  ],
);

export type PageRow = typeof pages.$inferSelect;
export type NewPageRow = typeof pages.$inferInsert;
