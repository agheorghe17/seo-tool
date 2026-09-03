import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type PgBoss from 'pg-boss';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  crawls,
  db,
  issues,
  keywordData,
  pageBlueprints,
  pages,
  playbookRules,
  recommendations,
  seoAgentNotes,
} from 'db';
import { logger } from '../logger.js';
import { guardedCompleteJson } from '../lib/llm.js';
import { siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

const MODEL = process.env.GEMINI_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'llm';
const APPLY_EDITS = (process.env.AGENT_APPLY_EDITS ?? 'on') !== 'off';
const MAX_EDITS = Number(process.env.AGENT_MAX_EDITS ?? 10);

const SYSTEM = [
  'Esti un reviewer SEO senior. Primesti un PLAN generat automat pentru un site, un PLAYBOOK cu reguli, EXEMPLE, si REGULI INVATATE din corectarile utilizatorului (prioritare).',
  'REGULI DURE:',
  '- Foloseste DOAR datele primite. NU inventa cuvinte cheie, volume, pozitii sau nume.',
  '- NU promite pozitii sau trafic. Interzis orice "garantat / vei ajunge / locul 1".',
  '- Rescrierile de rationale raman scurte (max ~50 cuvinte), in romana simpla, si NU introduc cifre care nu sunt in date.',
  'Raspunde DOAR cu JSON:',
  '{',
  '  "note": "2-4 propozitii, rezumat simplu",',
  '  "flags": [{"target":"...", "problem":"...", "suggestion":"..."}],   // max 8; [] daca planul e ok',
  '  "rewrites": [{"target":"...", "rationale":"explicatie mai buna, bazata pe semnale"}],  // doar unde chiar ajuta',
  '  "rerank": [{"target":"...", "priority": <int 1-400>}],  // doar daca ordinea e clar gresita; homepage ramane prima',
  '  "competitorGaps": [{"target":"...", "missingTopics":["..."], "angle":"...", "depthNote":"..."}]  // ce acopera competitorul si pagina ta nu',
  '}',
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

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

/** A rewrite is safe only if it adds no new numbers and no promises. */
function rewriteOk(next: string, prev: string | null, factsBlob: string): boolean {
  const t = next.trim();
  if (t.length < 20 || t.length > 600) return false;
  if (prev && t === prev.trim()) return false;
  if (PROMISE_RE.test(t)) return false;
  const nums = t.match(/\d{2,}/g) ?? [];
  return nums.every((n) => factsBlob.includes(n));
}

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
    .limit(14);

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
    (await db.select().from(keywordData).where(eq(keywordData.siteId, siteId))).map((k) => [k.id, k]),
  );

  // Own page main text (for the competitor gap read).
  const ownText = latestCrawl
    ? new Map(
        (
          await db
            .select({ url: pages.url, mainText: pages.mainText })
            .from(pages)
            .where(eq(pages.crawlId, latestCrawl.id))
        ).map((p) => [pathOf(p.url), p.mainText ?? '']),
      )
    : new Map<string, string>();

  // Best competitor page per blueprint keyword (shared first token + longest).
  const compRows = await db
    .select({
      url: competitorPages.url,
      headings: competitorPages.headings,
      wordCount: competitorPages.wordCount,
      mainText: competitorPages.mainText,
      guess: competitorPages.targetKeywordGuess,
    })
    .from(competitorPages)
    .innerJoin(competitors, eq(competitors.id, competitorPages.competitorId))
    .where(eq(competitors.siteId, siteId));

  function bestComp(keyword: string | null) {
    const tok = (keyword ?? '').split(/\s+/)[0]?.toLowerCase() ?? '';
    if (!tok) return null;
    return (
      compRows
        .filter(
          (c) =>
            (c.guess ?? '').toLowerCase().includes(tok) || c.url.toLowerCase().includes(tok),
        )
        .sort((a, b) => b.wordCount - a.wordCount)[0] ?? null
    );
  }

  const bpForLlm = blueprints.map((b) => {
    const target = b.isHomepage ? 'HOMEPAGE' : pathOf(b.url);
    const comp = b.isHomepage ? null : bestComp(b.targetKeyword);
    return {
      bp: b,
      target,
      json: {
        target,
        isHomepage: b.isHomepage,
        targetKeyword: b.targetKeyword,
        keywordRelevance: b.targetKeywordId ? kwById.get(b.targetKeywordId)?.businessRelevance ?? null : null,
        keywordVolume: b.potential?.searchVolume ?? null,
        currentPosition: b.current?.position ?? null,
        priority: b.priority,
        currentRationale: b.rationale,
        diagnosis: b.diagnosis,
        yourText: (ownText.get(target) ?? '').slice(0, 1400),
        competitor: comp
          ? {
              url: comp.url,
              wordCount: comp.wordCount,
              headings: (comp.headings ?? []).map((h) => h.text).slice(0, 25),
              text: (comp.mainText ?? '').slice(0, 1800),
            }
          : null,
      },
    };
  });

  const payload = {
    business: {
      summary: profile?.summary ?? null,
      services: (profile?.services as string[] | null) ?? [],
      country: profile?.geoCountry ?? null,
      localSeo: !!profile?.localEmphasis,
      city: profile?.localEmphasis ? profile?.primaryCity ?? null : null,
    },
    blueprints: bpForLlm.map((x) => x.json),
    recommendations: recs.map((r) => ({
      target: pathOf(r.url),
      rule: r.ruleId,
      issue: r.description,
      detected: r.detectedValue,
      fix: r.fixTitle,
    })),
  };

  const playbook = await readDoc(
    'seo-playbook.md',
    'Homepage-ul tinteste un termen de CATEGORIE. Paginile legale nu au tinta. Nicio promisiune de pozitie/trafic.',
  );
  const examples = await readDoc('seo-golden-examples.md', '');

  const learned = await db
    .select({ rule: playbookRules.rule })
    .from(playbookRules)
    .where(
      and(
        eq(playbookRules.active, true),
        or(isNull(playbookRules.siteId), eq(playbookRules.siteId, siteId)),
      ),
    )
    .orderBy(desc(playbookRules.createdAt))
    .limit(60);
  const learnedBlock = learned.length
    ? `\n### REGULI INVATATE (prioritare)\n${learned.map((r) => `- ${r.rule}`).join('\n')}`
    : '';

  const user = [
    '### PLAYBOOK', playbook,
    examples ? '\n### EXEMPLE' : '', examples,
    learnedBlock,
    '\n### PLAN', JSON.stringify(payload, null, 1),
  ].join('\n');

  const out = await guardedCompleteJson<{
    note?: string;
    flags?: { target?: string; problem?: string; suggestion?: string }[];
    rewrites?: { target?: string; rationale?: string }[];
    rerank?: { target?: string; priority?: number }[];
    competitorGaps?: { target?: string; missingTopics?: string[]; angle?: string; depthNote?: string }[];
  }>(SYSTEM, user, { maxTokens: 3000 });

  if (!out || !out.note) {
    logger.info({ siteId }, 'seo-agent: no LLM result — note unchanged');
    return;
  }

  const byTarget = new Map(bpForLlm.map((x) => [x.target, x.bp]));
  const factsBlob = JSON.stringify(payload);

  // --- flags ---
  const flags = (out.flags ?? [])
    .filter((f) => f.problem && f.suggestion && !PROMISE_RE.test(`${f.problem} ${f.suggestion}`))
    .slice(0, 8)
    .map((f) => ({
      target: String(f.target ?? '').slice(0, 200),
      problem: String(f.problem).slice(0, 300),
      suggestion: String(f.suggestion).slice(0, 300),
    }));

  // --- competitor insights (always applied — additive, no revert needed) ---
  let insights = 0;
  for (const g of out.competitorGaps ?? []) {
    const bp = byTarget.get(String(g.target ?? ''));
    if (!bp) continue;
    const comp = bestComp(bp.targetKeyword);
    if (!comp) continue;
    await db
      .update(pageBlueprints)
      .set({
        competitorInsight: {
          competitorUrl: comp.url,
          missingTopics: (g.missingTopics ?? []).map((t) => String(t).slice(0, 120)).slice(0, 10),
          angle: String(g.angle ?? '').slice(0, 300),
          depthNote: String(g.depthNote ?? '').slice(0, 300),
        },
      })
      .where(eq(pageBlueprints.id, bp.id));
    insights++;
  }

  // --- edits: rewrite rationale + rerank (reversible via agent_* columns) ---
  let rewrites = 0;
  let reranks = 0;
  if (APPLY_EDITS) {
    for (const r of out.rewrites ?? []) {
      if (rewrites >= MAX_EDITS) break;
      const bp = byTarget.get(String(r.target ?? ''));
      if (!bp || !r.rationale) continue;
      if (!rewriteOk(r.rationale, bp.rationale, factsBlob)) continue;
      await db
        .update(pageBlueprints)
        .set({ agentRationale: r.rationale.trim().slice(0, 600) })
        .where(eq(pageBlueprints.id, bp.id));
      rewrites++;
    }
    for (const r of out.rerank ?? []) {
      if (reranks >= MAX_EDITS) break;
      const bp = byTarget.get(String(r.target ?? ''));
      if (!bp || bp.isHomepage) continue; // homepage stays first
      const p = Math.round(Number(r.priority));
      if (!Number.isFinite(p) || p < 1 || p > 400) continue;
      if (Math.abs(p - bp.priority) > 80) continue; // no wild jumps
      await db
        .update(pageBlueprints)
        .set({ agentPriority: p })
        .where(eq(pageBlueprints.id, bp.id));
      reranks++;
    }
  }

  const note = PROMISE_RE.test(out.note)
    ? 'Revizuire făcută — vezi punctele de mai jos.'
    : out.note.slice(0, 600);

  await db
    .insert(seoAgentNotes)
    .values({ siteId, summary: note, flags, model: MODEL, reviewed: blueprints.length + recs.length })
    .onConflictDoUpdate({
      target: seoAgentNotes.siteId,
      set: {
        summary: note,
        flags,
        model: MODEL,
        reviewed: blueprints.length + recs.length,
        createdAt: new Date(),
      },
    });

  logger.info(
    { siteId, flags: flags.length, rewrites, reranks, insights, reviewed: blueprints.length + recs.length },
    'seo-agent done',
  );
}

/** Undo all of the agent's in-place edits for a site (used by the API revert route). */
export async function revertAgentEdits(siteId: string): Promise<number> {
  const rows = await db
    .update(pageBlueprints)
    .set({ agentRationale: null, agentPriority: null })
    .where(eq(pageBlueprints.siteId, siteId))
    .returning({ id: pageBlueprints.id });
  return rows.length;
}
