import PgBoss from 'pg-boss';
import { JOB_TYPES } from 'shared';
import { logger } from './logger.js';
import { concurrency, handlers } from './jobs/index.js';
import type { JobPayloads } from './jobs/types.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  logger.error('DATABASE_URL is not set');
  process.exit(1);
}

const boss = new PgBoss({ connectionString });
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));

async function main(): Promise<void> {
  await boss.start();
  logger.info('worker started, registering handlers');

  for (const type of JOB_TYPES) {
    const key = type as keyof JobPayloads;
    await boss.work<JobPayloads[typeof key]>(
      type,
      { batchSize: concurrency[key] },
      async ([job]) => {
        if (!job) return;
        const started = Date.now();
        try {
          await handlers[key](job as never, boss);
          logger.debug({ type, jobId: job.id, ms: Date.now() - started }, 'job done');
        } catch (err) {
          logger.error({ err, type, jobId: job.id }, 'job failed');
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
