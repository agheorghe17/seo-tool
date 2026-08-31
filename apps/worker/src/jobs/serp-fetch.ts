import type PgBoss from 'pg-boss';
import { eq } from 'drizzle-orm';
import { competitors, db, keywordData, rankSnapshots, serpResults } from 'db';
import { getSerpProvider, serpEnabled, type SerpItem } from 'connectors';
import { logger } from '../logger.js';
import { GL, HL, siteRow } from './strategy-shared.js';
import { runPool } from './pool.js';
import type { SiteJob } from './types.js';

const MAX = Number(process.env.SERP_MAX_KEYWORDS ?? 200);

function baseDomain(d: string): string {
  return d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
}

export async function handleSerpFetch(job: PgBoss.Job<SiteJob>): Promise<void> {
  const { siteId } = job.data;
  if (!serpEnabled()) {
    logger.info({ siteId }, 'serp-fetch: no SERP provider configured, skipping');
    return;
  }
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const own = baseDomain(site.domain);
  const compDomains = new Set(
    (await db.select({ domain: competitors.domain }).from(competitors).where(eq(competitors.siteId, siteId))).map(
      (c) => baseDomain(c.domain),
    ),
  );

  const tracked = await db
    .select({ id: keywordData.id, keyword: keywordData.keyword })
    .from(keywordData)
    .where(eq(keywordData.bucket, 'tracked'))
    .limit(MAX);

  if (tracked.length === 0) {
    logger.info({ siteId }, 'serp-fetch: no tracked keywords');
    return;
  }

  const provider = getSerpProvider();
  await runPool(tracked, 3, async (kw) => {
    const r = await provider.search({ keyword: kw.keyword, gl: GL, hl: HL });
    if (!r) return;
    const items = r.items.slice(0, 20);
    for (const it of items) {
      const dom = it.domain.replace(/^www\./, '').toLowerCase();
      await db.insert(serpResults).values({
        siteId,
        keywordId: kw.id,
        position: it.position,
        domain: dom,
        url: it.url,
        title: it.title ?? null,
        isOwn: dom === own,
        isTrackedCompetitor: compDomains.has(dom),
      });
    }
    const mine = items.find((it: SerpItem) => it.domain.replace(/^www\./, '').toLowerCase() === own);
    if (mine) {
      await db.insert(rankSnapshots).values({
        siteId,
        keywordId: kw.id,
        position: mine.position,
        url: mine.url,
        source: 'serp',
      });
      await db
        .update(keywordData)
        .set({ currentPosition: mine.position })
        .where(eq(keywordData.id, kw.id));
    }
  });

  logger.info({ siteId, keywords: tracked.length }, 'serp-fetch done');
}
