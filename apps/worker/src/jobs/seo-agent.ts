import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type PgBoss from 'pg-boss';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  businessProfiles,
  db,
  issues,
  keywordData,
  pageBlueprints,
  pages,
  recommendations,
  seoAgentNotes,
  crawls,
} from 'db';
import { logger } from '../logger.js';
import { guardedCompleteJson } from '../lib/llm.js';
import { siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

const MODEL = process.env.GEMINI_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'llm';

const SYSTEM = [
  'Esti un reviewer SEO senior. Primesti un PLAN generat automat (determinist) pentru un site + un PLAYBOOK cu reguli + EXEMPLE bune/proaste.',
  'Sarcina: verifica planul FATA DE PLAYBOOK si semnaleaza ce e in neregula. NU rescrie planul, doar semnalezi.',
  'REGULI DURE:',
  '- Foloseste DOAR datele primite + playbook-ul. NU inventa cuvinte cheie, volume, pozitii sau nume.',
  '- NU promite pozitii sau trafic ("vei ajunge pe locul 1", "garantat", "+X vizite sigur"). Interzis.',
  '- Daca ceva respecta playbook-ul, nu-l semnala.',
  'Raspunde DOAR cu JSON: {"note": "2-4 propozitii, rezumat in romana simpla pentru un om care nu stie SEO", "flags": [{"target": "url sau id", "problem": "ce e gresit, pe scurt", "suggestion": "ce sa faca in schimb"}]}.',
  'Maxim 8 flags. Daca planul e ok, "flags": [].',
].join('\n');

async function readDoc(name: string, fallback: string): Promise<string> {
  for (const base of [process.cwd(), join(process.cwd(), '..', '..'), '/app']) {
    try {
      const txt = await readFile(join(base, name), 'utf8');
      if (txt.trim()) return txt.slice(0, 8000);
    } catch {
      /* try next */
    }
  }
  return fallback;
}

const PROMISE_RE = /(garant|vei ajunge|locul 1|pozitia 1|#1|sigur \+|100% )/i;

export async function handleSeoAgent(job: PgBoss.Job<SiteJob>): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.siteId, siteId));

  const blueprints = await db
    .select()
    .from(pageBlueprints)
    .where(eq(pageBlueprints.siteId, siteId))
    .orderBy(asc(pageBlueprints.priority))
    .limit(12);

  const [latestCrawl] = await db
    .select({ id: crawls.id })
    .from(crawls)
    .where(eq(crawls.siteId, siteId))
    .orderBy(desc(crawls.createdAt))
    .limit(1);

  const recs = latestCrawl
    ? await db
        .select({
          ruleId: issues.ruleId,
          description: issues.description,
          detectedValue: issues.detectedValue,
          fixTitle: recommendations.fixTitle,
          priorityRank: recommendations.priorityRank,
          url: pages.url,
        })
        .from(recommendations)
        .innerJoin(issues, eq(issues.id, recommendations.issueId))
        .innerJoin(pages, eq(pages.id, issues.pageId))
        .where(and(eq(pages.crawlId, latestCrawl.id), eq(recommendations.applied, false)))
        .orderBy(asc(recommendations.priorityRank))
        .limit(12)
    : [];

  const kwById = new Map(
    (await db.select().from(keywordData).where(eq(keywordData.siteId, siteId))).map((k) => [
      k.id,
      k,
    ]),
  );

  const payload = {
    business: {
      summary: profile?.summary ?? null,
      services: (profile?.services as string[] | null) ?? [],
      country: profile?.geoCountry ?? null,
      localSeo: !!profile?.localEmphasis,
      city: profile?.localEmphasis ? profile?.primaryCity ?? null : null,
    },
    blueprints: blueprints.map((b) => ({
      target: b.isHomepage ? 'HOMEPAGE' : new URL(b.url).pathname,
      isHomepage: b.isHomepage,
      targetKeyword: b.targetKeyword,
      keywordRelevance: b.targetKeywordId
        ? kwById.get(b.targetKeywordId)?.businessRelevance ?? null
        : null,
      keywordVolume: b.potential?.searchVolume ?? null,
      currentTitle: b.current?.title ?? null,
      recommendedTitle: b.recommended?.title ?? null,
      recommendedSchema: b.recommended?.schemaType ?? null,
      diagnosis: b.diagnosis,
    })),
    recommendations: recs.map((r) => ({
      target: new URL(r.url).pathname,
      rule: r.ruleId,
      issue: r.description,
      detected: r.detectedValue,
      fix: r.fixTitle,
    })),
  };

  const playbook = await readDoc(
    'seo-playbook.md',
    'Homepage-ul tinteste un termen de CATEGORIE, nu un serviciu. Paginile legale/utilitare nu au tinta. Nicio promisiune de pozitie/trafic.',
  );
  const examples = await readDoc('seo-golden-examples.md', '');

  const user = [
    '### PLAYBOOK', playbook,
    examples ? '\n### EXEMPLE' : '', examples,
    '\n### PLAN', JSON.stringify(payload, null, 1),
  ].join('\n');

  const out = await guardedCompleteJson<{
    note?: string;
    flags?: { target?: string; problem?: string; suggestion?: string }[];
  }>(SYSTEM, user, { maxTokens: 1400 });

  if (!out || !out.note) {
    logger.info({ siteId }, 'seo-agent: no LLM result (provider none / cap / failure) — note unchanged');
    return;
  }

  const flags = (out.flags ?? [])
    .filter((f) => f.problem && f.suggestion)
    .filter((f) => !PROMISE_RE.test(`${f.problem} ${f.suggestion}`))
    .slice(0, 8)
    .map((f) => ({
      target: String(f.target ?? '').slice(0, 200),
      problem: String(f.problem).slice(0, 300),
      suggestion: String(f.suggestion).slice(0, 300),
    }));

  const note = PROMISE_RE.test(out.note) ? 'Revizuire făcută — vezi punctele de mai jos.' : out.note.slice(0, 600);

  await db
    .insert(seoAgentNotes)
    .values({
      siteId,
      summary: note,
      flags,
      model: MODEL,
      reviewed: blueprints.length + recs.length,
    })
    .onConflictDoUpdate({
      target: seoAgentNotes.siteId,
      set: { summary: note, flags, model: MODEL, reviewed: blueprints.length + recs.length, createdAt: new Date() },
    });

  logger.info({ siteId, flags: flags.length, reviewed: blueprints.length + recs.length }, 'seo-agent done');
}
