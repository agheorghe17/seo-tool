import { describe, expect, it } from 'vitest';
import { buildAuthUrl, exchangeCode, fetchSearchAnalytics, totalClicks } from './gsc.js';

const cfg = {
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://app.tld/api/sites/gsc/callback',
};

describe('buildAuthUrl', () => {
  it('includes offline access, consent prompt and the readonly scope', () => {
    const { authUrl } = buildAuthUrl('state123', cfg);
    const u = new URL(authUrl);
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('scope')).toContain('webmasters.readonly');
    expect(u.searchParams.get('state')).toBe('state123');
  });
});

describe('exchangeCode', () => {
  it('returns tokens on success', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ refresh_token: 'r', access_token: 'a', expires_in: 3599 }),
        { status: 200 },
      )) as typeof fetch;
    const tokens = await exchangeCode('code', { fetchImpl, cfg });
    expect(tokens).toEqual({ refreshToken: 'r', accessToken: 'a', expiresIn: 3599 });
  });

  it('throws when the refresh token is missing (needs re-consent)', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ access_token: 'a' }), { status: 200 })) as typeof fetch;
    await expect(exchangeCode('code', { fetchImpl, cfg })).rejects.toThrow(/re-consent/);
  });
});

describe('fetchSearchAnalytics', () => {
  it('parses rows and sums clicks', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          rows: [
            { keys: ['/a'], clicks: 120, impressions: 3000, ctr: 0.04, position: 8.2 },
            { keys: ['/b'], clicks: 30, impressions: 900, ctr: 0.033, position: 14.1 },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const rows = await fetchSearchAnalytics('atoken', {
      property: 'sc-domain:example.com',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    }, { fetchImpl });
    expect(rows).toHaveLength(2);
    expect(totalClicks(rows)).toBe(150);
  });
});
