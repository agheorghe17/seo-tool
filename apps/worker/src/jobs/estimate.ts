import type PgBoss from 'pg-boss';
import { and, avg, count, eq } from 'drizzle-orm';
import {
  crawls,
  db,
  issues,
  keywordData,
  pages,
  siteSecrets,
  sites,
  trafficEstimates,
} from 'db';
import { gsc } from 'connectors';
import { estimateTraffic } from 'estimator';
import { decryptSecret, estimatedClicks, type ScoreCategory } from 'shared';
import { logger } from '../logger.js';
import type { EstimateJob } from './types.js';

const HORIZON = Number(process.env.ESTIMATE_HORIZON_MONTHS ?? 6);

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function gscBaseline(siteId: string, property: string): Promise<number | null> {
  const [secret] = await db
    .select()
    .from(siteSecrets)
    .where(and(eq(siteSecrets.siteId, siteId), eq(siteSecrets.kind, 'gsc_refresh_token')));
  if (!secret) return null;
  try {
    const refreshToken = decryptSecret({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      tag: secret.tag,
    });
    const accessToken = await gsc.refreshAccessToken(refreshToken);
    const rows = await gsc.fetchSearchAnalytics(accessToken, {
      property,
      startDate: isoDaysAgo(90),
      endDate: isoDaysAgo(1),
      dimensions: ['page'],
      rowLimit: 5000,
    });
    return Math.round(gsc.totalClicks(rows) / 3); // ~monthly average over 90 days
  } catch (err) {
    logger.warn({ err, siteId }, 'GSC baseline failed, falling back to keyword model');
    return null;
  }
}

async function keywordBaseline(siteId: string): Promise<number> {
  const rows = await db
    .select({
      volume: keywordData.searchVolume,
      position: keywordData.currentPosition,
    })
    .from(keywordData)
    .where(eq(keywordData.siteId, siteId));
  return rows.reduce((acc, r) => acc + estimatedClicks(r.volume, r.position ?? 20), 0);
}

export async function handleEstimate(job: PgBoss.Job<EstimateJob>): Promise<void> {
  const { siteId, crawlId } = job.data;

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!site) throw new Error(`site ${siteId} not found`);

  const catRows = await db
    .select({ category: issues.category, n: count() })
    .from(issues)
    .innerJoin(pages, eq(pages.id, issues.pageId))
    .where(eq(pages.crawlId, crawlId))
    .groupBy(issues.category);
  const openIssuesByCategory = Object.fromEntries(
    catRows.map((r) => [r.category, Number(r.n)]),
  ) as Partial<Record<ScoreCategory, number>>;

  const [scoreRow] = await db
    .select({ avgScore: avg(pages.scoreTotal) })
    .from(pages)
    .where(eq(pages.crawlId, crawlId));
  const siteScore = Math.round(Number(scoreRow?.avgScore ?? 0));

  let baseline = 0;
  let baselineSource: 'gsc' | 'keyword_model' = 'keyword_model';
  if (site.gscConnected && site.gscProperty) {
    const g = await gscBaseline(siteId, site.gscProperty);
    if (g != null) {
      baseline = g;
      baselineSource = 'gsc';
    }
  }
  if (baselineSource === 'keyword_model') {
    baseline = await keywordBaseline(siteId);
  }

  const estimate = estimateTraffic({
    baselineMonthlyVisits: baseline,
    baselineSource,
    openIssuesByCategory,
    siteScore,
    horizonMonths: HORIZON,
    gscConnected: Boolean(site.gscConnected),
  });

  await db.insert(trafficEstimates).values({
    siteId,
    crawlId,
    baselineMonthlyVisits: estimate.baselineMonthlyVisits,
    baselineSource: estimate.baselineSource,
    estimateLow: estimate.estimateLow,
    estimateMid: estimate.estimateMid,
    estimateHigh: estimate.estimateHigh,
    horizonMonths: estimate.horizonMonths,
    assumptions: estimate.assumptions,
    series: estimate.series,
    confidenceLevel: estimate.confidenceLevel,
  });

  await db
    .update(crawls)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(crawls.id, crawlId));

  logger.info(
    { siteId, crawlId, baselineSource, low: estimate.estimateLow, high: estimate.estimateHigh },
    'estimate finished — pipeline complete',
  );
}
