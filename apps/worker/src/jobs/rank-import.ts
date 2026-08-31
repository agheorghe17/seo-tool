import type PgBoss from 'pg-boss';
import { and, eq } from 'drizzle-orm';
import { competitors, db, keywordData, pages, rankSnapshots } from 'db';
import { gsc } from 'connectors';
import { classifyIntent, strikingDistance, tokenSimilarity, type GscQueryRow } from 'strategy';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import { GL, HL, gscAccessToken, latestCompletedCrawlId, ownPageLikes, siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

function isoDaysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Even without GSC: match each keyword to one of the site's own crawled pages by
 * title/H1/slug similarity → set has_target_page + target_page_id. This is what lets the
 * opportunity engine distinguish "optimise an existing page" from "create a new page".
 */
async function matchOwnPages(siteId: string): Promise<void> {
  const crawlId = await latestCompletedCrawlId(siteId);
  if (!crawlId) return;
  const pageLikes = await ownPageLikes(crawlId);
  if (pageLikes.length === 0) return;

  const rows = await db.select({ id: pages.id, url: pages.url }).from(pages).where(eq(pages.crawlId, crawlId));
  const idByUrl = new Map(rows.map((r) => [r.url, r.id]));

  const kws = await db
    .select({ id: keywordData.id, keyword: keywordData.keyword })
    .from(keywordData)
    .where(eq(keywordData.siteId, siteId));

  for (const kw of kws) {
    let best: { url: string; sim: number } | null = null;
    for (const p of pageLikes) {
      const hay = `${p.title ?? ''} ${p.h1 ?? ''} ${p.url}`;
      const sim = tokenSimilarity(kw.keyword, hay);
      if (!best || sim > best.sim) best = { url: p.url, sim };
    }
    if (best && best.sim >= 0.34) {
      await db
        .update(keywordData)
        .set({ hasTargetPage: true, targetPageId: idByUrl.get(best.url) ?? null })
        .where(eq(keywordData.id, kw.id));
    }
  }
}

export async function handleRankImport(job: PgBoss.Job<SiteJob>, boss: PgBoss): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  await matchOwnPages(siteId);

  const kickCompetitorsAndBuild = async () => {
    const comps = await db
      .select({ id: competitors.id })
      .from(competitors)
      .where(eq(competitors.siteId, siteId));
    for (const c of comps) await sendNext(boss, 'competitor-crawl', { siteId, competitorId: c.id });
    await sendNext(boss, 'strategy-build', { siteId, full: true });
  };

  if (!site.gscConnected || !site.gscProperty) {
    logger.info({ siteId }, 'rank-import: GSC not connected (own-page match only)');
    await kickCompetitorsAndBuild();
    return;
  }

  const token = await gscAccessToken(siteId);
  if (!token) {
    logger.warn({ siteId }, 'rank-import: no GSC token');
    await kickCompetitorsAndBuild();
    return;
  }

  let rows: gsc.GscRow[] = [];
  try {
    rows = await gsc.fetchSearchAnalytics(token, {
      property: site.gscProperty,
      startDate: isoDaysAgo(180),
      endDate: isoDaysAgo(2),
      dimensions: ['query', 'page'],
      rowLimit: 5000,
    });
  } catch (err) {
    logger.warn({ err, siteId }, 'rank-import: GSC query failed');
    await kickCompetitorsAndBuild();
    return;
  }

  const gscRows: GscQueryRow[] = rows.map((r) => ({
    keyword: (r.keys[0] ?? '').toLowerCase(),
    page: r.keys[1] ?? '',
    position: r.position,
    impressions: r.impressions,
    clicks: r.clicks,
  }));

  // Best position per keyword.
  const best = new Map<string, GscQueryRow>();
  for (const r of gscRows) {
    if (!r.keyword) continue;
    const cur = best.get(r.keyword);
    if (!cur || r.position < cur.position) best.set(r.keyword, r);
  }

  for (const [keyword, r] of best) {
    const [kw] = await db
      .insert(keywordData)
      .values({
        siteId,
        keyword,
        source: 'gsc',
        currentPosition: r.position,
        hasTargetPage: true,
        intent: classifyIntent(keyword),
        expansionSource: 'gsc',
        gl: GL,
        hl: HL,
      })
      .onConflictDoUpdate({
        target: [keywordData.siteId, keywordData.keyword],
        set: { currentPosition: r.position, hasTargetPage: true },
      })
      .returning({ id: keywordData.id });
    if (!kw) continue;
    await db.insert(rankSnapshots).values({
      siteId,
      keywordId: kw.id,
      position: r.position,
      url: r.page,
      source: 'gsc',
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.impressions > 0 ? r.clicks / r.impressions : 0,
    });
  }

  // Striking distance → quick_win bucket + mark for SERP tracking.
  const striking = strikingDistance(gscRows);
  for (const s of striking) {
    await db
      .update(keywordData)
      .set({ bucket: 'quick_win' })
      .where(and(eq(keywordData.siteId, siteId), eq(keywordData.keyword, s.keyword)));
  }

  logger.info({ siteId, keywords: best.size, striking: striking.length }, 'rank-import done');
  await kickCompetitorsAndBuild();
}
