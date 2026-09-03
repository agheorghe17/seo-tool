import type { FastifyInstance } from 'fastify';
import { and, asc, avg, desc, eq, gte, inArray, sql } from 'drizzle-orm';
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
  trafficEstimates,
} from 'db';
import {
  auditInternalLinks,
  detectDecay,
  recommendArchitecture,
  type LinkPage,
} from 'strategy';
import { fetchAndExtract } from 'crawler';
import { estimatedClicks } from 'shared';
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
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>(
    '/api/sites/:id/pipeline',
    async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });

      // `since` scopes the strip to a single run (set when the user hits "Reface
      // strategia"), so old / retried rows from earlier runs can't make finished
      // steps flicker back to "running".
      const since = req.query.since ? new Date(req.query.since) : null;
      const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

      const rows = await db
        .select({
          type: jobRuns.type,
          status: jobRuns.status,
          error: jobRuns.error,
          attempts: jobRuns.attempts,
          startedAt: jobRuns.startedAt,
          finishedAt: jobRuns.finishedAt,
        })
        .from(jobRuns)
        .where(
          validSince
            ? and(eq(jobRuns.siteId, site.id), gte(jobRuns.startedAt, validSince))
            : eq(jobRuns.siteId, site.id),
        )
        .orderBy(desc(jobRuns.startedAt))
        .limit(120);

      // Newest row per type (within the window). A failed row is only shown if no
      // later attempt of the same type succeeded.
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const prev = latest.get(r.type);
        if (!prev) latest.set(r.type, r);
        else if (prev.status === 'failed' && r.status === 'ok') latest.set(r.type, r);
      }
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
          return {
            type: t,
            status: r.status,
            error: r.error,
            attempts: r.attempts ?? 1,
            at: r.finishedAt ?? r.startedAt,
            startedAt: r.startedAt,
            durationMs:
              r.finishedAt && r.startedAt
                ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()
                : null,
          };
        });
      const running = steps.some((s) => s.status === 'running');
      return { steps, running };
    },
  );

  // --- Compact 30/60/90 action plan with per-action traffic estimates ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/action-plan', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const [blueprints, roadmap, kwRows, estRow] = await Promise.all([
      db
        .select()
        .from(pageBlueprints)
        .where(eq(pageBlueprints.siteId, site.id))
        .orderBy(asc(pageBlueprints.priority)),
      db
        .select()
        .from(roadmapItems)
        .where(eq(roadmapItems.siteId, site.id))
        .orderBy(asc(roadmapItems.phase), asc(roadmapItems.sortOrder)),
      db.select().from(keywordData).where(eq(keywordData.siteId, site.id)),
      db
        .select()
        .from(trafficEstimates)
        .where(eq(trafficEstimates.siteId, site.id))
        .orderBy(desc(trafficEstimates.generatedAt))
        .limit(1),
    ]);
    const kwById = new Map(kwRows.map((k) => [k.id, k]));

    function bandFor(pos: number | null, hasPage: boolean): { low: number; high: number } {
      if (pos == null) return hasPage ? { low: 8, high: 15 } : { low: 10, high: 18 };
      if (pos <= 3) return { low: 1, high: 3 };
      if (pos <= 10) return { low: 3, high: 6 };
      if (pos <= 20) return { low: 4, high: 8 };
      return { low: 8, high: 15 };
    }

    type Action = {
      id: string;
      kind: 'blueprint' | 'roadmap';
      title: string;
      why: string | null;
      url: string | null;
      keyword: string | null;
      currentPosition: number | null;
      targetPosLow: number | null;
      targetPosHigh: number | null;
      addClicksLow: number;
      addClicksHigh: number;
      qualitative: boolean;
      status: string;
      effort: number | null;
      impact: number | null;
    };

    const byPhase: Record<30 | 60 | 90, Action[]> = { 30: [], 60: [], 90: [] };

    // Blueprints → actions. Homepage + structural problems land in phase 30;
    // the rest split by potential (bigger first).
    const live = blueprints.filter((b) => b.status !== 'dismissed');
    const ranked = [...live].sort(
      (a, b) => (b.potential?.clicksHigh ?? 0) - (a.potential?.clicksHigh ?? 0),
    );
    live.forEach((b) => {
      const p = b.potential;
      const cur = p?.currentClicks ?? 0;
      const qualitative = !p || p.qualitative;
      const phase: 30 | 60 | 90 =
        b.isHomepage || b.diagnosis !== 'ok'
          ? 30
          : ranked.indexOf(b) < Math.ceil(ranked.length / 2)
            ? 60
            : 90;
      byPhase[phase].push({
        id: b.id,
        kind: 'blueprint',
        title: b.isHomepage
          ? `Homepage → „${b.targetKeyword ?? '—'}"`
          : `${new URL(b.url).pathname} → „${b.targetKeyword ?? '—'}"`,
        why: b.rationale,
        url: b.url,
        keyword: b.targetKeyword,
        currentPosition: b.current?.position ?? null,
        targetPosLow: p?.targetPosLow ?? null,
        targetPosHigh: p?.targetPosHigh ?? null,
        addClicksLow: qualitative ? 0 : Math.max(0, (p!.clicksLow ?? 0) - cur),
        addClicksHigh: qualitative ? 0 : Math.max(0, (p!.clicksHigh ?? 0) - cur),
        qualitative,
        status: b.status,
        effort: null,
        impact: null,
      });
    });

    // Roadmap items → actions, keyed to their own phase.
    for (const r of roadmap) {
      const phase = (r.phase === 60 ? 60 : r.phase === 90 ? 90 : 30) as 30 | 60 | 90;
      const kw = r.keywordId ? kwById.get(r.keywordId) : undefined;
      const vol = kw && kw.searchVolume > 0 ? kw.searchVolume : null;
      const pos = kw?.currentPosition ?? null;
      const band = bandFor(pos, !!kw?.hasTargetPage);
      const cur = vol != null ? estimatedClicks(vol, pos ?? 20) : 0;
      byPhase[phase].push({
        id: r.id,
        kind: 'roadmap',
        title: r.title,
        why: r.why,
        url: null,
        keyword: kw?.keyword ?? null,
        currentPosition: pos,
        targetPosLow: vol != null ? band.low : null,
        targetPosHigh: vol != null ? band.high : null,
        addClicksLow: vol != null ? Math.max(0, estimatedClicks(vol, band.high) - cur) : 0,
        addClicksHigh: vol != null ? Math.max(0, estimatedClicks(vol, band.low) - cur) : 0,
        qualitative: vol == null,
        status: r.status,
        effort: r.effort,
        impact: r.impact,
      });
    }

    const est = estRow[0];
    let cumLow = 0;
    let cumHigh = 0;
    const phases = ([30, 60, 90] as const).map((days) => {
      const actions = byPhase[days];
      const addLow = actions.reduce((s, a) => s + a.addClicksLow, 0);
      const addHigh = actions.reduce((s, a) => s + a.addClicksHigh, 0);
      cumLow += addLow;
      cumHigh += addHigh;
      return {
        days,
        actions,
        addClicksLow: Math.round(addLow),
        addClicksHigh: Math.round(addHigh),
        cumulativeClicksLow: Math.round(cumLow),
        cumulativeClicksHigh: Math.round(cumHigh),
      };
    });

    const allActions = phases.flatMap((p) => p.actions);
    return {
      phases,
      baselineMonthlyVisits: est?.baselineMonthlyVisits ?? 0,
      baselineSource: est?.baselineSource ?? 'keyword_model',
      confidence: est?.confidenceLevel ?? 'low',
      projectionPhases: est?.phases ?? [],
      assumptions: est?.assumptions ?? [],
      totals: {
        actions: allActions.length,
        done: allActions.filter((a) => a.status === 'done' || a.status === 'applied').length,
        clicksLow: Math.round(cumLow),
        clicksHigh: Math.round(cumHigh),
      },
    };
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
