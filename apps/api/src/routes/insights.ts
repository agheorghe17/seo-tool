import type { FastifyInstance } from 'fastify';
import { and, avg, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  crawls,
  db,
  issues,
  jobRuns,
  keywordClusters,
  keywordData,
  interventions,
  pageBlueprints,
  pageTrafficHistory,
  pages,
  recommendations,
  roadmapItems,
  sites,
} from 'db';
import {
  auditInternalLinks,
  detectDecay,
  recommendArchitecture,
  type LinkPage,
} from 'strategy';
import { fetchAndExtract } from 'crawler';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { recordIntervention } from '../lib/interventions.js';

const UA = process.env.CRAWL_USER_AGENT ?? 'SeoToolBot/0.1 (+verify)';

async function ownedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

async function latestScoredCrawlId(siteId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: crawls.id })
    .from(crawls)
    .where(and(eq(crawls.siteId, siteId), inArray(crawls.status, ['completed', 'partial'])))
    .orderBy(desc(crawls.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // --- D1: interventions ledger ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/interventions', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select()
      .from(interventions)
      .where(eq(interventions.siteId, site.id))
      .orderBy(desc(interventions.appliedAt))
      .limit(200);
    const measured = rows.filter((r) => r.outcome !== 'pending');
    const gains = measured.filter((r) => r.outcome === 'gain');
    const avgDelta = gains.length
      ? Math.round(
          (gains.reduce((s, r) => s + (r.deltaPosition ?? 0), 0) / gains.length) * 10,
        ) / 10
      : null;
    return {
      interventions: rows,
      summary: {
        total: rows.length,
        pending: rows.length - measured.length,
        gains: gains.length,
        losses: measured.filter((r) => r.outcome === 'loss').length,
        avgPositionGain: avgDelta,
      },
    };
  });

  // --- D3: content-decay radar ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/decay', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const hist = await db
      .select({
        url: pageTrafficHistory.url,
        month: pageTrafficHistory.month,
        clicks: pageTrafficHistory.clicks,
        impressions: pageTrafficHistory.impressions,
        position: pageTrafficHistory.position,
      })
      .from(pageTrafficHistory)
      .where(eq(pageTrafficHistory.siteId, site.id));
    return { findings: detectDecay(hist), hasHistory: hist.length > 0, gscConnected: site.gscConnected };
  });

  // --- D4: internal-link engine ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/internal-links', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const crawlId = await latestScoredCrawlId(site.id);
    if (!crawlId) return { audit: null, reason: 'no completed crawl' };

    const [pageRows, blueprints, kws] = await Promise.all([
      db
        .select({
          url: pages.url,
          indexability: pages.indexability,
          internalLinks: pages.internalLinks,
          mainText: pages.mainText,
        })
        .from(pages)
        .where(eq(pages.crawlId, crawlId)),
      db
        .select({ url: pageBlueprints.url, targetKeyword: pageBlueprints.targetKeyword, targetKeywordId: pageBlueprints.targetKeywordId })
        .from(pageBlueprints)
        .where(eq(pageBlueprints.siteId, site.id)),
      db
        .select({ id: keywordData.id, clusterId: keywordData.clusterId, opportunityScore: keywordData.opportunityScore })
        .from(keywordData)
        .where(eq(keywordData.siteId, site.id)),
    ]);
    const kwById = new Map(kws.map((k) => [k.id, k]));
    const bpByUrl = new Map(blueprints.map((b) => [b.url.replace(/\/+$/, ''), b]));

    const linkPages: LinkPage[] = pageRows.map((p) => {
      const bp = bpByUrl.get(p.url.replace(/\/+$/, ''));
      const kw = bp?.targetKeywordId ? kwById.get(bp.targetKeywordId) : undefined;
      return {
        url: p.url,
        mainText: p.mainText,
        internalLinks: (p.internalLinks as { url: string; anchor: string }[] | null) ?? [],
        targetKeyword: bp?.targetKeyword ?? null,
        clusterId: kw?.clusterId ?? null,
        opportunityScore: kw?.opportunityScore ?? null,
        indexable: (p.indexability ?? 'indexable') === 'indexable',
      };
    });

    return { audit: auditInternalLinks(linkPages) };
  });

  app.post<{ Params: { id: string } }>('/api/sites/:id/internal-links/done', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const b = z
      .object({ fromUrl: z.string(), toUrl: z.string(), anchor: z.string().max(160) })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    await recordIntervention({
      siteId: site.id,
      kind: 'internal_link',
      category: 'onpage',
      targetUrl: b.data.toUrl,
      label: `Link intern adăugat: „${b.data.anchor}" din ${b.data.fromUrl}`,
    });
    return { ok: true };
  });

  // --- D6: architecture recommendation ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/architecture', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const [clusters, kws, blueprints] = await Promise.all([
      db.select().from(keywordClusters).where(eq(keywordClusters.siteId, site.id)),
      db.select().from(keywordData).where(eq(keywordData.siteId, site.id)),
      db.select().from(pageBlueprints).where(eq(pageBlueprints.siteId, site.id)),
    ]);
    const archClusters = clusters.map((c) => ({
      id: c.id,
      name: c.name,
      members: kws.filter((k) => k.clusterId === c.id).map((k) => k.keyword),
    }));
    const kwById = new Map(kws.map((k) => [k.id, k]));
    const assignments = blueprints.map((b) => ({
      url: b.url,
      targetKeyword: b.targetKeyword,
      clusterId: b.targetKeywordId ? kwById.get(b.targetKeywordId)?.clusterId ?? null : null,
      isHomepage: b.isHomepage,
    }));
    return { architecture: recommendArchitecture(archClusters, assignments) };
  });

  // --- Phase A: pipeline status ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/pipeline', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select({
        type: jobRuns.type,
        status: jobRuns.status,
        error: jobRuns.error,
        startedAt: jobRuns.startedAt,
        finishedAt: jobRuns.finishedAt,
      })
      .from(jobRuns)
      .where(eq(jobRuns.siteId, site.id))
      .orderBy(desc(jobRuns.startedAt))
      .limit(60);
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.type)) latest.set(r.type, r);
    const order = [
      'crawl',
      'profile-extract',
      'keyword-research',
      'rank-import',
      'competitor-crawl',
      'strategy-build',
      'page-plan',
      'traffic-history',
      'estimate',
    ];
    const steps = order
      .filter((t) => latest.has(t))
      .map((t) => {
        const r = latest.get(t)!;
        return { type: t, status: r.status, error: r.error, at: r.finishedAt ?? r.startedAt };
      });
    const running = steps.some((s) => s.status === 'running');
    return { steps, running };
  });

  // --- D7: agency portfolio ---
  app.get('/api/portfolio', async (req, reply) => {
    const owned = await db.select().from(sites).where(eq(sites.userId, req.userId!));
    if (owned.length === 0) return reply.send({ sites: [] });

    const out = [];
    for (const s of owned) {
      const crawlId = await latestScoredCrawlId(s.id);
      let health: number | null = null;
      let ai: number | null = null;
      if (crawlId) {
        const [agg] = await db
          .select({ total: avg(pages.scoreTotal), geo: avg(pages.scoreGeo) })
          .from(pages)
          .where(eq(pages.crawlId, crawlId));
        health = agg?.total == null ? null : Math.round(Number(agg.total));
        ai = agg?.geo == null ? null : Math.round(Number(agg.geo));
      }
      let openRecoN = 0;
      if (crawlId) {
        const [openReco] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(recommendations)
          .innerJoin(issues, eq(issues.id, recommendations.issueId))
          .innerJoin(pages, eq(pages.id, issues.pageId))
          .where(and(eq(pages.crawlId, crawlId), eq(recommendations.applied, false)));
        openRecoN = Number(openReco?.n ?? 0);
      }
      const [rm] = await db
        .select({ n: sql<number>`count(*) filter (where ${roadmapItems.status} = 'todo')::int` })
        .from(roadmapItems)
        .where(eq(roadmapItems.siteId, s.id));
      const [pend] = await db
        .select({ n: sql<number>`count(*) filter (where ${interventions.outcome} = 'pending')::int` })
        .from(interventions)
        .where(eq(interventions.siteId, s.id));
      const [decayRow] = await db
        .select({ n: sql<number>`count(distinct ${pageTrafficHistory.url})::int` })
        .from(pageTrafficHistory)
        .where(eq(pageTrafficHistory.siteId, s.id));

      const lastCrawl = await db
        .select({ at: crawls.completedAt, createdAt: crawls.createdAt })
        .from(crawls)
        .where(eq(crawls.siteId, s.id))
        .orderBy(desc(crawls.createdAt))
        .limit(1);
      const lastAt = lastCrawl[0]?.at ?? lastCrawl[0]?.createdAt ?? null;
      const staleScan = lastAt ? Date.now() - new Date(lastAt).getTime() > 30 * 86_400_000 : true;

      const openTasks = openRecoN + Number(rm?.n ?? 0);
      const needsAttention =
        (health != null && health < 60) || staleScan || Number(pend?.n ?? 0) > 0 || !crawlId;

      out.push({
        id: s.id,
        domain: s.domain,
        health,
        aiVisibility: ai,
        openTasks,
        pendingInterventions: Number(pend?.n ?? 0),
        decayPages: Number(decayRow?.n ?? 0),
        lastScanAt: lastAt,
        needsAttention,
        nextAction: !crawlId
          ? 'Pornește primul scan'
          : staleScan
            ? 'Scanează din nou (peste 30 de zile)'
            : openTasks > 0
              ? `${openTasks} acțiuni de aprobat`
              : 'La zi',
      });
    }
    out.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));
    return { sites: out };
  });

  // --- D8: guided-step verification ---
  app.post<{ Params: { id: string } }>('/api/sites/:id/verify-step', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const b = z
      .object({
        url: z.string().url(),
        check: z.enum(['title_contains', 'h1_contains', 'meta_length', 'link_present', 'schema_present']),
        value: z.string().max(200).optional(),
      })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });

    let page;
    try {
      page = await fetchAndExtract(b.data.url, UA);
    } catch (err) {
      return reply.code(502).send({ error: `nu am putut încărca pagina: ${String(err)}` });
    }
    const v = (b.data.value ?? '').toLowerCase();
    let pass = false;
    let found = '';
    switch (b.data.check) {
      case 'title_contains':
        found = page.title ?? '';
        pass = found.toLowerCase().includes(v);
        break;
      case 'h1_contains':
        found = page.h1 ?? '';
        pass = found.toLowerCase().includes(v);
        break;
      case 'meta_length': {
        const len = (page.metaDescription ?? '').length;
        found = `${len} caractere`;
        pass = len >= 120 && len <= 160;
        break;
      }
      case 'link_present':
        found = `${(page.internalLinks ?? []).length} linkuri interne`;
        pass = (page.internalLinks ?? []).some((l) => l.url.replace(/\/+$/, '').includes(v.replace(/\/+$/, '')));
        break;
      case 'schema_present':
        found = page.schemaTypes.join(', ') || 'niciuna';
        pass = page.schemaTypes.map((t) => t.toLowerCase()).includes(v);
        break;
    }
    return { pass, found };
  });
}
