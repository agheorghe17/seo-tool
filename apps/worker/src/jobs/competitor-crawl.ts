import type PgBoss from 'pg-boss';
import { eq } from 'drizzle-orm';
import { competitorPages, competitors, db } from 'db';
import { crawlSite } from 'crawler';
import { guessTargetKeyword, slugFromUrl } from 'strategy';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import type { CompetitorCrawlJob } from './types.js';

const MAX_PAGES = Number(process.env.COMPETITOR_CRAWL_MAX_PAGES ?? 300);
const UA = process.env.CRAWL_USER_AGENT ?? 'SeoToolBot/0.1 (+https://example.com/bot)';

export async function handleCompetitorCrawl(
  job: PgBoss.Job<CompetitorCrawlJob>,
  boss: PgBoss,
): Promise<void> {
  const { siteId, competitorId } = job.data;
  const [comp] = await db.select().from(competitors).where(eq(competitors.id, competitorId));
  if (!comp) {
    logger.warn({ competitorId }, 'competitor-crawl: competitor gone');
    return;
  }

  const startUrl = `https://${comp.domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/`;
  let scanned = 0;

  try {
    for await (const ev of crawlSite({
      startUrl,
      maxPages: MAX_PAGES,
      requestsPerSecond: 1,
      userAgent: UA,
    })) {
      if (ev.type !== 'page') continue;
      const p = ev.page;
      const guess = guessTargetKeyword({
        url: p.url,
        title: p.title,
        h1: p.h1,
        headings: p.headings,
        wordCount: p.wordCount,
        schemaTypes: p.schemaTypes,
        slug: slugFromUrl(p.url),
      });
      await db
        .insert(competitorPages)
        .values({
          competitorId,
          url: p.url,
          title: p.title,
          h1: p.h1,
          headings: p.headings,
          wordCount: p.wordCount,
          schema: p.schemaTypes,
          mainText: p.mainText ?? null,
          slug: slugFromUrl(p.url),
          targetKeywordGuess: guess.keyword,
          contentHash: p.contentHash,
        })
        .onConflictDoUpdate({
          target: [competitorPages.competitorId, competitorPages.url],
          set: {
            title: p.title,
            h1: p.h1,
            headings: p.headings,
            wordCount: p.wordCount,
            schema: p.schemaTypes,
            mainText: p.mainText ?? null,
            targetKeywordGuess: guess.keyword,
            contentHash: p.contentHash,
          },
        });
      scanned++;
    }
  } catch (err) {
    logger.warn({ err, competitorId, domain: comp.domain }, 'competitor-crawl error');
  }

  await db
    .update(competitors)
    .set({ lastCrawlAt: new Date(), pagesCrawled: scanned })
    .where(eq(competitors.id, competitorId));

  logger.info({ competitorId, domain: comp.domain, scanned }, 'competitor-crawl done');
  await sendNext(boss, 'strategy-build', { siteId, full: false });
}
