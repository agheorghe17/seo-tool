import type { LlmProvider } from './types.js';

/** Epic 10.5 — one place to read feature flags / limits. Env-driven, no redeploy of code. */
export interface Flags {
  dataForSeo: boolean;
  billing: boolean;
  renderEnabled: boolean;
  llmProvider: LlmProvider;
  crawlMaxPages: number;
  crawlRequestsPerSecond: number;
}

function llm(): LlmProvider {
  const v = process.env.LLM_PROVIDER;
  return v === 'anthropic' || v === 'ollama' ? v : 'none';
}

export function readFlags(env: NodeJS.ProcessEnv = process.env): Flags {
  return {
    dataForSeo: env.FEATURE_DATAFORSEO === 'on',
    billing: env.FEATURE_BILLING === 'on',
    renderEnabled: env.RENDER_ENABLED === '1',
    llmProvider: llm(),
    crawlMaxPages: Number(env.CRAWL_MAX_PAGES ?? 2000),
    crawlRequestsPerSecond: Number(env.CRAWL_REQUESTS_PER_SECOND ?? 2),
  };
}
