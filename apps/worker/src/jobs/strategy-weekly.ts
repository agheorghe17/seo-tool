import type PgBoss from 'pg-boss';
import { and, eq, isNotNull } from 'drizzle-orm';
import { businessProfiles, db, sites } from 'db';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';

/**
 * Epic 19.2 — scheduled fan-out. pg-boss fires this once per `RANK_REFRESH_CRON`; it enqueues a
 * per-site `rank-refresh` for every site with a confirmed strategy profile.
 */
export async function handleStrategyWeekly(_job: PgBoss.Job, boss: PgBoss): Promise<void> {
  const rows = await db
    .select({ siteId: sites.id })
    .from(sites)
    .innerJoin(businessProfiles, eq(businessProfiles.siteId, sites.id))
    .where(and(isNotNull(businessProfiles.confirmedAt)));

  for (const r of rows) await sendNext(boss, 'rank-refresh', { siteId: r.siteId });
  logger.info({ sites: rows.length }, 'strategy-weekly fan-out');
}
