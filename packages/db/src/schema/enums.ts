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
export const secretKindEnum = pgEnum('secret_kind', ['wp_app_password', 'gsc_refresh_token']);
export const llmProviderEnum = pgEnum('llm_provider', ['anthropic', 'ollama', 'none']);
