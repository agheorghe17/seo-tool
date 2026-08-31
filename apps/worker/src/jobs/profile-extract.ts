import type PgBoss from 'pg-boss';
import { eq } from 'drizzle-orm';
import { businessProfiles, db } from 'db';
import { completeJson } from 'llm';
import { tokens } from 'strategy';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import { latestCompletedCrawlId, ownPageLikes, siteRow } from './strategy-shared.js';
import type { ProfileExtractJob } from './types.js';

const RO_CITIES = [
  'bucuresti', 'cluj', 'timisoara', 'iasi', 'constanta', 'brasov', 'sibiu', 'oradea',
  'craiova', 'ploiesti', 'pitesti', 'arad', 'galati', 'braila', 'targu mures',
];

const SYSTEM = [
  'Esti un asistent care extrage profilul unei afaceri din structura site-ului ei.',
  'Primesti liste de URL-uri, titluri si headings. Raspunde DOAR cu JSON:',
  '{"summary": "...", "services": ["..."], "locations": ["..."], "languages": ["ro"], "audience": "..."}',
  'Nu inventa servicii care nu apar in date. `services` = 3-12 servicii concrete oferite.',
].join('\n');

export async function handleProfileExtract(
  job: PgBoss.Job<ProfileExtractJob>,
  boss: PgBoss,
): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const crawlId = job.data.crawlId ?? (await latestCompletedCrawlId(siteId));
  if (!crawlId) {
    logger.warn({ siteId }, 'profile-extract: no completed crawl');
    await sendNext(boss, 'keyword-research', { siteId });
    return;
  }
  const pageLikes = await ownPageLikes(crawlId);

  const structured = pageLikes.slice(0, 60).map((p) => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    headings: p.headings.filter((h) => h.level <= 3).map((h) => h.text).slice(0, 8),
  }));

  let profile = await completeJson<{
    summary?: string;
    services?: string[];
    locations?: string[];
    languages?: string[];
    audience?: string;
  }>(SYSTEM, JSON.stringify({ domain: site.domain, pages: structured }), { maxTokens: 900 });

  if (!profile) {
    // Heuristic fallback (no LLM): every non-utility page's H1/title is a candidate service/topic.
    const UTILITY =
      /(contact|despre|about|termeni|terms|privacy|confidential|cookie|blog|articol|news|cos|checkout|cont|login|autentificare|404|sitemap|\.xml|feed|rss|wp-|category|tag\/|author\/)/i;
    const services = new Set<string>();
    const locations = new Set<string>();
    for (const p of pageLikes) {
      const path = safePath(p.url);
      const hay = tokens(`${p.title ?? ''} ${p.h1 ?? ''} ${path}`);
      for (const c of RO_CITIES) if (hay.includes(c.split(' ')[0]!)) locations.add(cap(c));

      if (path === '/' || path === '') continue;
      if (UTILITY.test(path) || UTILITY.test(p.title ?? '')) continue;
      const label = (p.h1 ?? p.title ?? '')
        .replace(/\s*[|\-–—:•].*$/, '')
        .replace(new RegExp(site.domain.split('.')[0]!, 'ig'), '')
        .trim();
      if (label.length >= 4 && label.length <= 70 && tokens(label).length >= 1) services.add(label);
    }
    // Also mine homepage H2s (often a services list).
    const home = pageLikes.find((p) => safePath(p.url) === '/' || safePath(p.url) === '');
    for (const h of home?.headings ?? []) {
      if (h.level === 2 && h.text.length >= 4 && h.text.length <= 70) services.add(h.text.trim());
    }
    profile = {
      summary: `Site-ul ${site.domain}.`,
      services: [...services].slice(0, 15),
      locations: [...locations],
      languages: ['ro'],
    };
  }

  const [existing] = await db
    .select({ confirmedAt: businessProfiles.confirmedAt })
    .from(businessProfiles)
    .where(eq(businessProfiles.siteId, siteId));

  const values = {
    siteId,
    summary: profile.summary ?? null,
    services: profile.services ?? [],
    locations: profile.locations ?? [],
    languages: profile.languages?.length ? profile.languages : ['ro'],
    audience: profile.audience ?? null,
    sourceCrawlId: crawlId,
    updatedAt: new Date(),
  };

  if (!existing) {
    await db.insert(businessProfiles).values(values);
  } else if (!existing.confirmedAt) {
    // Only refresh a draft the user hasn't confirmed.
    await db.update(businessProfiles).set(values).where(eq(businessProfiles.siteId, siteId));
  }

  logger.info({ siteId, services: profile.services?.length ?? 0 }, 'profile-extract done');
  await sendNext(boss, 'keyword-research', { siteId });
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
function cap(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
