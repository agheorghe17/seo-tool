import type PgBoss from 'pg-boss';
import { eq } from 'drizzle-orm';
import { crawls, db, pages } from 'db';
import { fetchCrux, fetchPageSpeed, mergeCwv, withCache } from 'connectors';
import { logger } from '../logger.js';
import { getCacheStore } from '../redis.js';
import { runPool } from './pool.js';
import type { EnrichJob } from './types.js';

const CWV_TTL = Number(process.env.CWV_CACHE_TTL_SECONDS ?? 60 * 60 * 48);
const CONCURRENCY = Number(process.env.ENRICH_CONCURRENCY ?? 4);

export async function handleEnrich(job: PgBoss.Job<EnrichJob>, boss: PgBoss): Promise<void> {
  const { crawlId } = job.data;
  const apiKey = process.env.PAGESPEED_API_KEY;
  const store = await getCacheStore();

  const rows = await db
    .select({ id: pages.id, url: pages.url })
    .from(pages)
    .where(eq(pages.crawlId, crawlId));

  await runPool(rows, CONCURRENCY, async (row) => {
    const [psiMobile, psiDesktop, crux] = await Promise.all([
      withCache(store, `psi:m:${row.url}`, CWV_TTL, () =>
        fetchPageSpeed(row.url, 'mobile', { apiKey }),
      ),
      withCache(store, `psi:d:${row.url}`, CWV_TTL, () =>
        fetchPageSpeed(row.url, 'desktop', { apiKey }),
      ),
      withCache(store, `crux:${row.url}`, CWV_TTL, () =>
        fetchCrux(row.url, { apiKey, formFactor: 'PHONE' }),
      ),
    ]);

    const cwv = mergeCwv(crux, psiMobile, psiDesktop);
    await db
      .update(pages)
      .set({
        lcpMs: cwv.lcpMs != null ? Math.round(cwv.lcpMs) : null,
        inpMs: cwv.inpMs != null ? Math.round(cwv.inpMs) : null,
        clsScore: cwv.clsScore,
        mobileFriendly: cwv.mobileFriendly,
      })
      .where(eq(pages.id, row.id));
  });

  logger.info({ crawlId, pages: rows.length }, 'enrich finished');
  await boss.send('score', { crawlId });
  await db.update(crawls).set({ status: 'running' }).where(eq(crawls.id, crawlId));
}
