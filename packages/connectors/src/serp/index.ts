import { dataforseoSerp } from './dataforseo.js';
import { scaleserp, serpapi, valueserp } from './stubs.js';
import type { SerpProvider } from './types.js';

export * from './types.js';
export { dataforseoSerp } from './dataforseo.js';

const noopProvider: SerpProvider = {
  name: 'none',
  available: () => false,
  async search() {
    return null;
  },
};

const PROVIDERS: Record<string, SerpProvider> = {
  none: noopProvider,
  dataforseo: dataforseoSerp,
  serpapi,
  scaleserp,
  valueserp,
};

/** Resolve the configured SERP provider (`SERP_PROVIDER` env). Defaults to a no-op. */
export function getSerpProvider(): SerpProvider {
  const name = (process.env.SERP_PROVIDER ?? 'none').toLowerCase();
  return PROVIDERS[name] ?? noopProvider;
}

export function serpEnabled(): boolean {
  const p = getSerpProvider();
  return p.name !== 'none' && p.available();
}
