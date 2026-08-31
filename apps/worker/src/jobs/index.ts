import type PgBoss from 'pg-boss';
import { logger } from '../logger.js';
import { handleCrawl } from './crawl.js';
import { handleEnrich } from './enrich.js';
import { handleRender } from './render.js';
import { handleScore } from './score.js';
import type { JobPayloads } from './types.js';

/**
 * Epic 9 fills these in. Each handler does its unit of work then enqueues the next
 * stage of the pipeline: crawl → enrich → score → recommend → estimate.
 * `render` is a fan-out sub-job of `crawl`; `wp-apply` is triggered from the API.
 */

type Handler<K extends keyof JobPayloads> = (
  job: PgBoss.Job<JobPayloads[K]>,
  boss: PgBoss,
) => Promise<void>;

const notImplemented =
  <K extends keyof JobPayloads>(name: K): Handler<K> =>
  async (job) => {
    logger.warn({ jobId: job.id, name }, `handler "${name}" not implemented yet`);
  };

export const handlers: { [K in keyof JobPayloads]: Handler<K> } = {
  crawl: handleCrawl,
  render: (job) => handleRender(job),
  enrich: handleEnrich,
  score: handleScore,
  recommend: notImplemented('recommend'),
  estimate: notImplemented('estimate'),
  'wp-apply': notImplemented('wp-apply'),
};

/** Per-job-type concurrency (Epic 9.1). Render is heaviest → keep it low. */
export const concurrency: Record<keyof JobPayloads, number> = {
  crawl: 2,
  render: 1,
  enrich: 4,
  score: 4,
  recommend: 2,
  estimate: 2,
  'wp-apply': 2,
};
