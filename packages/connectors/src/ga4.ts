/**
 * Epic 21 — Google Analytics 4 (Data API v1beta). Same OAuth client as GSC, different
 * scope + callback. Optional: a real organic-traffic baseline for the estimator and a
 * "real traffic" panel. Degrades gracefully — every function returns empty/null on failure.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DATA_ENDPOINT = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN_ENDPOINT = 'https://analyticsadmin.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export interface Ga4OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function config(): Ga4OAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_GA_REDIRECT_URI ??
    process.env.GOOGLE_OAUTH_REDIRECT_URI?.replace(/\/gsc\/callback$/, '/ga/callback');
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / _SECRET / _(GA_)REDIRECT_URI are not set');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string, cfg: Ga4OAuthConfig = config()): { authUrl: string } {
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

export interface Ga4Tokens {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
}

export async function exchangeCode(
  code: string,
  deps: { fetchImpl?: typeof fetch; cfg?: Ga4OAuthConfig } = {},
): Promise<Ga4Tokens> {
  const cfg = deps.cfg ?? config();
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
  if (!res.ok) throw new Error(`ga4 token exchange failed: ${res.status}`);
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (!json.refresh_token || !json.access_token) {
    throw new Error('ga4 token response missing refresh_token/access_token (re-consent required)');
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  deps: { fetchImpl?: typeof fetch; cfg?: Ga4OAuthConfig } = {},
): Promise<string> {
  const cfg = deps.cfg ?? config();
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
  if (!res.ok) throw new Error(`ga4 token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('ga4 refresh response missing access_token');
  return json.access_token;
}

export interface Ga4PropertySummary {
  property: string; // "properties/123456789"
  displayName: string;
  account: string;
}

/** List GA4 properties this token can read (via the Admin API accountSummaries). */
export async function listProperties(
  accessToken: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<Ga4PropertySummary[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(`${ADMIN_ENDPOINT}/accountSummaries?pageSize=200`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`ga4 accountSummaries failed: ${res.status}`);
  const json = (await res.json()) as {
    accountSummaries?: {
      account?: string;
      displayName?: string;
      propertySummaries?: { property?: string; displayName?: string }[];
    }[];
  };
  const out: Ga4PropertySummary[] = [];
  for (const a of json.accountSummaries ?? []) {
    for (const p of a.propertySummaries ?? []) {
      if (p.property) {
        out.push({
          property: p.property,
          displayName: p.displayName ?? p.property,
          account: a.displayName ?? a.account ?? '',
        });
      }
    }
  }
  return out;
}

/** Pick the GA4 property whose display name best matches the site domain, else the first. */
export function pickProperty(domain: string, list: Ga4PropertySummary[]): string | null {
  if (list.length === 0) return null;
  const host = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
  const match = list.find((p) => p.displayName.toLowerCase().includes(host));
  return (match ?? list[0])!.property;
}

export interface Ga4Totals {
  sessions: number;
  organicSessions: number;
  engagedSessions: number;
  conversions: number;
  startDate: string;
  endDate: string;
}

function propId(property: string): string {
  return property.replace(/^properties\//, '');
}

/** Aggregate totals for the last `days` days, plus organic-only sessions. */
export async function fetchTotals(
  accessToken: string,
  property: string,
  days = 90,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<Ga4Totals> {
  const doFetch = deps.fetchImpl ?? fetch;
  const startDate = `${days}daysAgo`;
  const endDate = 'yesterday';
  const res = await doFetch(`${DATA_ENDPOINT}/properties/${propId(property)}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'conversions' },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ga4 runReport failed: ${res.status}`);
  const json = (await res.json()) as {
    rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
  };
  let sessions = 0;
  let organicSessions = 0;
  let engagedSessions = 0;
  let conversions = 0;
  for (const r of json.rows ?? []) {
    const channel = (r.dimensionValues?.[0]?.value ?? '').toLowerCase();
    const s = Number(r.metricValues?.[0]?.value ?? 0);
    const es = Number(r.metricValues?.[1]?.value ?? 0);
    const c = Number(r.metricValues?.[2]?.value ?? 0);
    sessions += s;
    engagedSessions += es;
    conversions += c;
    if (channel.includes('organic')) organicSessions += s;
  }
  return { sessions, organicSessions, engagedSessions, conversions, startDate, endDate };
}

/** Monthly organic sessions (rounded) — the traffic-estimator baseline when GA4 is connected. */
export async function monthlyOrganicSessions(
  accessToken: string,
  property: string,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const t = await fetchTotals(accessToken, property, 90, deps);
  return Math.round(t.organicSessions / 3);
}
