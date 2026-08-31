import { hostname, type SerpProvider, type SerpQuery, type SerpResult } from './types.js';

/**
 * DataForSEO SERP API — Google organic, live/advanced.
 * Auth: HTTP Basic (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).
 * Cost: fractions of a cent per SERP. Only called for `bucket = tracked` keywords.
 */
const ENDPOINT = 'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';

interface DfsResponse {
  tasks?: Array<{
    result?: Array<{
      items?: Array<{
        type?: string;
        rank_absolute?: number;
        domain?: string;
        url?: string;
        title?: string;
      }>;
    }>;
  }>;
}

export const dataforseoSerp: SerpProvider = {
  name: 'dataforseo',
  available() {
    return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  },
  async search(query: SerpQuery, fetchImpl: typeof fetch = fetch): Promise<SerpResult | null> {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) return null;

    const gl = query.gl ?? 'ro';
    const hl = query.hl ?? 'ro';
    const auth = Buffer.from(`${login}:${password}`).toString('base64');

    try {
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          {
            keyword: query.keyword,
            location_code: gl === 'ro' ? 2642 : undefined,
            language_code: hl,
            device: query.device ?? 'desktop',
            depth: 20,
          },
        ]),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as DfsResponse;
      const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
      const organic = items
        .filter((i) => i.type === 'organic' && i.url)
        .map((i, idx) => ({
          position: i.rank_absolute ?? idx + 1,
          domain: i.domain ? i.domain.replace(/^www\./, '') : hostname(i.url!),
          url: i.url!,
          title: i.title,
        }));
      const related = items
        .filter((i) => i.type === 'related_searches' || i.type === 'people_also_ask')
        .flatMap((i) => (i.title ? [i.title] : []));

      return {
        keyword: query.keyword,
        gl,
        hl,
        fetchedAt: new Date().toISOString(),
        items: organic,
        relatedQueries: [...new Set(related)],
      };
    } catch {
      return null;
    }
  },
};
