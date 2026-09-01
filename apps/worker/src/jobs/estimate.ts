import type PgBoss from 'pg-boss';
import { and, avg, count, desc, eq, inArray } from 'drizzle-orm';
import {
  crawls,
  db,
  impactCalibration,
  issues,
  keywordData,
  pageBlueprints,
  pages,
  siteSecrets,
  sites,
  trafficEstimates,
  users,
} from 'db';
import { gsc } from 'connectors';
import { backtestEstimate, estimateTraffic } from 'estimator';
import { decryptSecret, estimatedClicks, type ScoreCategory } from 'shared';
import { logger } from '../logger.js';
import { sendCrawlDoneEmail } from '../lib/email.js';
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

  // Epic 22 — bottom-up: sum the per-page blueprint potentials (extra monthly clicks).
  const bpRows = await db
    .select({ potential: pageBlueprints.potential })
    .from(pageBlueprints)
    .where(eq(pageBlueprints.siteId, siteId));
  let pageUpliftClicks: { low: number; mid: number; high: number } | undefined;
  const acc = { low: 0, mid: 0, high: 0 };
  for (const r of bpRows) {
    const p = r.potential;
    if (!p || p.qualitative) continue;
    const cur = p.currentClicks ?? 0;
    acc.low += Math.max(0, p.clicksLow - cur);
    acc.mid += Math.max(0, p.clicksMid - cur);
    acc.high += Math.max(0, p.clicksHigh - cur);
  }
  if (acc.high > 0) pageUpliftClicks = acc;

  // Epic 23 — per-category calibration learned from this site's intervention outcomes.
  const calibRows = await db
    .select()
    .from(impactCalibration)
    .where(eq(impactCalibration.siteId, siteId));
  const categoryCalibration = Object.fromEntries(
    calibRows.filter((r) => r.sampleN >= 5).map((r) => [r.category, r.observedMultiplier]),
  ) as Partial<Record<ScoreCategory, number>>;

  const estimate = estimateTraffic({
    baselineMonthlyVisits: baseline,
    baselineSource,
    openIssuesByCategory,
    siteScore,
    horizonMonths: HORIZON,
    gscConnected: Boolean(site.gscConnected),
    pageUpliftClicks,
    categoryCalibration: Object.keys(categoryCalibration).length ? categoryCalibration : undefined,
  });

  // Epic 23 — backtest the PREVIOUS estimate against reality (current GSC baseline).
  const [prevEst] = await db
    .select()
    .from(trafficEstimates)
    .where(eq(trafficEstimates.siteId, siteId))
    .orderBy(desc(trafficEstimates.generatedAt))
    .limit(1);
  const backtest =
    prevEst && baselineSource === 'gsc'
      ? backtestEstimate(
          prevEst.series,
          (Date.now() - new Date(prevEst.generatedAt).getTime()) / 86_400_000,
          baseline,
        )
      : null;

  // Whether this crawl was already estimated before (page-plan re-runs `estimate` to fold in
  // the bottom-up projection — we must not re-send the "crawl done" email on that pass).
  const [prior] = await db
    .select({ id: trafficEstimates.id })
    .from(trafficEstimates)
    .where(eq(trafficEstimates.crawlId, crawlId))
    .limit(1);
  const isFirstEstimate = !prior;

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
    phases: estimate.phases,
    backtest,
    confidenceLevel: estimate.confidenceLevel,
  });

  await db
    .update(crawls)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(crawls.id, crawlId));

  await pruneOldCrawls(siteId);

  if (isFirstEstimate) {
    const [owner] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, site.userId));
    if (owner?.email) {
      const webBase = process.env.WEB_BASE_URL ?? 'http://localhost:3000';
      await sendCrawlDoneEmail(owner.email, site.domain, `${webBase}/sites/${siteId}`);
    }
  }

  logger.info(
    { siteId, crawlId, baselineSource, low: estimate.estimateLow, high: estimate.estimateHigh },
    'estimate finished — pipeline complete',
  );
}

/** Epic 11.4 — keep only the most recent N crawls per site (stay within the free DB tier). */
const KEEP_CRAWLS = Number(process.env.RETAIN_CRAWLS_PER_SITE ?? 5);
async function pruneOldCrawls(siteId: string): Promise<void> {
  const rows = await db
    .select({ id: crawls.id })
    .from(crawls)
    .where(eq(crawls.siteId, siteId))
    .orderBy(desc(crawls.createdAt));
  const stale = rows.slice(KEEP_CRAWLS).map((r) => r.id);
  if (stale.length === 0) return;
  await db.delete(crawls).where(inArray(crawls.id, stale)); // pages/issues/recos cascade
  logger.info({ siteId, removed: stale.length }, 'pruned old crawls');
}
