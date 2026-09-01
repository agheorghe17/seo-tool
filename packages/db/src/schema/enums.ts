import { pgEnum } from 'drizzle-orm/pg-core';

export const planEnum = pgEnum('plan', ['free', 'pro']);
export const connectionTypeEnum = pgEnum('connection_type', ['wordpress', 'universal']);
export const verificationMethodEnum = pgEnum('verification_method', [
  'meta_tag',
  'html_file',
  'dns_txt',
]);
export const crawlStatusEnum = pgEnum('crawl_status', [
  'queued',
  'running',
  'completed',
  'failed',
  'partial',
]);
export const renderedWithEnum = pgEnum('rendered_with', ['static', 'playwright']);
export const indexabilityEnum = pgEnum('indexability', ['indexable', 'noindex', 'blocked']);
export const scoreCategoryEnum = pgEnum('score_category', [
  'technical',
  'cwv',
  'onpage',
  'content',
  'geo',
]);
export const severityEnum = pgEnum('severity', ['critical', 'warning', 'info']);
export const secretKindEnum = pgEnum('secret_kind', [
  'wp_app_password',
  'gsc_refresh_token',
  'ga4_refresh_token',
  'gbp_refresh_token',
]);
export const llmProviderEnum = pgEnum('llm_provider', ['anthropic', 'ollama', 'none']);
export const keywordSourceEnum = pgEnum('keyword_source', ['gsc', 'dataforseo']);
export const baselineSourceEnum = pgEnum('baseline_source', ['gsc', 'keyword_model']);
export const confidenceLevelEnum = pgEnum('confidence_level', ['low', 'medium', 'high']);

// --- Strategy module (Epics 13-19) ---
export const keywordIntentEnum = pgEnum('keyword_intent', [
  'informational',
  'commercial',
  'transactional',
  'navigational',
  'local',
  'unknown',
]);
export const keywordBucketEnum = pgEnum('keyword_bucket', [
  'quick_win',
  'build_content',
  'long_game',
  'tracked',
  'none',
]);
export const expansionSourceEnum = pgEnum('expansion_source', [
  'seed',
  'autocomplete',
  'keyword_planner',
  'gsc',
  'serp',
]);
export const rankSourceEnum = pgEnum('rank_source', ['gsc', 'serp']);
export const competitorAddedByEnum = pgEnum('competitor_added_by', ['user', 'auto']);
export const roadmapStatusEnum = pgEnum('roadmap_status', ['todo', 'doing', 'done', 'skipped']);

// --- Autopilot (Epic 21) ---
export const contentStatusEnum = pgEnum('content_status', [
  'idea',
  'prompt_ready',
  'review',
  'published',
  'discarded',
]);

// --- Page blueprints (Epic 22) ---
export const blueprintStatusEnum = pgEnum('blueprint_status', [
  'draft',
  'approved',
  'applied',
  'dismissed',
]);

// --- Results engine (Epic 23) ---
export const interventionKindEnum = pgEnum('intervention_kind', [
  'blueprint',
  'recommendation',
  'content',
  'roadmap',
  'internal_link',
  'manual',
]);
export const interventionOutcomeEnum = pgEnum('intervention_outcome', [
  'pending',
  'gain',
  'loss',
  'flat',
  'inconclusive',
]);
