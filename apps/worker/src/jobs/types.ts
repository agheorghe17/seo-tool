import type { JobType } from 'shared';

export interface CrawlJob {
  crawlId: string;
  siteId: string;
}
export interface RenderJob {
  crawlId: string;
  pageId: string;
  url: string;
}
export interface EnrichJob {
  crawlId: string;
}
export interface ScoreJob {
  crawlId: string;
}
export interface RecommendJob {
  crawlId: string;
}
export interface EstimateJob {
  siteId: string;
  crawlId: string;
}
export interface WpApplyJob {
  recommendationId: string;
}

// --- Strategy module (Epics 13-19) ---
export interface SiteJob {
  siteId: string;
}
export interface ProfileExtractJob {
  siteId: string;
  crawlId?: string;
}
export interface CompetitorCrawlJob {
  siteId: string;
  competitorId: string;
}
export interface StrategyBuildJob {
  siteId: string;
  /** true = also (re)build LLM playbooks + roadmap; false = just re-score. */
  full?: boolean;
}

export interface JobPayloads {
  crawl: CrawlJob;
  render: RenderJob;
  enrich: EnrichJob;
  score: ScoreJob;
  recommend: RecommendJob;
  estimate: EstimateJob;
  'wp-apply': WpApplyJob;
  'profile-extract': ProfileExtractJob;
  'keyword-research': SiteJob;
  'rank-import': SiteJob;
  'competitor-crawl': CompetitorCrawlJob;
  'serp-fetch': SiteJob;
  'strategy-build': StrategyBuildJob;
  'rank-refresh': SiteJob;
}

export type { JobType };
