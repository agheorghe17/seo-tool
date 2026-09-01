import type PgBoss from 'pg-boss';
import { and, desc, eq, lt } from 'drizzle-orm';
import {
  db,
  impactCalibration,
  interventions,
  keywordData,
  rankSnapshots,
} from 'db';
import type { ScoreCategory } from 'shared';
import { logger } from '../logger.js';
import { siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

const MEASURE_AFTER_DAYS = 14;
const CATEGORIES: ScoreCategory[] = ['technical', 'cwv', 'onpage', 'content', 'geo'];
const OUTCOME_WEIGHT: Record<string, number> = { gain: 1.2, flat: 1.0, loss: 0.7, inconclusive: 1.0 };

/**
 * Epic 23 — measure interventions that are old enough, then roll the observed effect
 * into `impact_calibration` so the estimator learns this site's real response.
 */
export async function handleInterventionCheck(job: PgBoss.Job<SiteJob>): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const cutoff = new Date(Date.now() - MEASURE_AFTER_DAYS * 86_400_000);
  const pending = await db
    .select()
    .from(interventions)
    .where(and(eq(interventions.siteId, siteId), eq(interventions.outcome, 'pending'), lt(interventions.appliedAt, cutoff)));

  if (pending.length === 0) {
    logger.info({ siteId }, 'intervention-check: nothing due');
    return;
  }

  const calibHits: Record<string, number[]> = {};

  for (const iv of pending) {
    let afterPos: number | null = null;
    let afterClicks: number | null = null;

    if (iv.targetKeywordId) {
      const [snap] = await db
        .select({ position: rankSnapshots.position, clicks: rankSnapshots.clicks })
        .from(rankSnapshots)
        .where(eq(rankSnapshots.keywordId, iv.targetKeywordId))
        .orderBy(desc(rankSnapshots.capturedAt))
        .limit(1);
      afterPos = snap?.position ?? null;
      afterClicks = snap?.clicks ?? null;
      if (afterPos == null) {
        const [kw] = await db
          .select({ p: keywordData.currentPosition })
          .from(keywordData)
          .where(eq(keywordData.id, iv.targetKeywordId));
        afterPos = kw?.p ?? null;
      }
    }

    const beforePos = iv.before?.position ?? null;
    const beforeClicks = iv.before?.clicks ?? null;
    const deltaPosition = beforePos != null && afterPos != null ? beforePos - afterPos : null; // + = improved
    const deltaClicks = beforeClicks != null && afterClicks != null ? afterClicks - beforeClicks : null;

    let outcome: 'gain' | 'loss' | 'flat' | 'inconclusive';
    if (deltaPosition == null && deltaClicks == null) {
      outcome = 'inconclusive';
    } else if ((deltaPosition ?? 0) >= 2 || (deltaClicks ?? 0) >= Math.max(3, (beforeClicks ?? 0) * 0.2)) {
      outcome = 'gain';
    } else if ((deltaPosition ?? 0) <= -2 || (deltaClicks ?? 0) <= -Math.max(3, (beforeClicks ?? 0) * 0.2)) {
      outcome = 'loss';
    } else {
      outcome = 'flat';
    }

    await db
      .update(interventions)
      .set({
        outcome,
        measuredAt: new Date(),
        after: { position: afterPos, clicks: afterClicks, impressions: null },
        deltaPosition,
        deltaClicks,
      })
      .where(eq(interventions.id, iv.id));

    const cat = normaliseCategory(iv.category);
    if (cat && outcome !== 'inconclusive') {
      (calibHits[cat] ??= []).push(OUTCOME_WEIGHT[outcome] ?? 1);
    }
  }

  // Roll observed weights into impact_calibration (bounded 0.5..1.5, applied at sampleN>=5).
  for (const [cat, weights] of Object.entries(calibHits)) {
    const [existing] = await db
      .select()
      .from(impactCalibration)
      .where(and(eq(impactCalibration.siteId, siteId), eq(impactCalibration.category, cat as never)));
    const prevN = existing?.sampleN ?? 0;
    const prevMul = existing?.observedMultiplier ?? 1;
    const newN = prevN + weights.length;
    const batchAvg = weights.reduce((s, w) => s + w, 0) / weights.length;
    const blended = (prevMul * prevN + batchAvg * weights.length) / newN;
    const bounded = Math.max(0.5, Math.min(1.5, blended));
    await db
      .insert(impactCalibration)
      .values({ siteId, category: cat as never, observedMultiplier: bounded, sampleN: newN })
      .onConflictDoUpdate({
        target: [impactCalibration.siteId, impactCalibration.category],
        set: { observedMultiplier: bounded, sampleN: newN, updatedAt: new Date() },
      });
  }

  logger.info({ siteId, measured: pending.length, calibrated: Object.keys(calibHits) }, 'intervention-check done');
}

function normaliseCategory(raw: string | null): ScoreCategory | null {
  if (!raw) return null;
  const lc = raw.toLowerCase();
  for (const c of CATEGORIES) if (lc === c || lc.startsWith(`${c}.`)) return c;
  if (lc === 'blueprint' || lc === 'keyword') return 'onpage';
  return null;
}
