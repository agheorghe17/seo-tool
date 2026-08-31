import type PgBoss from 'pg-boss';
import { logger } from '../logger.js';
import { handleCrawl } from './crawl.js';
import { handleEnrich } from './enrich.js';
import { handleEstimate } from './estimate.js';
import { handleRecommend } from './recommend.js';
import { handleRender } from './render.js';
import { handleScore } from './score.js';
import { handleProfileExtract } from './profile-extract.js';
import { handleKeywordResearch } from './keyword-research.js';
import { handleRankImport } from './rank-import.js';
import { handleCompetitorCrawl } from './competitor-crawl.js';
import { handleSerpFetch } from './serp-fetch.js';
import { handleStrategyBuild } from './strategy-build.js';
import { handleRankRefresh } from './rank-refresh.js';
import { handleStrategyWeekly } from './strategy-weekly.js';
import type { JobPayloads } from './types.js';

/**
 * Audit pipeline:    crawl → enrich → score → recommend → estimate  (+ render fan-out, wp-apply)
 * Strategy pipeline: profile-extract → keyword-research → rank-import → competitor-crawl* → strategy-build
 *                    rank-refresh (weekly) re-runs rank-import + serp-fetch + strategy-build(rescore)
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
  recommend: handleRecommend,
  estimate: (job) => handleEstimate(job),
  'wp-apply': notImplemented('wp-apply'),
  'profile-extract': (job, boss) => handleProfileExtract(job, boss),
  'keyword-research': handleKeywordResearch,
  'rank-import': handleRankImport,
  'competitor-crawl': handleCompetitorCrawl,
  'serp-fetch': (job) => handleSerpFetch(job),
  'strategy-build': (job) => handleStrategyBuild(job),
  'rank-refresh': handleRankRefresh,
  'strategy-weekly': (job, boss) => handleStrategyWeekly(job, boss),
};

/** Per-job-type concurrency (Epic 9.1). Crawls / render are heaviest → keep low. */
export const concurrency: Record<keyof JobPayloads, number> = {
  crawl: 2,
  render: 1,
  enrich: 4,
  score: 4,
  recommend: 2,
  estimate: 2,
  'wp-apply': 2,
  'profile-extract': 2,
  'keyword-research': 1,
  'rank-import': 2,
  'competitor-crawl': 1,
  'serp-fetch': 1,
  'strategy-build': 2,
  'rank-refresh': 1,
  'strategy-weekly': 1,
};
