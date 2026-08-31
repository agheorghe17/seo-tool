/** Epic 7.1/7.2 — Google Search Console OAuth + Search Analytics import. */

export interface GscOAuthUrls {
  authUrl: string;
  state: string;
}

export interface GscBaselineRow {
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export function buildAuthUrl(_siteId: string): GscOAuthUrls {
  throw new Error('not implemented — Epic 7.1');
}

export async function exchangeCode(_code: string): Promise<{ refreshToken: string }> {
  throw new Error('not implemented — Epic 7.1');
}

export async function fetchSearchAnalytics(
  _refreshToken: string,
  _property: string,
  _range: { start: string; end: string },
): Promise<GscBaselineRow[]> {
  throw new Error('not implemented — Epic 7.2');
}
