/**
 * Epic 13.3 — Google Ads Keyword Planner (KeywordPlanIdeaService). FREE, but needs a Google Ads
 * developer token + an OAuth token granted with the `adwords` scope. Degrades gracefully to
 * `{ available: false, ideas: [] }` when not configured — the keyword universe still works
 * (autocomplete + GSC), just without search volume.
 */

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number | null;
  /** 0..1 (competitionIndex / 100). */
  competition: number | null;
}

export interface KeywordPlannerResult {
  available: boolean;
  reason?: string;
  ideas: KeywordIdea[];
}

export interface KeywordPlannerAuth {
  accessToken: string;
  customerId: string; // digits only
}

export interface KeywordPlannerOptions {
  fetchImpl?: typeof fetch;
  geoTargetConstantId?: string; // e.g. "2642" for Romania
  languageConstantId?: string; // e.g. "1038" for Romanian
  pageUrl?: string;
}

/**
 * Google Ads API sunsets versions ~yearly. Override with GOOGLE_ADS_API_VERSION when the
 * default 404s (that's the "version removed" signal). Supported as of 2026-H2: v22–v24.
 */
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION ?? 'v22';
/** geoTargetConstants/2642 = Romania, languageConstants/1038 = Romanian. */
const RO_GEO = '2642';
const RO_LANG = '1038';

const COMPETITION_INDEX: Record<string, number> = { LOW: 0.2, MEDIUM: 0.5, HIGH: 0.85 };

interface GadsIdeaResponse {
  results?: Array<{
    text?: string;
    keywordIdeaMetrics?: {
      avgMonthlySearches?: string;
      competition?: string;
      competitionIndex?: string;
    };
  }>;
  error?: { message?: string };
}

export function keywordPlannerConfigured(): boolean {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
}

export async function fetchKeywordIdeas(
  seeds: string[],
  auth: KeywordPlannerAuth | null,
  opts: KeywordPlannerOptions = {},
): Promise<KeywordPlannerResult> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) {
    return { available: false, reason: 'GOOGLE_ADS_DEVELOPER_TOKEN not set', ideas: [] };
  }
  if (!auth?.accessToken || !auth.customerId) {
    return { available: false, reason: 'no Google Ads OAuth token / customer id', ideas: [] };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${auth.customerId}:generateKeywordIdeas`;
  const body: Record<string, unknown> = {
    keywordSeed: { keywords: seeds.slice(0, 20) },
    geoTargetConstants: [`geoTargetConstants/${opts.geoTargetConstantId ?? RO_GEO}`],
    language: `languageConstants/${opts.languageConstantId ?? RO_LANG}`,
    keywordPlanNetwork: 'GOOGLE_SEARCH',
    // NOTE: generateKeywordIdeas rejects `pageSize` in the request body (INVALID_ARGUMENT
    // on v20+); it returns the full idea set and we cap downstream.
  };
  if (opts.pageUrl) body.urlSeed = { url: opts.pageUrl };

  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${auth.accessToken}`,
        'developer-token': devToken,
        ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
          ? { 'login-customer-id': process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID }
          : {}),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as GadsIdeaResponse;
    if (!res.ok) {
      return { available: false, reason: json.error?.message ?? `HTTP ${res.status}`, ideas: [] };
    }
    const ideas: KeywordIdea[] = (json.results ?? [])
      .filter((r) => r.text)
      .map((r) => {
        const m = r.keywordIdeaMetrics ?? {};
        const idx = m.competitionIndex != null ? Number(m.competitionIndex) / 100 : null;
        return {
          keyword: r.text!.toLowerCase(),
          avgMonthlySearches:
            m.avgMonthlySearches != null ? Number(m.avgMonthlySearches) : null,
          competition:
            idx ?? (m.competition ? (COMPETITION_INDEX[m.competition] ?? null) : null),
        };
      });
    return { available: true, ideas };
  } catch (err) {
    return { available: false, reason: String(err), ideas: [] };
  }
}
