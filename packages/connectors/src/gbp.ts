/**
 * Epic 21 — Google Business Profile (local SEO). SCAFFOLD ONLY.
 *
 * The GBP APIs require a separate access request + approval from Google
 * (https://developers.google.com/my-business/content/prereqs). Until that is granted
 * and `FEATURE_GBP=on`, every function here no-ops. The OAuth wiring and shapes are
 * ready so the feature can be switched on without a rewrite.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ACCOUNT_ENDPOINT = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const INFO_ENDPOINT = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const PERF_ENDPOINT = 'https://businessprofileperformance.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/business.manage';

export function gbpEnabled(): boolean {
  return (process.env.FEATURE_GBP ?? 'off').toLowerCase() === 'on';
}

interface GbpOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function config(): GbpOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_GBP_REDIRECT_URI ??
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace(/\/gsc\/callback$/, '/gbp/callback');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / _SECRET / _(GBP_)REDIRECT_URI are not set');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string): { authUrl: string } {
  const cfg = config();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return { authUrl: `${AUTH_ENDPOINT}?${params.toString()}` };
}

export interface GbpTokens {
  refreshToken: string;
  accessToken: string;
}

export async function exchangeCode(code: string, deps: { fetchImpl?: typeof fetch } = {}): Promise<GbpTokens> {
  const cfg = config();
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`gbp token exchange failed: ${res.status}`);
  const json = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!json.refresh_token || !json.access_token) throw new Error('gbp token response incomplete');
  return { refreshToken: json.refresh_token, accessToken: json.access_token };
}

export async function refreshAccessToken(refreshToken: string, deps: { fetchImpl?: typeof fetch } = {}): Promise<string> {
  const cfg = config();
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`gbp token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('gbp refresh response missing access_token');
  return json.access_token;
}

export interface GbpLocation {
  name: string; // "locations/123"
  title: string;
}

export async function listLocations(
  accessToken: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<GbpLocation[]> {
  if (!gbpEnabled()) return [];
  const doFetch = deps.fetchImpl ?? fetch;
  const acc = await doFetch(`${ACCOUNT_ENDPOINT}/accounts`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!acc.ok) return [];
  const accJson = (await acc.json()) as { accounts?: { name?: string }[] };
  const first = accJson.accounts?.[0]?.name;
  if (!first) return [];
  const res = await doFetch(
    `${INFO_ENDPOINT}/${first}/locations?readMask=name,title&pageSize=100`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { locations?: { name?: string; title?: string }[] };
  return (json.locations ?? [])
    .filter((l): l is { name: string; title?: string } => !!l.name)
    .map((l) => ({ name: l.name, title: l.title ?? l.name }));
}

export interface GbpPerformance {
  calls: number;
  websiteClicks: number;
  directionRequests: number;
  searchViews: number;
}

export async function fetchPerformance(
  accessToken: string,
  location: string,
  days = 30,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<GbpPerformance | null> {
  if (!gbpEnabled()) return null;
  const doFetch = deps.fetchImpl ?? fetch;
  const end = new Date();
  const start = new Date(Date.now() - days * 86_400_000);
  const metrics = [
    'CALL_CLICKS',
    'WEBSITE_CLICKS',
    'BUSINESS_DIRECTION_REQUESTS',
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  ];
  const qs = new URLSearchParams();
  for (const m of metrics) qs.append('dailyMetrics', m);
  qs.set('dailyRange.start_date.year', String(start.getUTCFullYear()));
  qs.set('dailyRange.start_date.month', String(start.getUTCMonth() + 1));
  qs.set('dailyRange.start_date.day', String(start.getUTCDate()));
  qs.set('dailyRange.end_date.year', String(end.getUTCFullYear()));
  qs.set('dailyRange.end_date.month', String(end.getUTCMonth() + 1));
  qs.set('dailyRange.end_date.day', String(end.getUTCDate()));
  const res = await doFetch(`${PERF_ENDPOINT}/${location}:fetchMultiDailyMetricsTimeSeries?${qs.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    multiDailyMetricTimeSeries?: {
      dailyMetricTimeSeries?: {
        dailyMetric?: string;
        timeSeries?: { datedValues?: { value?: string }[] };
      }[];
    }[];
  };
  const sum = (metric: string) => {
    let total = 0;
    for (const outer of json.multiDailyMetricTimeSeries ?? []) {
      for (const s of outer.dailyMetricTimeSeries ?? []) {
        if (s.dailyMetric === metric) {
          for (const d of s.timeSeries?.datedValues ?? []) total += Number(d.value ?? 0);
        }
      }
    }
    return total;
  };
  return {
    calls: sum('CALL_CLICKS'),
    websiteClicks: sum('WEBSITE_CLICKS'),
    directionRequests: sum('BUSINESS_DIRECTION_REQUESTS'),
    searchViews:
      sum('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH') + sum('BUSINESS_IMPRESSIONS_MOBILE_SEARCH'),
  };
}
