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

export interface JobPayloads {
  crawl: CrawlJob;
  render: RenderJob;
  enrich: EnrichJob;
  score: ScoreJob;
  recommend: RecommendJob;
  estimate: EstimateJob;
  'wp-apply': WpApplyJob;
}

export type { JobType };
