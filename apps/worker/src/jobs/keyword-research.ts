import type PgBoss from 'pg-boss';
import { eq } from 'drizzle-orm';
import { businessProfiles, db, keywordClusters, keywordData } from 'db';
import { autocomplete, keywordplanner, getSerpProvider, serpEnabled } from 'connectors';
import { completeJson } from 'llm';
import {
  businessRelevance,
  classifyIntent,
  clusterKeywords,
  normalize,
  type BusinessProfileInput,
} from 'strategy';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import { GL, HL, gscAccessToken, siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

const MAX_KEYWORDS = Number(process.env.KEYWORD_UNIVERSE_MAX ?? 1000);

const SEED_SYSTEM = [
  'Esti un specialist SEO. Din profilul unei afaceri, propune fraze seed pentru research de cuvinte cheie.',
  'Raspunde DOAR cu JSON: {"seeds": ["...", "..."]}. 12-25 seed-uri, in romana, fara diacritice.',
  'Include: serviciu simplu, serviciu + "servicii/agentie", serviciu + oras principal, serviciu + "pret".',
].join('\n');

export async function handleKeywordResearch(job: PgBoss.Job<SiteJob>, boss: PgBoss): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const [profileRow] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.siteId, siteId));
  const profile: BusinessProfileInput = {
    summary: profileRow?.summary ?? null,
    services: profileRow?.services ?? [],
    locations: profileRow?.locations ?? [],
    languages: profileRow?.languages ?? ['ro'],
  };
  if (profile.services.length === 0) {
    logger.warn({ siteId }, 'keyword-research: empty profile, skipping');
    await sendNext(boss, 'rank-import', { siteId });
    return;
  }

  // 1) Seeds.
  const llmSeeds = await completeJson<{ seeds?: string[] }>(
    SEED_SYSTEM,
    JSON.stringify(profile),
    { maxTokens: 500 },
  );
  const seeds = new Set<string>();
  for (const s of llmSeeds?.seeds ?? []) seeds.add(normalize(s));
  if (seeds.size === 0) {
    const cities = profile.locations.length ? profile.locations : ['romania'];
    for (const svc of profile.services) {
      const s = normalize(svc);
      seeds.add(s);
      seeds.add(`servicii ${s}`);
      seeds.add(`agentie ${s}`);
      seeds.add(`${s} pret`);
      for (const c of cities.slice(0, 3)) seeds.add(`${s} ${normalize(c)}`);
    }
  }
  const seedList = [...seeds].filter(Boolean).slice(0, 40);

  // 2) Expand — autocomplete (free).
  const universe = new Set<string>(seedList);
  for (const s of await autocomplete.expandSeeds(seedList, { gl: GL, hl: HL, alphabet: true, max: 700 })) {
    universe.add(s);
  }

  // 3) Volumes — Google Ads Keyword Planner (free, optional).
  const volumeByKw = new Map<string, { volume: number | null; competition: number | null }>();
  if (keywordplanner.keywordPlannerConfigured()) {
    const token = await gscAccessToken(siteId); // same OAuth grant (adwords scope)
    const customerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, '') ?? '';
    const res = await keywordplanner.fetchKeywordIdeas(
      seedList,
      token && customerId ? { accessToken: token, customerId } : null,
    );
    if (res.available) {
      for (const idea of res.ideas) {
        universe.add(normalize(idea.keyword));
        volumeByKw.set(normalize(idea.keyword), {
          volume: idea.avgMonthlySearches,
          competition: idea.competition,
        });
      }
    } else {
      logger.info({ siteId, reason: res.reason }, 'keyword planner unavailable');
    }
  }

  // 4) Related queries from SERP (optional).
  if (serpEnabled()) {
    const provider = getSerpProvider();
    for (const s of seedList.slice(0, 15)) {
      const r = await provider.search({ keyword: s, gl: GL, hl: HL });
      for (const rq of r?.relatedQueries ?? []) universe.add(normalize(rq));
    }
  }

  const keywords = [...universe].filter((k) => k.length >= 3 && k.split(' ').length <= 8).slice(0, MAX_KEYWORDS);

  // 5) Cluster + classify + relevance, then upsert.
  const clusters = clusterKeywords(
    keywords.map((k) => ({ keyword: k, searchVolume: volumeByKw.get(k)?.volume ?? null })),
    { maxClusters: 40 },
  );
  const clusterIdByName = new Map<string, string>();
  for (const c of clusters) {
    const [row] = await db
      .insert(keywordClusters)
      .values({ siteId, name: c.name, pillarKeyword: c.pillar, intent: classifyIntent(c.pillar) })
      .onConflictDoUpdate({
        target: [keywordClusters.siteId, keywordClusters.name],
        set: { pillarKeyword: c.pillar },
      })
      .returning({ id: keywordClusters.id });
    if (row) clusterIdByName.set(c.name, row.id);
  }
  const clusterOfKeyword = new Map<string, string>();
  for (const c of clusters) for (const m of c.members) clusterOfKeyword.set(m, c.name);

  let inserted = 0;
  for (const kw of keywords) {
    const vol = volumeByKw.get(kw);
    const clusterName = clusterOfKeyword.get(kw);
    await db
      .insert(keywordData)
      .values({
        siteId,
        keyword: kw,
        source: 'gsc', // enum reuse; real provenance is expansionSource
        searchVolume: vol?.volume ?? 0,
        competition: vol?.competition ?? null,
        intent: classifyIntent(kw),
        businessRelevance: businessRelevance(kw, profile),
        clusterId: clusterName ? (clusterIdByName.get(clusterName) ?? null) : null,
        expansionSource: vol ? 'keyword_planner' : 'autocomplete',
        gl: GL,
        hl: HL,
      })
      .onConflictDoNothing();
    inserted++;
  }

  logger.info(
    { siteId, universe: keywords.length, clusters: clusters.length, inserted },
    'keyword-research done',
  );
  await sendNext(boss, 'rank-import', { siteId });
}
