import type PgBoss from 'pg-boss';
import { eq, inArray } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  db,
  keywordData,
  keywordPlaybooks,
  pageBlueprints,
  pages as pagesTable,
} from 'db';
import { estimatedClicks } from 'shared';
import {
  assignPageTargets,
  pageContentGap,
  type KeywordCandidate,
  type PageLike,
} from 'strategy';
import { logger } from '../logger.js';
import { sendNext } from '../queue.js';
import { latestCompletedCrawlId, siteRow } from './strategy-shared.js';
import type { SiteJob } from './types.js';

const MAX_BLUEPRINTS = Number(process.env.PAGE_PLAN_MAX ?? 40);

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, '');
  } catch {
    return url;
  }
}
function isContactish(url: string): boolean {
  const p = pathOf(url).toLowerCase();
  return p === '' || p === '/' || /\/(contact|despre|about|echipa|team)$/.test(p);
}

/** Brand label from the domain (the profile summary is free text, unreliable as a name). */
function brandOf(domain: string): string {
  const host = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0] ?? domain;
  return cap(host);
}

/** Realistic target-position band from the current position + whether a page exists. */
function targetBand(pos: number | null, hasPage: boolean): { low: number; high: number } {
  if (pos == null) return hasPage ? { low: 8, high: 15 } : { low: 10, high: 18 };
  if (pos <= 3) return { low: 1, high: 3 };
  if (pos <= 10) return { low: 3, high: 6 };
  if (pos <= 20) return { low: 4, high: 8 };
  return { low: 8, high: 15 };
}

export async function handlePagePlan(job: PgBoss.Job<SiteJob>, boss: PgBoss): Promise<void> {
  const { siteId } = job.data;
  const site = await siteRow(siteId);
  if (!site) throw new Error(`site ${siteId} not found`);

  const crawlId = await latestCompletedCrawlId(siteId);
  if (!crawlId) {
    logger.warn({ siteId }, 'page-plan: no completed crawl');
    return;
  }

  const [profile] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.siteId, siteId));
  const localEmphasis = !!profile?.localEmphasis;
  const primaryCity = profile?.primaryCity ?? null;
  const services = (profile?.services as string[] | null) ?? [];
  const brand = brandOf(site.domain);

  const pageRows = await db.select().from(pagesTable).where(eq(pagesTable.crawlId, crawlId));
  const ownPages: (PageLike & { id: string; metaLen: number })[] = pageRows
    .filter((p) => (p.indexability ?? 'indexable') === 'indexable' && (p.statusCode ?? 200) < 400)
    .map((p) => ({
      id: p.id,
      url: p.url,
      title: p.title,
      h1: p.h1,
      headings: (p.headings as { level: number; text: string }[] | null) ?? [],
      wordCount: p.wordCount,
      schemaTypes: ((p.schema as unknown[] | null) ?? []).filter(
        (x): x is string => typeof x === 'string',
      ),
      metaLen: (p.metaDescription ?? '').length,
    }));
  const pageById = new Map(ownPages.map((p) => [p.url, p]));

  const kwRows = await db.select().from(keywordData).where(eq(keywordData.siteId, siteId));
  const candidates: KeywordCandidate[] = kwRows.map((k) => ({
    id: k.id,
    keyword: k.keyword,
    searchVolume: k.expansionSource === 'keyword_planner' || k.searchVolume > 0 ? k.searchVolume : null,
    competition: k.competition,
    currentPosition: k.currentPosition,
    businessRelevance: k.businessRelevance,
    opportunityScore: k.opportunityScore,
    hasTargetPage: k.hasTargetPage,
  }));
  const kwById = new Map(kwRows.map((k) => [k.id, k]));

  const clusterOfKw = new Map(kwRows.map((k) => [k.id, k.clusterId]));

  const playbooks = await db
    .select({ keywordId: keywordPlaybooks.keywordId, brief: keywordPlaybooks.brief })
    .from(keywordPlaybooks)
    .where(inArray(keywordPlaybooks.keywordId, kwRows.map((k) => k.id)));
  const briefByKw = new Map(playbooks.map((p) => [p.keywordId, p.brief]));

  const compPageRows = await db
    .select()
    .from(competitorPages)
    .innerJoin(competitors, eq(competitors.id, competitorPages.competitorId))
    .where(eq(competitors.siteId, siteId));
  const compLikes: (PageLike & { targetKeywordGuess: string })[] = compPageRows.map((r) => ({
    url: r.competitor_pages.url,
    title: r.competitor_pages.title,
    h1: r.competitor_pages.h1,
    headings: (r.competitor_pages.headings as { level: number; text: string }[] | null) ?? [],
    wordCount: r.competitor_pages.wordCount,
    schemaTypes: ((r.competitor_pages.schema as unknown[] | null) ?? []).filter(
      (x): x is string => typeof x === 'string',
    ),
    targetKeywordGuess: r.competitor_pages.targetKeywordGuess ?? '',
  }));

  const homepageUrl = ownPages.find((p) => pathOf(p.url) === '' || pathOf(p.url) === '/')?.url;
  const assignments = assignPageTargets(ownPages, candidates, {
    primaryCity,
    localEmphasis,
    homepageUrl,
  });

  // Keep user decisions (applied / dismissed) across regenerations.
  const existing = await db
    .select()
    .from(pageBlueprints)
    .where(eq(pageBlueprints.siteId, siteId));
  const lockedByUrl = new Map(
    existing.filter((b) => b.status === 'applied' || b.status === 'dismissed').map((b) => [b.url, b]),
  );

  await db
    .delete(pageBlueprints)
    .where(eq(pageBlueprints.siteId, siteId));

  const upliftLow: number[] = [];
  const upliftMid: number[] = [];
  const upliftHigh: number[] = [];
  let order = 0;

  for (const a of assignments.slice(0, MAX_BLUEPRINTS)) {
    const page = pageById.get(a.url);
    const kwRow = a.targetKeywordId ? kwById.get(a.targetKeywordId) : undefined;
    const kwText = a.targetKeyword ?? kwRow?.keyword ?? null;
    const pos = kwRow?.currentPosition ?? null;
    const vol =
      kwRow && (kwRow.expansionSource === 'keyword_planner' || kwRow.searchVolume > 0)
        ? kwRow.searchVolume
        : null;

    // Best competitor page for this keyword (by shared first token + word count).
    const firstTok = (kwText ?? '').split(/\s+/)[0]?.toLowerCase() ?? '';
    const bestComp =
      compLikes
        .filter((c) => firstTok && (c.targetKeywordGuess.toLowerCase().includes(firstTok) || c.url.toLowerCase().includes(firstTok)))
        .sort((x, y) => y.wordCount - x.wordCount)[0] ?? null;
    const gap = bestComp ? pageContentGap(page ?? null, bestComp) : null;

    // --- recommended structure ---
    const brief = kwRow ? (briefByKw.get(kwRow.id) as { h2s?: string[] } | undefined) : undefined;
    const cityToks = primaryCity ? primaryCity.toLowerCase().split(/\s+/) : [];
    const kwHasCity = cityToks.some((t) => (kwText ?? '').toLowerCase().includes(t));
    const useCity = localEmphasis && primaryCity && !kwHasCity && (a.isHomepage || isContactish(a.url));
    const kwTitleCore = kwText ? cap(kwText) : cap(pathOf(a.url).replace(/[-/]+/g, ' ').trim() || 'Pagină');

    const titleBase = useCity ? `${kwTitleCore} ${primaryCity}` : kwTitleCore;
    let title = `${titleBase} – ${brand}`;
    if (title.length > 60) title = titleBase.slice(0, 57 - brand.length > 10 ? 57 - brand.length : 40).trim() + ` – ${brand}`;
    if (title.length > 60) title = titleBase.slice(0, 60);

    const h1 = useCity && primaryCity ? `${kwTitleCore} ${primaryCity}` : kwTitleCore;

    const svcBit = services.slice(0, 2).join(', ');
    let meta = `${kwTitleCore}${useCity && primaryCity ? ` în ${primaryCity}` : ''}. ${
      svcBit ? `${brand} — ${svcBit}. ` : `${brand}. `
    }Cere o ofertă și vezi cum te putem ajuta.`;
    if (meta.length < 120) meta = meta + ' Rezultate măsurabile și comunicare clară.';
    if (meta.length > 160) {
      const cut = meta.slice(0, 157);
      meta = cut.slice(0, Math.max(120, cut.lastIndexOf(' '))).trimEnd() + '…';
    }

    const h2Set = new Set<string>();
    for (const h of gap?.missingHeadings ?? []) if (h.length > 3) h2Set.add(h);
    for (const h of brief?.h2s ?? []) if (h.length > 3) h2Set.add(h);
    if (h2Set.size === 0 && kwText) {
      for (const h of [
        `Ce include ${kwText}`,
        'Cum lucrăm',
        'Cât costă',
        'De ce noi',
        'Întrebări frecvente',
      ])
        h2Set.add(h);
    }
    const h2Outline = [...h2Set].slice(0, 8);

    const schemaType =
      localEmphasis && isContactish(a.url)
        ? 'LocalBusiness'
        : a.isHomepage
          ? 'Organization'
          : 'Article';

    // Internal links: own pages whose target keyword sits in the same cluster.
    const myCluster = kwRow ? clusterOfKw.get(kwRow.id) : null;
    const linkUrls = myCluster
      ? assignments
          .filter(
            (o) =>
              o.url !== a.url &&
              o.targetKeywordId &&
              clusterOfKw.get(o.targetKeywordId) === myCluster,
          )
          .map((o) => o.url)
          .slice(0, 5)
      : [];

    const compWc = bestComp?.wordCount ?? 0;
    const wordCountTarget = Math.min(2600, Math.max(page?.wordCount ?? 0, compWc, 500));

    // --- potential (interval, honest) ---
    const band = targetBand(pos, !!a.targetKeywordId && a.diagnosis !== 'orphan_page');
    const qualitative = vol == null || vol <= 0;
    const currentClicks = qualitative || pos == null ? null : estimatedClicks(vol!, pos);
    const clicksLow = qualitative ? 0 : estimatedClicks(vol!, band.high);
    const clicksHigh = qualitative ? 0 : estimatedClicks(vol!, band.low);
    const clicksMid = Math.round((clicksLow + clicksHigh) / 2);
    if (!qualitative) {
      upliftLow.push(Math.max(0, clicksLow - (currentClicks ?? 0)));
      upliftMid.push(Math.max(0, clicksMid - (currentClicks ?? 0)));
      upliftHigh.push(Math.max(0, clicksHigh - (currentClicks ?? 0)));
    }

    // --- rationale ---
    const rationale =
      a.diagnosis === 'no_target'
        ? `Pagina nu are un cuvânt cheie clar. Cel mai bun candidat: „${kwText ?? '—'}". Aliniază title, H1 și slug pe el.`
        : a.diagnosis === 'cannibalization'
          ? `Această pagină concurează cu ${a.competingUrls.length} pagină/pagini proprii pe același subiect. Alege o singură pagină pentru „${kwText}" și diferențiază restul.`
          : a.diagnosis === 'orphan_page'
            ? 'Pagina are conținut dar niciun cuvânt cheie din strategie nu i se potrivește. Reorientează-o sau consolideaz-o cu alta.'
            : a.isHomepage
              ? `Homepage-ul ar trebui să țintească termenul principal „${kwText}". Pune-l în title și H1${
                  useCity ? ` cu „${primaryCity}"` : ''
                }, adaugă schema ${schemaType}.`
              : `Optimizează pagina pentru „${kwText}"${
                  pos != null ? ` (acum poziția ${Math.round(pos)})` : ''
                }: title/H1 pe cuvânt, ${h2Outline.length} secțiuni recomandate, schema ${schemaType}.`;

    const locked = lockedByUrl.get(a.url);
    const priority =
      a.isHomepage
        ? 0
        : a.diagnosis === 'no_target'
          ? 1 + order
          : a.diagnosis === 'cannibalization'
            ? 50 + order
            : a.diagnosis === 'orphan_page'
              ? 200 + order
              : 100 + order;
    order++;

    await db
      .insert(pageBlueprints)
      .values({
        siteId,
        pageId: page?.id ?? null,
        url: a.url,
        isHomepage: a.isHomepage,
        targetKeyword: kwText,
        targetKeywordId: a.targetKeywordId,
        secondaryKeywords: a.secondaryKeywordIds
          .map((id) => kwById.get(id)?.keyword)
          .filter((s): s is string => !!s),
        current: {
          title: page?.title ?? null,
          h1: page?.h1 ?? null,
          metaLen: page?.metaLen ?? 0,
          wordCount: page?.wordCount ?? 0,
          schemaTypes: page?.schemaTypes ?? [],
          position: pos,
          monthlyClicks: currentClicks,
        },
        recommended: {
          title,
          h1,
          metaDescription: meta,
          h2Outline,
          schemaType,
          internalLinksOut: linkUrls,
          internalLinksIn: linkUrls,
          wordCountTarget,
        },
        potential: {
          searchVolume: vol,
          currentClicks,
          targetPosLow: band.low,
          targetPosHigh: band.high,
          clicksLow,
          clicksMid,
          clicksHigh,
          qualitative,
        },
        rationale,
        diagnosis: a.diagnosis,
        priority,
        status: locked?.status ?? 'draft',
        appliedResult: locked?.appliedResult ?? null,
      })
      .catch((err) => logger.warn({ err, url: a.url }, 'blueprint insert skipped'));
  }

  const sum = (xs: number[]) => xs.reduce((s, n) => s + n, 0);
  logger.info(
    {
      siteId,
      blueprints: Math.min(assignments.length, MAX_BLUEPRINTS),
      pageUplift: { low: sum(upliftLow), mid: sum(upliftMid), high: sum(upliftHigh) },
    },
    'page-plan done',
  );

  // Refresh the traffic projection so it picks up the bottom-up page potentials.
  await sendNext(boss, 'estimate', { siteId, crawlId });
}
