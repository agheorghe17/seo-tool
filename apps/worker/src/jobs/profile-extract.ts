import type PgBoss from 'pg-boss';
import { eq } from 'drizzle-orm';
import { businessProfiles, db } from 'db';
import { completeJson } from 'llm';
import { tokens } from 'strategy';
import { logger } from '../logger.js';
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

export async function handleProfileExtract(job: PgBoss.Job<ProfileExtractJob>): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const crawlId = job.data.crawlId ?? (await latestCompletedCrawlId(siteId));
  if (!crawlId) {
    logger.warn({ siteId }, 'profile-extract: no completed crawl');
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
    // Heuristic fallback: services from /servicii* slugs + page titles; locations from city mentions.
    const services = new Set<string>();
    const locations = new Set<string>();
    for (const p of pageLikes) {
      const path = safePath(p.url);
      if (/servic/i.test(path) || /servic/i.test(p.title ?? '')) {
        const label = (p.h1 ?? p.title ?? '').replace(/\s*[|\-–—:].*$/, '').trim();
        if (label && label.length <= 60) services.add(label);
      }
      const hay = tokens(`${p.title ?? ''} ${p.h1 ?? ''} ${path}`);
      for (const c of RO_CITIES) if (hay.includes(c.split(' ')[0]!)) locations.add(cap(c));
    }
    profile = {
      summary: `Site-ul ${site.domain}.`,
      services: [...services].slice(0, 12),
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
