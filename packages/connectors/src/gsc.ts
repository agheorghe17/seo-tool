/** Epic 7.1/7.2 — Google Search Console OAuth + Search Analytics import (plain fetch, no SDK). */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SC_ENDPOINT = 'https://searchconsole.googleapis.com/webmasters/v3';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export interface GscOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function config(): GscOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / _SECRET / _REDIRECT_URI are not set');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthUrl(state: string, cfg: GscOAuthConfig = config()): { authUrl: string; state: string } {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return { authUrl: `${AUTH_ENDPOINT}?${params.toString()}`, state };
}

export interface GscTokens {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
}

export async function exchangeCode(
  code: string,
  deps: { fetchImpl?: typeof fetch; cfg?: GscOAuthConfig } = {},
): Promise<GscTokens> {
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
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (!json.refresh_token || !json.access_token) {
    throw new Error('token response missing refresh_token/access_token (re-consent required)');
  }
  return {
    refreshToken: json.refresh_token,
    accessToken: json.access_token,
    expiresIn: json.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  deps: { fetchImpl?: typeof fetch; cfg?: GscOAuthConfig } = {},
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
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('refresh response missing access_token');
  return json.access_token;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsQuery {
  property: string;
  startDate: string;
  endDate: string;
  dimensions?: Array<'page' | 'query' | 'date'>;
  rowLimit?: number;
}

export async function fetchSearchAnalytics(
  accessToken: string,
  query: SearchAnalyticsQuery,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<GscRow[]> {
  const doFetch = deps.fetchImpl ?? fetch;
  const res = await doFetch(
    `${SC_ENDPOINT}/sites/${encodeURIComponent(query.property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        startDate: query.startDate,
        endDate: query.endDate,
        dimensions: query.dimensions ?? ['page'],
        rowLimit: query.rowLimit ?? 1000,
      }),
    },
  );
  if (!res.ok) throw new Error(`search analytics query failed: ${res.status}`);
  const json = (await res.json()) as { rows?: GscRow[] };
  return json.rows ?? [];
}

/** Sum of clicks over a page-dimension result — the traffic baseline (Epic 7.2). */
export function totalClicks(rows: GscRow[]): number {
  return rows.reduce((acc, r) => acc + (r.clicks ?? 0), 0);
}
