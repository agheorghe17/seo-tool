import PgBoss from 'pg-boss';
import { lt, sql } from 'drizzle-orm';
import { crawls, db, jobRuns } from 'db';
import { JOB_TYPES } from 'shared';
import { captureError, logger } from './logger.js';
import { concurrency, handlers } from './jobs/index.js';
import type { JobPayloads } from './jobs/types.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  logger.error('DATABASE_URL is not set');
  process.exit(1);
}

const boss = new PgBoss({ connectionString });
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));

/** Epic 9.6 — mark crawls that have been stuck for too long as failed. */
async function sweepStaleCrawls(): Promise<void> {
  try {
    const res = await db
      .update(crawls)
      .set({ status: 'failed', error: 'stale — worker restarted or job lost', completedAt: sql`now()` })
      .where(
        sql`${crawls.status} in ('running','queued') and ${lt(crawls.createdAt, sql`now() - interval '3 hours'`)}`,
      )
      .returning({ id: crawls.id });
    if (res.length > 0) logger.warn({ count: res.length }, 'swept stale crawls');
  } catch (err) {
    logger.error({ err }, 'stale crawl sweep failed');
  }
}

async function recordRun<T>(
  type: string,
  crawlId: string | null,
  siteId: string | null,
  attempts: number,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const [run] = await db
    .insert(jobRuns)
    .values({ type, crawlId, siteId, status: 'running', attempts })
    .returning({ id: jobRuns.id });
  try {
    const out = await fn();
    await db
      .update(jobRuns)
      .set({ status: 'ok', durationMs: Date.now() - started, finishedAt: sql`now()` })
      .where(sql`${jobRuns.id} = ${run!.id}`);
    return out;
  } catch (err) {
    await db
      .update(jobRuns)
      .set({
        status: 'failed',
        error: String(err).slice(0, 2000),
        durationMs: Date.now() - started,
        finishedAt: sql`now()`,
      })
      .where(sql`${jobRuns.id} = ${run!.id}`);
    throw err;
  }
}

async function main(): Promise<void> {
  await boss.start();
  // pg-boss v10 requires queues to exist before work()/send(). Idempotent.
  for (const type of JOB_TYPES) {
    await boss.createQueue(type);
  }
  await sweepStaleCrawls();
  setInterval(() => void sweepStaleCrawls(), 60 * 60 * 1000).unref();

  // Epic 19.2 — weekly strategy refresh (fan-out). Idempotent.
  try {
    await boss.schedule('strategy-weekly', process.env.RANK_REFRESH_CRON ?? '0 6 * * 1');
  } catch (err) {
    logger.warn({ err }, 'could not register strategy-weekly schedule');
  }

  logger.info('worker started, registering handlers');

  for (const type of JOB_TYPES) {
    const key = type as keyof JobPayloads;
    await boss.work<JobPayloads[typeof key]>(
      type,
      { batchSize: concurrency[key] },
      async ([job]) => {
        if (!job) return;
        const data = (job.data ?? {}) as { crawlId?: string; siteId?: string };
        const crawlId = data && typeof data === 'object' && 'crawlId' in data ? String(data.crawlId ?? '') : null;
        const siteId = data && typeof data === 'object' && 'siteId' in data ? String(data.siteId ?? '') : null;
        const attempts = Number((job as { retryCount?: number }).retryCount ?? 0) + 1;
        try {
          await recordRun(type, crawlId || null, siteId || null, attempts, () =>
            handlers[key](job as never, boss),
          );
          logger.debug({ type, jobId: job.id }, 'job done');
        } catch (err) {
          logger.error({ err, type, jobId: job.id, attempts }, 'job failed');
          captureError(err, { type, jobId: job.id, crawlId });
          throw err; // let pg-boss retry with backoff
        }
      },
    );
    logger.info({ type, concurrency: concurrency[key] }, 'handler registered');
  }
}

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'shutting down worker');
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ err }, 'worker crashed on startup');
  process.exit(1);
});
