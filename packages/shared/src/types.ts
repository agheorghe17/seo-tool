/**
 * Domain types — single source of truth, consumed by web / api / worker / packages.
 * Keep in sync with the Drizzle schema in `packages/db/src/schema`.
 */

export const CONNECTION_TYPES = ['wordpress', 'universal'] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const VERIFICATION_METHODS = ['meta_tag', 'html_file', 'dns_txt'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const CRAWL_STATUSES = ['queued', 'running', 'completed', 'failed', 'partial'] as const;
export type CrawlStatus = (typeof CRAWL_STATUSES)[number];

export const RENDERED_WITH = ['static', 'playwright'] as const;
export type RenderedWith = (typeof RENDERED_WITH)[number];

export const INDEXABILITY = ['indexable', 'noindex', 'blocked'] as const;
export type Indexability = (typeof INDEXABILITY)[number];

export const SCORE_CATEGORIES = ['technical', 'cwv', 'onpage', 'content', 'geo'] as const;
export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export const SEVERITIES = ['critical', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const LLM_PROVIDERS = ['anthropic', 'ollama', 'none'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const JOB_TYPES = [
  'crawl',
  'render',
  'enrich',
  'score',
  'recommend',
  'estimate',
  'wp-apply',
  // Strategy module (Epics 13-19)
  'profile-extract',
  'keyword-research',
  'rank-import',
  'competitor-crawl',
  'serp-fetch',
  'strategy-build',
  'rank-refresh',
  'strategy-weekly',
  'page-plan',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export interface User {
  id: string;
  email: string;
  plan: 'free' | 'pro';
  quotaPagesMonth: number;
  quotaUsed: number;
  createdAt: string;
}

export interface Site {
  id: string;
  userId: string;
  domain: string;
  connectionType: ConnectionType;
  wpSiteUrl: string | null;
  verificationMethod: VerificationMethod | null;
  verificationToken: string;
  verifiedAt: string | null;
  gscConnected: boolean;
  gscProperty: string | null;
  createdAt: string;
}

export interface Crawl {
  id: string;
  siteId: string;
  status: CrawlStatus;
  pagesTotal: number;
  pagesScanned: number;
  pagesRendered: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface HeadingNode {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
}

export interface PageImage {
  src: string;
  alt: string | null;
}

/** Raw + derived data for a single crawled page. Input to the scoring engine. */
export interface PageData {
  url: string;
  statusCode: number;
  redirectChain: string[];
  indexability: Indexability;
  renderedWith: RenderedWith;
  contentHash: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: HeadingNode[];
  wordCount: number;
  canonicalUrl: string | null;
  schemaTypes: string[];
  images: PageImage[];
  internalLinksCount: number;
  externalLinksCount: number;
  lcpMs: number | null;
  inpMs: number | null;
  clsScore: number | null;
  mobileFriendly: boolean | null;
}

export interface CategoryScores {
  technical: number;
  cwv: number;
  onpage: number;
  content: number;
  geo: number;
  total: number;
}

export interface Issue {
  ruleId: string;
  ruleVersion: number;
  category: ScoreCategory;
  severity: Severity;
  description: string;
  detectedValue: string | null;
  siteLevel: boolean;
}

export interface Recommendation {
  id: string;
  issueId: string;
  fixTitle: string;
  fixDescriptionAiGenerated: string | null;
  llmProvider: LlmProvider | null;
  impactScore: number;
  effortScore: number;
  priorityRank: number;
  autoFixable: boolean;
  applied: boolean;
  appliedAt: string | null;
}

export interface TrafficEstimate {
  id: string;
  siteId: string;
  generatedAt: string;
  baselineMonthlyVisits: number;
  baselineSource: 'gsc' | 'keyword_model';
  /** Always an interval — never a single "guaranteed" number. */
  estimateLow: number;
  estimateMid: number;
  estimateHigh: number;
  horizonMonths: number;
  assumptions: string[];
  confidenceLevel: ConfidenceLevel;
}
