import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSerpProvider, serpEnabled } from './index.js';
import { dataforseoSerp } from './dataforseo.js';

const OLD = { ...process.env };
afterEach(() => {
  process.env = { ...OLD };
});

describe('getSerpProvider', () => {
  it('defaults to a no-op provider', async () => {
    delete process.env.SERP_PROVIDER;
    const p = getSerpProvider();
    expect(p.name).toBe('none');
    expect(p.available()).toBe(false);
    expect(await p.search({ keyword: 'x' })).toBeNull();
    expect(serpEnabled()).toBe(false);
  });

  it('selects dataforseo when configured', () => {
    process.env.SERP_PROVIDER = 'dataforseo';
    process.env.DATAFORSEO_LOGIN = 'u';
    process.env.DATAFORSEO_PASSWORD = 'p';
    expect(getSerpProvider().name).toBe('dataforseo');
    expect(serpEnabled()).toBe(true);
  });
});

describe('dataforseoSerp.search', () => {
  it('parses organic items and related queries', async () => {
    process.env.DATAFORSEO_LOGIN = 'u';
    process.env.DATAFORSEO_PASSWORD = 'p';
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          tasks: [
            {
              result: [
                {
                  items: [
                    { type: 'organic', rank_absolute: 1, domain: 'www.a.ro', url: 'https://www.a.ro/x', title: 'A' },
                    { type: 'organic', rank_absolute: 2, domain: 'b.ro', url: 'https://b.ro/y', title: 'B' },
                    { type: 'people_also_ask', title: 'ce este ppc' },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const r = await dataforseoSerp.search({ keyword: 'agentie ppc' }, fetchImpl);
    expect(r?.items).toEqual([
      { position: 1, domain: 'a.ro', url: 'https://www.a.ro/x', title: 'A' },
      { position: 2, domain: 'b.ro', url: 'https://b.ro/y', title: 'B' },
    ]);
    expect(r?.relatedQueries).toEqual(['ce este ppc']);
  });
});
