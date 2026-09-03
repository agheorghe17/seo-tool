import type PgBoss from 'pg-boss';
import { eq, inArray } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  contentDrafts,
  db,
  keywordClusters,
  keywordData,
  keywordPlaybooks,
  pageBlueprints,
  pages as pagesTable,
} from 'db';
import { estimatedClicks } from 'shared';
import {
  assignPageTargets,
  pageContentGap,
  planBlogArticles,
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

/** Legal / system / transactional pages that are never meant to rank — no blueprint. */
function isUtilityPage(url: string): boolean {
  const p = pathOf(url).toLowerCase();
  return (
    /(politica|policy|confidential|privacy|termeni|terms|conditii|cookie|gdpr|disclaimer|sitemap|harta-site)/.test(
      p,
    ) ||
    /\/(cos|cart|checkout|comanda|cont|my-account|account|login|autentificare|inregistrare|register|wishlist|multumim|thank-you|thank_you|404)(\/|$)/.test(
      p,
    ) ||
    /\/(cauta|search|tag|eticheta|autor|author|page)\//.test(p) ||
    /\.(xml|txt|rss)$/.test(p)
  );
}

/** Generic "what kind of business" words — used to keep the homepage on a category term. */
const BUSINESS_WORDS = [
  'agentie',
  'agenție',
  'servicii',
  'serviciu',
  'companie',
  'firma',
  'firmă',
  'studio',
  'consultanta',
  'consultanță',
  'birou',
  'cabinet',
  'clinica',
  'clinică',
  'magazin',
  'atelier',
];

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
    .filter(
      (p) =>
        (p.indexability ?? 'indexable') === 'indexable' &&
        (p.statusCode ?? 200) < 400 &&
        !isUtilityPage(p.url),
    )
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
  const summaryNouns = (profile?.summary ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4);
  const assignments = assignPageTargets(ownPages, candidates, {
    primaryCity,
    localEmphasis,
    homepageUrl,
    businessTerms: [...BUSINESS_WORDS, ...summaryNouns],
    minRelevance: 30,
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

    // A non-homepage page with no relevant keyword gets no blueprint — better an
    // honest gap than a fabricated target on a support/legal/thin page.
    if (!kwText && !a.isHomepage) continue;
    const pos = kwRow?.currentPosition ?? null;
    let vol =
      kwRow && (kwRow.expansionSource === 'keyword_planner' || kwRow.searchVolume > 0)
        ? kwRow.searchVolume
        : null;

    // Homepage/contact often target a local long-tail ("{service} {city}") the
    // Keyword Planner has no data for. Fall back to the volume of the closest
    // broader term (same words minus the city) so the potential isn't blank.
    let volumeProxyKeyword: string | null = null;
    if ((vol == null || vol <= 0) && kwText) {
      const cityToksLc = (primaryCity ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const coreToks = kwText
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1 && !cityToksLc.includes(w));
      if (coreToks.length >= 2) {
        const proxy = kwRows
          .filter((k) => {
            const kt = k.keyword.toLowerCase();
            return k.searchVolume > 0 && coreToks.every((t) => kt.includes(t));
          })
          .sort((a, b) => b.searchVolume - a.searchVolume)[0];
        if (proxy) {
          vol = proxy.searchVolume;
          volumeProxyKeyword = proxy.keyword;
        }
      }
    }

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

    // --- rationale — cite the actual signals, not a fixed template ---
    const rel = kwRow?.businessRelevance ?? null;
    const volBit = vol != null && vol > 0 ? `~${vol} căutări/lună` : 'volum de căutare necunoscut';
    const posBit =
      pos != null ? `acum ești pe poziția ~${Math.round(pos)}` : 'nu rankezi încă pentru el';
    const relBit = rel != null ? `relevanță ${rel}/100 față de serviciile tale` : '';
    const signals = [volBit, posBit, relBit].filter(Boolean).join(', ');

    let rationale: string;
    if (!kwText) {
      rationale =
        'Nicio potrivire relevantă din universul de cuvinte. Poate e o pagină de suport/legală (nu are nevoie de un cuvânt țintă) sau alege manual ținta.';
    } else if (a.diagnosis === 'cannibalization') {
      rationale = `Concurează cu ${a.competingUrls.length} pagină/pagini proprii pe „${kwText}". Ține o singură pagină pentru el (asta) și reorientează restul.`;
    } else if (a.diagnosis === 'orphan_page') {
      rationale = `Are conținut dar niciun cuvânt din strategie nu i se potrivește bine. Cel mai apropiat: „${kwText}" — dacă nu se leagă, consolideaz-o cu altă pagină.`;
    } else if (a.isHomepage) {
      rationale = `Homepage-ul reprezintă tot business-ul, deci țintește un termen de categorie, nu un serviciu anume: „${kwText}" (${signals}). Pune-l în title și H1${
        useCity ? ` cu „${primaryCity}"` : ''
      }, adaugă schema ${schemaType}.`;
    } else {
      rationale = `Pe baza titlului/H1/slug-ului, pagina asta se potrivește cel mai bine cu „${kwText}" (${signals}). Aliniază title și H1 pe el, adaugă ${h2Outline.length} secțiuni și schema ${schemaType}.`;
    }

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
          volumeProxyKeyword,
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

  // --- Phase 4: supporting blog-article plan (new pages + internal links to pillars) ---
  const clusterRows = await db
    .select({ id: keywordClusters.id, name: keywordClusters.name })
    .from(keywordClusters)
    .where(eq(keywordClusters.siteId, siteId));
  const blueprintTargetKwIds = new Set(
    assignments.map((a) => a.targetKeywordId).filter((x): x is string => !!x),
  );
  // Pillar per cluster = the blueprint whose target keyword sits in that cluster (best fit).
  const pillars = assignments
    .filter((a) => a.targetKeywordId && a.diagnosis !== 'orphan_page')
    .map((a) => ({
      clusterId: clusterOfKw.get(a.targetKeywordId!) ?? null,
      url: a.url,
      keyword: a.targetKeyword,
    }))
    .filter((p) => p.clusterId);
  const seenPillarCluster = new Set<string>();
  const pillarList = pillars.filter((p) => {
    if (seenPillarCluster.has(p.clusterId!)) return false;
    seenPillarCluster.add(p.clusterId!);
    return true;
  });
  // Competitor articles per cluster (by target-keyword-guess token overlap with own keywords).
  const compCounts = clusterRows.map((c) => {
    const clusterKws = kwRows.filter((k) => k.clusterId === c.id).map((k) => k.keyword.toLowerCase());
    const firstToks = new Set(clusterKws.map((k) => k.split(/\s+/)[0]).filter(Boolean));
    const count = compPageRows.filter((r) => {
      const g = (r.competitor_pages.targetKeywordGuess ?? '').toLowerCase();
      return [...firstToks].some((t) => t && g.includes(t));
    }).length;
    return { clusterId: c.id, count };
  });

  const blogPlan = planBlogArticles(
    kwRows.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      clusterId: k.clusterId,
      intent: k.intent,
      searchVolume: k.expansionSource === 'keyword_planner' || k.searchVolume > 0 ? k.searchVolume : null,
      businessRelevance: k.businessRelevance,
      opportunityScore: k.opportunityScore,
      hasTargetPage: k.hasTargetPage,
    })),
    clusterRows,
    pillarList as { clusterId: string | null; url: string; keyword: string | null }[],
    compCounts,
    { estimatedClicks, blueprintTargetKeywordIds: blueprintTargetKwIds },
  );

  // Upsert the plan into content_drafts (kind='supporting'), keeping user work.
  const existingDrafts = await db
    .select({
      id: contentDrafts.id,
      keywordId: contentDrafts.keywordId,
      status: contentDrafts.status,
      kind: contentDrafts.kind,
    })
    .from(contentDrafts)
    .where(eq(contentDrafts.siteId, siteId));
  const draftByKw = new Map(existingDrafts.filter((d) => d.keywordId).map((d) => [d.keywordId!, d]));
  const planKwIds = new Set(blogPlan.articles.map((a) => a.keywordId));

  for (const art of blogPlan.articles) {
    const ex = draftByKw.get(art.keywordId);
    const values = {
      cluster: art.cluster,
      pillarKeyword: art.linkToLabel,
      linkTo: art.linkTo,
      linkToLabel: art.linkToLabel,
      anchor: art.anchor,
      secondaryKeywords: art.secondaryKeywords,
      targetWords: art.targetWords,
      phase: art.phase,
      estClicks: art.estClicks,
    };
    if (ex) {
      // Don't disturb an article the user is already writing / has published.
      if (ex.status === 'idea' || ex.status === 'prompt_ready') {
        await db.update(contentDrafts).set({ ...values, kind: 'supporting', updatedAt: new Date() }).where(eq(contentDrafts.id, ex.id));
      }
    } else {
      await db
        .insert(contentDrafts)
        .values({
          siteId,
          keywordId: art.keywordId,
          kind: 'supporting',
          status: 'idea',
          title: `${cap(art.keyword)}`.slice(0, 200),
          ...values,
        })
        .catch((err) => logger.warn({ err, kw: art.keyword }, 'blog draft insert skipped'));
    }
  }
  // Drop supporting 'idea' rows that fell out of the plan.
  const stale = existingDrafts.filter(
    (d) => d.keywordId && !planKwIds.has(d.keywordId) && d.status === 'idea' && d.kind === 'supporting',
  );
  for (const d of stale) {
    await db
      .delete(contentDrafts)
      .where(eq(contentDrafts.id, d.id))
      .catch(() => {});
  }

  logger.info(
    {
      siteId,
      blueprints: Math.min(assignments.length, MAX_BLUEPRINTS),
      pageUplift: { low: sum(upliftLow), mid: sum(upliftMid), high: sum(upliftHigh) },
      blogArticles: blogPlan.totalRecommended,
    },
    'page-plan done',
  );

  // Refresh the traffic projection so it picks up the bottom-up page + article potentials.
  await sendNext(boss, 'estimate', { siteId, crawlId });
  // Advisory AI review of the fresh plan (no-op unless LLM_PROVIDER is set).
  await sendNext(boss, 'seo-agent', { siteId });
}
