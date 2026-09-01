import { and, desc, eq } from 'drizzle-orm';
import { crawls, db, pages, siteSecrets, sites } from 'db';
import { gsc } from 'connectors';
import { decryptSecret } from 'shared';
import type { PageLike } from 'strategy';

/** Latest completed crawl id for a site, or null. */
export async function latestCompletedCrawlId(siteId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: crawls.id })
    .from(crawls)
    .where(and(eq(crawls.siteId, siteId), eq(crawls.status, 'completed')))
    .orderBy(desc(crawls.completedAt))
    .limit(1);
  return row?.id ?? null;
}

/** Your own crawled pages reduced to `PageLike` (for gap analysis / profile extraction). */
export async function ownPageLikes(crawlId: string): Promise<PageLike[]> {
  const rows = await db.select().from(pages).where(eq(pages.crawlId, crawlId));
  return rows.map((p) => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    headings: (p.headings as { level: number; text: string }[] | null) ?? [],
    wordCount: p.wordCount,
    schemaTypes: ((p.schema as unknown[] | null) ?? []).filter((x): x is string => typeof x === 'string'),
  }));
}

/** GSC access token for a site (adwords + webmasters scope granted together at connect). */
export async function gscAccessToken(siteId: string): Promise<string | null> {
  const [secret] = await db
    .select()
    .from(siteSecrets)
    .where(and(eq(siteSecrets.siteId, siteId), eq(siteSecrets.kind, 'gsc_refresh_token')));
  if (!secret) return null;
  try {
    const refreshToken = decryptSecret({
      ciphertext: secret.ciphertext,
      iv: secret.iv,
      tag: secret.tag,
    });
    return await gsc.refreshAccessToken(refreshToken);
  } catch {
    return null;
  }
}

export async function siteRow(siteId: string) {
  const [s] = await db.select().from(sites).where(eq(sites.id, siteId));
  return s ?? null;
}

const STRATEGY_GEO = process.env.STRATEGY_GEO ?? 'ro';
const STRATEGY_LANG = process.env.STRATEGY_LANG ?? 'ro';
/** @deprecated use glFor(profile) — kept for callers that have no profile. */
export const GL = STRATEGY_GEO;
export const HL = STRATEGY_LANG;

/** Epic 22 — per-site geo/lang from the business profile, env only as fallback. */
export function glFor(profile?: { geoCountry?: string | null } | null): string {
  return profile?.geoCountry?.trim().toLowerCase() || STRATEGY_GEO;
}
export function hlFor(profile?: { geoLanguage?: string | null } | null): string {
  return profile?.geoLanguage?.trim().toLowerCase() || STRATEGY_LANG;
}
