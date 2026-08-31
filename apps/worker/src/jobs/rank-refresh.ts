import type PgBoss from 'pg-boss';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db, keywordData, rankSnapshots } from 'db';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import { siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

/**
 * Epic 19.1 — weekly refresh: re-import GSC, re-fetch SERP (if enabled), re-score,
 * then log the notable position moves (up/down) since the previous snapshot.
 */
export async function handleRankRefresh(job: PgBoss.Job<SiteJob>, boss: PgBoss): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  await sendNext(boss, 'rank-import', { siteId });
  await sendNext(boss, 'serp-fetch', { siteId });
  await sendNext(boss, 'strategy-build', { siteId, full: false });

  // Report moves from the two most recent weekly buckets.
  const weekAgo = new Date(Date.now() - 8 * 86_400_000);
  const twoWeeks = new Date(Date.now() - 15 * 86_400_000);

  const kws = await db
    .select({ id: keywordData.id, keyword: keywordData.keyword })
    .from(keywordData)
    .where(and(eq(keywordData.siteId, siteId), eq(keywordData.bucket, 'quick_win')));

  const moves: string[] = [];
  for (const kw of kws) {
    const [now] = await db
      .select({ p: rankSnapshots.position, at: rankSnapshots.capturedAt })
      .from(rankSnapshots)
      .where(and(eq(rankSnapshots.keywordId, kw.id), gte(rankSnapshots.capturedAt, weekAgo)))
      .orderBy(desc(rankSnapshots.capturedAt))
      .limit(1);
    const [prev] = await db
      .select({ p: rankSnapshots.position })
      .from(rankSnapshots)
      .where(
        and(
          eq(rankSnapshots.keywordId, kw.id),
          lt(rankSnapshots.capturedAt, weekAgo),
          gte(rankSnapshots.capturedAt, twoWeeks),
        ),
      )
      .orderBy(desc(rankSnapshots.capturedAt))
      .limit(1);
    if (now?.p != null && prev?.p != null && Math.abs(now.p - prev.p) >= 2) {
      const dir = now.p < prev.p ? 'urcat' : 'coborât';
      moves.push(`„${kw.keyword}": ${dir} de la #${Math.round(prev.p)} la #${Math.round(now.p)}`);
    }
  }

  logger.info({ siteId, moves }, 'rank-refresh done');
}
