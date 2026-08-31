import type { SerpProvider } from './types.js';

/**
 * Stub adapters — same contract as `dataforseoSerp`, ready to fill in.
 * SerpApi:  https://serpapi.com/search  (api_key, engine=google)
 * ScaleSERP / SearchAPI.io: https://api.scaleserp.com/search
 * ValueSERP: https://api.valueserp.com/search
 */
function makeStub(name: string, envKey: string): SerpProvider {
  return {
    name,
    available: () => Boolean(process.env[envKey]),
    async search() {
      throw new Error(`${name} SERP adapter not implemented — Epic 13.4`);
    },
  };
}

export const serpapi = makeStub('serpapi', 'SERP_API_KEY');
export const scaleserp = makeStub('scaleserp', 'SERP_API_KEY');
export const valueserp = makeStub('valueserp', 'SERP_API_KEY');
