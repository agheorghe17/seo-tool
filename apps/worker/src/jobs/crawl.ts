import type PgBoss from 'pg-boss';
import { and, eq, sql } from 'drizzle-orm';
import { crawls, db, pages, sites, users } from 'db';
import { crawlSite } from 'crawler';
import type { PageData } from 'shared';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import type { CrawlJob } from './types.js';

const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES ?? 2000);
const RPS = Number(process.env.CRAWL_REQUESTS_PER_SECOND ?? 2);
const USER_AGENT = process.env.CRAWL_USER_AGENT ?? 'SeoToolBot/0.1 (+https://example.com/bot)';
/** How often to flush progress to the crawls row. */
const PROGRESS_EVERY = 5;

function toPageRow(crawlId: string, page: PageData) {
  return {
    crawlId,
    url: page.url,
    statusCode: page.statusCode,
    redirectChain: page.redirectChain,
    indexability: page.indexability,
    renderedWith: page.renderedWith,
    contentHash: page.contentHash,
    title: page.title,
    metaDescription: page.metaDescription,
    h1: page.h1,
    headings: page.headings,
    wordCount: page.wordCount,
    canonicalUrl: page.canonicalUrl,
    schema: page.schemaTypes,
    images: page.images,
    internalLinksCount: page.internalLinksCount,
    externalLinksCount: page.externalLinksCount,
    internalLinks: page.internalLinks ?? [],
    mainText: page.mainText ?? null,
  };
}

export async function handleCrawl(job: PgBoss.Job<CrawlJob>, boss: PgBoss): Promise<void> {
  const { crawlId, siteId } = job.data;

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!site) throw new Error(`site ${siteId} not found`);

  await db
    .update(crawls)
    .set({ status: 'running', startedAt: new Date(), error: null })
    .where(eq(crawls.id, crawlId));

  const startUrl = `https://${site.domain}/`;
  let scanned = 0;
  let rendered = 0;
  let lastFlush = 0;
  let cancelled = false;

  try {
    for await (const ev of crawlSite({
      startUrl,
      maxPages: MAX_PAGES,
      requestsPerSecond: RPS,
      userAgent: USER_AGENT,
    })) {
      if (ev.type === 'discovered') {
        await db.update(crawls).set({ pagesTotal: ev.total }).where(eq(crawls.id, crawlId));
        continue;
      }

      if (ev.type === 'page') {
        await db
          .insert(pages)
          .values(toPageRow(crawlId, ev.page))
          .onConflictDoUpdate({
            target: [pages.crawlId, pages.url],
            set: { ...toPageRow(crawlId, ev.page), createdAt: new Date() },
          });

        if (ev.jsHeavy) {
          rendered++;
          const [row] = await db
            .select({ id: pages.id })
            .from(pages)
            .where(and(eq(pages.crawlId, crawlId), eq(pages.url, ev.page.url)));
          if (row) {
            await sendNext(boss, 'render', { crawlId, pageId: row.id, url: ev.page.url });
          }
        }
      }

      scanned = ev.scanned ?? scanned;
      if (scanned - lastFlush >= PROGRESS_EVERY) {
        lastFlush = scanned;
        await db
          .update(crawls)
          .set({ pagesScanned: scanned, pagesRendered: rendered })
          .where(eq(crawls.id, crawlId));

        // Epic 9.5 — honour a cancel requested via DELETE /api/crawls/:id.
        const [cur] = await db
          .select({ status: crawls.status })
          .from(crawls)
          .where(eq(crawls.id, crawlId));
        if (cur && cur.status !== 'running') {
          cancelled = true;
          logger.info({ crawlId }, 'crawl cancelled mid-run');
          break;
        }
      }

      if (ev.type === 'done') {
        // Crawl phase done, but the pipeline continues (enrich → score → recommend → estimate).
        // Keep the crawl "running" ("partial" only if pages errored); `estimate` sets "completed".
        await db
          .update(crawls)
          .set({
            status: ev.status === 'partial' ? 'partial' : 'running',
            pagesScanned: ev.scanned,
            pagesRendered: rendered,
          })
          .where(eq(crawls.id, crawlId));
        // Epic 10.3 — count scanned pages against the user's monthly quota.
        await db
          .update(users)
          .set({ quotaUsed: sql`${users.quotaUsed} + ${ev.scanned}` })
          .where(eq(users.id, site.userId));
        await sendNext(boss, 'enrich', { crawlId });
        logger.info({ crawlId, scanned: ev.scanned, status: ev.status }, 'crawl finished');
      }
    }
    if (cancelled) return;
  } catch (err) {
    await db
      .update(crawls)
      .set({ status: 'failed', error: String(err), completedAt: new Date() })
      .where(eq(crawls.id, crawlId));
    throw err;
  }
}
