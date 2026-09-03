import type PgBoss from 'pg-boss';
import { eq, inArray } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  db,
  keywordClusters,
  keywordData,
  keywordPlaybooks,
  roadmapItems,
} from 'db';
import { guardedCompleteJson as completeJson } from '../lib/llm.js';
import {
  clusterCoverage,
  pageContentGap,
  prioritiseOpportunities,
  type KeywordInput,
  type PageLike,
} from 'strategy';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import { latestCompletedCrawlId, ownPageLikes } from './strategy-shared.js';
import type { StrategyBuildJob } from './types.js';

const PLAYBOOK_TOP = Number(process.env.PLAYBOOK_TOP ?? 15);
/** Only the top few briefs are LLM-refined; the rest use the deterministic template
 * (keeps LLM calls per rebuild well under a free-tier rate limit). */
const PLAYBOOK_LLM_TOP = Number(process.env.PLAYBOOK_LLM_TOP ?? 6);

const PLAYBOOK_SYSTEM = [
  'Esti un specialist SEO. Primesti un cuvant cheie, date despre pagina proprie (daca exista) si',
  'headings ale celei mai bune pagini competitor. Produ un brief de continut.',
  'Raspunde DOAR cu JSON:',
  '{"title":"...","slug":"...","h2s":["..."],"mustCover":["..."],"faqs":["..."],"internalLinks":["..."]}',
  'REGULI: nu promite pozitii sau trafic. Foloseste doar informatia data. `h2s`/`mustCover` = 4-8 elemente.',
].join('\n');

const ROADMAP_SYSTEM = [
  'Esti un specialist SEO. Primesti o lista de oportunitati de cuvinte cheie (cu bucket si scor).',
  'Fa un plan pe 30/60/90 zile pentru cineva care NU stie SEO. Limbaj simplu, actiuni concrete.',
  'Raspunde DOAR cu JSON: {"items":[{"phase":30,"title":"...","why":"...","effort":1-5,"impact":1-5,"keyword":"..."}]}',
  'REGULI: fara promisiuni de pozitie/trafic. 4-6 actiuni per faza. `why` = de ce conteaza, pe intelesul oricui.',
].join('\n');

export async function handleStrategyBuild(
  job: PgBoss.Job<StrategyBuildJob>,
  boss: PgBoss,
): Promise<void> {
  const { siteId, full } = job.data;

  const kws = await db.select().from(keywordData).where(eq(keywordData.siteId, siteId));
  if (kws.length === 0) {
    logger.warn({ siteId }, 'strategy-build: no keywords');
    return;
  }
  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.siteId, siteId));
  const clusters = await db
    .select()
    .from(keywordClusters)
    .where(eq(keywordClusters.siteId, siteId));

  // 1) Opportunity score + bucket.
  const inputs: (KeywordInput & { id: string })[] = kws.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    // 0 stored when there is no Keyword Planner data → treat as "unknown", not "no demand".
    searchVolume: k.expansionSource === 'keyword_planner' || k.searchVolume > 0 ? k.searchVolume : null,
    competition: k.competition,
    currentPosition: k.currentPosition,
    businessRelevance: k.businessRelevance,
    hasTargetPage: k.hasTargetPage,
  }));
  const scored = prioritiseOpportunities(inputs);
  const scoreByKeyword = new Map(scored.map((s) => [s.keyword, s]));

  for (const k of kws) {
    const s = scoreByKeyword.get(k.keyword);
    if (!s) continue;
    // Keep an existing quick_win from rank-import; otherwise take the computed bucket.
    const bucket = k.bucket === 'quick_win' ? 'quick_win' : s.bucket;
    await db
      .update(keywordData)
      .set({ opportunityScore: s.score, bucket })
      .where(eq(keywordData.id, k.id));
  }

  // SERP tracking (Epic 19) picks up quick_win + build_content keywords directly — see serp-fetch.
  if (!full) {
    logger.info({ siteId, keywords: kws.length }, 'strategy-build (rescore) done');
    await sendNext(boss, 'page-plan', { siteId });
    return;
  }

  // 3) Content-gap (cluster coverage) — needs competitor pages + own pages.
  const compPageRows = await db
    .select({
      url: competitorPages.url,
      title: competitorPages.title,
      h1: competitorPages.h1,
      headings: competitorPages.headings,
      wordCount: competitorPages.wordCount,
      schema: competitorPages.schema,
      targetKeywordGuess: competitorPages.targetKeywordGuess,
    })
    .from(competitorPages)
    .innerJoin(competitors, eq(competitors.id, competitorPages.competitorId))
    .where(eq(competitors.siteId, siteId));

  const yourPages = kws.filter((k) => k.hasTargetPage).map((k) => ({ targetKeyword: k.keyword }));
  const coverage = clusterCoverage(
    clusters.map((c) => ({ name: c.name, members: kws.filter((k) => k.clusterId === c.id).map((k) => k.keyword) })),
    yourPages,
    compPageRows.map((r) => ({ targetKeyword: r.targetKeywordGuess ?? '' })),
  );

  const crawlId = await latestCompletedCrawlId(siteId);
  const ownPages: PageLike[] = crawlId ? await ownPageLikes(crawlId) : [];
  const compPageLikes = compPageRows.map((p) => ({
    url: p.url,
    title: p.title,
    h1: p.h1,
    headings: (p.headings as { level: number; text: string }[] | null) ?? [],
    wordCount: p.wordCount,
    schemaTypes: ((p.schema as unknown[] | null) ?? []).filter((x): x is string => typeof x === 'string'),
    targetKeywordGuess: p.targetKeywordGuess ?? '',
  }));

  // 4) Playbooks for the top opportunities.
  await db.delete(keywordPlaybooks).where(
    inArray(
      keywordPlaybooks.keywordId,
      kws.map((k) => k.id),
    ),
  );
  const top = scored.slice(0, PLAYBOOK_TOP);
  let idx = -1;
  for (const opp of top) {
    idx++;
    const kwRow = kws.find((k) => k.keyword === opp.keyword);
    if (!kwRow) continue;
    const yourPage =
      ownPages.find((p) => (p.title ?? '').toLowerCase().includes(opp.keyword.split(' ')[0]!)) ?? null;
    const bestComp =
      compPageLikes
        .filter((p) => (p.targetKeywordGuess || '').includes(opp.keyword.split(' ')[0]!))
        .sort((a, b) => b.wordCount - a.wordCount)[0] ?? null;
    const gap = bestComp ? pageContentGap(yourPage, bestComp) : null;

    let brief =
      idx < PLAYBOOK_LLM_TOP
        ? await completeJson<{
            title?: string;
            slug?: string;
            h2s?: string[];
            mustCover?: string[];
            faqs?: string[];
            internalLinks?: string[];
          }>(
            PLAYBOOK_SYSTEM,
            JSON.stringify({
              keyword: opp.keyword,
              yourPage: yourPage && { title: yourPage.title, headings: yourPage.headings.map((h) => h.text) },
              competitorHeadings: bestComp?.headings.map((h) => h.text) ?? [],
              missingVsCompetitor: gap?.missingHeadings ?? [],
            }),
            { maxTokens: 900 },
          )
        : null;
    if (!brief) {
      brief = {
        title: `${cap(opp.keyword)} — pagina dedicată`,
        slug: opp.keyword.replace(/\s+/g, '-'),
        h2s: gap?.missingHeadings.slice(0, 6) ?? [`Ce include ${opp.keyword}`, `Cât costă`, `Cum lucrăm`],
        mustCover: gap?.missingHeadings ?? [],
        faqs: [],
        internalLinks: [],
      };
    }
    const checklist = buildChecklist(opp.keyword, kwRow, gap);
    // Tolerate a concurrent keyword delete (FK) — one bad row must not fail the job.
    await db
      .insert(keywordPlaybooks)
      .values({
        keywordId: kwRow.id,
        targetPageId: kwRow.targetPageId ?? null,
        brief,
        checklist,
        llmProvider: process.env.LLM_PROVIDER ?? 'none',
      })
      .catch((err) => logger.warn({ err, keyword: opp.keyword }, 'playbook insert skipped'));
  }

  // 5) Roadmap 30/60/90.
  await db.delete(roadmapItems).where(eq(roadmapItems.siteId, siteId));
  let roadmap = await completeJson<{
    items?: { phase: number; title: string; why?: string; effort?: number; impact?: number; keyword?: string }[];
  }>(
    ROADMAP_SYSTEM,
    JSON.stringify({
      business: profile?.summary ?? null,
      opportunities: top.map((o) => ({ keyword: o.keyword, bucket: o.bucket, score: o.score })),
      clusterGaps: coverage.filter((c) => c.gap > 0).slice(0, 6),
    }),
    { maxTokens: 1200 },
  );
  if (!roadmap?.items?.length) {
    roadmap = { items: deterministicRoadmap(scored) };
  }
  let order = 0;
  for (const it of roadmap.items ?? []) {
    const kwRow = it.keyword ? kws.find((k) => k.keyword === it.keyword) : undefined;
    await db
      .insert(roadmapItems)
      .values({
        siteId,
        keywordId: kwRow?.id ?? null,
        phase: [30, 60, 90].includes(it.phase) ? it.phase : 30,
        title: (it.title ?? 'Acțiune').slice(0, 200),
        why: it.why ?? null,
        effort: clamp15(it.effort ?? 3),
        impact: clamp15(it.impact ?? 3),
        sortOrder: order++,
      })
      .catch((err) => logger.warn({ err }, 'roadmap insert skipped'));
  }

  logger.info(
    { siteId, keywords: kws.length, playbooks: top.length, roadmap: roadmap.items?.length ?? 0 },
    'strategy-build (full) done',
  );
  await sendNext(boss, 'page-plan', { siteId });
}

function buildChecklist(
  keyword: string,
  kw: typeof keywordData.$inferSelect,
  gap: ReturnType<typeof pageContentGap> | null,
): { item: string; done: boolean }[] {
  const list: string[] = [
    `Title-ul paginii țintă conține „${keyword}"`,
    `URL-ul (slug) conține cuvântul cheie`,
    `Un singur H1, care conține „${keyword}"`,
    `Meta description de 120-160 caractere, cu „${keyword}"`,
  ];
  if (!kw.hasTargetPage) list.unshift(`Creează o pagină dedicată pentru „${keyword}"`);
  for (const h of gap?.missingHeadings.slice(0, 5) ?? []) list.push(`Adaugă o secțiune despre: ${h}`);
  if (gap && gap.wordCountDelta > 300)
    list.push(`Extinde conținutul cu ~${gap.wordCountDelta} cuvinte (competitorul acoperă mai mult)`);
  for (const s of gap?.missingSchema ?? []) list.push(`Adaugă schema ${s}`);
  list.push(`Adaugă 2-3 linkuri interne către această pagină din pagini relevante`);
  return list.map((item) => ({ item, done: false }));
}

function deterministicRoadmap(
  scored: { keyword: string; bucket: string; score: number }[],
): { phase: number; title: string; why: string; effort: number; impact: number; keyword?: string }[] {
  const out: ReturnType<typeof deterministicRoadmap> = [];
  const quick = scored.filter((s) => s.bucket === 'quick_win').slice(0, 5);
  const content = scored.filter((s) => s.bucket === 'build_content').slice(0, 5);
  const long = scored.filter((s) => s.bucket === 'long_game').slice(0, 5);
  for (const q of quick)
    out.push({
      phase: 30,
      title: `Optimizează pagina existentă pentru „${q.keyword}"`,
      why: 'Ești deja aproape de prima pagină — ajustări on-page pot aduce un salt rapid.',
      effort: 2,
      impact: 4,
      keyword: q.keyword,
    });
  for (const c of content)
    out.push({
      phase: 60,
      title: `Creează o pagină nouă pentru „${c.keyword}"`,
      why: 'Ai volum de căutare pe acest subiect dar nicio pagină dedicată.',
      effort: 4,
      impact: 4,
      keyword: c.keyword,
    });
  for (const l of long)
    out.push({
      phase: 90,
      title: `Dezvoltă cluster de conținut în jurul „${l.keyword}"`,
      why: 'Subiect competitiv — necesită mai multe pagini legate între ele, pe termen mai lung.',
      effort: 5,
      impact: 3,
      keyword: l.keyword,
    });
  return out;
}

function clamp15(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
