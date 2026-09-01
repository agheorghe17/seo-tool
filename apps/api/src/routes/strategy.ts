import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  businessProfiles,
  competitorPages,
  competitors,
  db,
  keywordClusters,
  keywordData,
  keywordPlaybooks,
  rankSnapshots,
  roadmapItems,
  serpResults,
  sites,
} from 'db';
import { z } from 'zod';
import { clusterCoverage, pageContentGap, type PageLike } from 'strategy';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { enqueue } from '../queue.js';

async function ownedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

async function ownedKeyword(userId: string, kwId: string) {
  const [row] = await db
    .select({ kw: keywordData, userId: sites.userId })
    .from(keywordData)
    .innerJoin(sites, eq(sites.id, keywordData.siteId))
    .where(eq(keywordData.id, kwId));
  return row && row.userId === userId ? row.kw : null;
}

const profileBody = z.object({
  summary: z.string().max(2000).optional(),
  services: z.array(z.string().max(120)).max(30).optional(),
  locations: z.array(z.string().max(80)).max(30).optional(),
  languages: z.array(z.string().max(10)).max(10).optional(),
  audience: z.string().max(500).optional(),
  // Epic 22 — per-site target market.
  geoCountry: z.string().max(8).optional(),
  geoLanguage: z.string().max(8).optional(),
  primaryCity: z.string().max(80).nullable().optional(),
  localEmphasis: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});

export async function strategyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // --- Business profile ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/profile', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const [row] = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.siteId, site.id));
    return { profile: row ?? null };
  });

  app.put<{ Params: { id: string } }>('/api/sites/:id/profile', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const parsed = profileBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const b = parsed.data;
    const [prev] = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.siteId, site.id));
    // Only overwrite fields that were actually sent — partial updates (e.g. just the
    // target-market config from Settings) must not wipe the rest.
    const values = {
      siteId: site.id,
      summary: b.summary ?? prev?.summary ?? null,
      services: b.services ?? (prev?.services as string[] | undefined) ?? [],
      locations: b.locations ?? (prev?.locations as string[] | undefined) ?? [],
      languages: b.languages?.length ? b.languages : (prev?.languages as string[] | undefined) ?? ['ro'],
      audience: b.audience ?? prev?.audience ?? null,
      geoCountry: b.geoCountry ?? prev?.geoCountry ?? null,
      geoLanguage: b.geoLanguage ?? prev?.geoLanguage ?? null,
      primaryCity: b.primaryCity !== undefined ? b.primaryCity : prev?.primaryCity ?? null,
      localEmphasis: b.localEmphasis ?? prev?.localEmphasis ?? false,
      confirmedAt: b.confirmed ? new Date() : prev?.confirmedAt ?? null,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(businessProfiles)
      .values(values)
      .onConflictDoUpdate({ target: businessProfiles.siteId, set: values })
      .returning();
    await recordAudit(req.userId!, 'strategy.profile.update', site.id);
    return { profile: row };
  });

  // --- Rebuild pipeline ---
  app.post<{ Params: { id: string } }>('/api/sites/:id/strategy/rebuild', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    await enqueue('profile-extract', { siteId: site.id });
    await recordAudit(req.userId!, 'strategy.rebuild', site.id);
    return reply.code(202).send({ queued: true });
  });

  // --- Keyword universe ---
  app.get<{
    Params: { id: string };
    Querystring: { cluster?: string; bucket?: string; intent?: string; rank?: string; limit?: string; offset?: string };
  }>('/api/sites/:id/keywords', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const q = req.query;
    const conds = [eq(keywordData.siteId, site.id)];
    if (q.cluster) conds.push(eq(keywordData.clusterId, q.cluster));
    if (q.bucket) conds.push(eq(keywordData.bucket, q.bucket as never));
    if (q.intent) conds.push(eq(keywordData.intent, q.intent as never));
    if (q.rank === 'ranking') conds.push(sql`${keywordData.currentPosition} is not null`);
    if (q.rank === 'striking')
      conds.push(sql`${keywordData.currentPosition} between 5 and 20`);
    if (q.rank === 'gap') conds.push(sql`${keywordData.currentPosition} is null`);

    const limit = Math.min(Number(q.limit ?? 100), 500);
    const offset = Number(q.offset ?? 0);
    const rows = await db
      .select()
      .from(keywordData)
      .where(and(...conds))
      .orderBy(desc(keywordData.opportunityScore), desc(keywordData.searchVolume))
      .limit(limit)
      .offset(offset);
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(keywordData)
      .where(and(...conds));
    return { keywords: rows, total: Number(n) };
  });

  app.get<{ Params: { id: string; kwId: string } }>(
    '/api/sites/:id/keywords/:kwId',
    async (req, reply) => {
      const kw = await ownedKeyword(req.userId!, req.params.kwId);
      if (!kw || kw.siteId !== req.params.id) return reply.code(404).send({ error: 'not found' });
      const [history, latestSerp, playbook, cluster] = await Promise.all([
        db
          .select()
          .from(rankSnapshots)
          .where(eq(rankSnapshots.keywordId, kw.id))
          .orderBy(asc(rankSnapshots.capturedAt)),
        db
          .select()
          .from(serpResults)
          .where(eq(serpResults.keywordId, kw.id))
          .orderBy(desc(serpResults.capturedAt), asc(serpResults.position))
          .limit(10),
        db.select().from(keywordPlaybooks).where(eq(keywordPlaybooks.keywordId, kw.id)),
        kw.clusterId
          ? db.select().from(keywordClusters).where(eq(keywordClusters.id, kw.clusterId))
          : Promise.resolve([]),
      ]);
      return {
        keyword: kw,
        rankHistory: history,
        serp: latestSerp,
        playbook: playbook[0] ?? null,
        cluster: cluster[0] ?? null,
      };
    },
  );

  app.get<{ Params: { kwId: string } }>('/api/keywords/:kwId/rank-history', async (req, reply) => {
    const kw = await ownedKeyword(req.userId!, req.params.kwId);
    if (!kw) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select({
        capturedAt: rankSnapshots.capturedAt,
        position: rankSnapshots.position,
        source: rankSnapshots.source,
      })
      .from(rankSnapshots)
      .where(eq(rankSnapshots.keywordId, kw.id))
      .orderBy(asc(rankSnapshots.capturedAt));
    return { history: rows };
  });

  // --- Competitors ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/competitors', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select()
      .from(competitors)
      .where(eq(competitors.siteId, site.id))
      .orderBy(asc(competitors.createdAt));
    return { competitors: rows };
  });

  app.post<{ Params: { id: string }; Body: { domain?: string; label?: string } }>(
    '/api/sites/:id/competitors',
    async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });
      const parsed = z
        .object({ domain: z.string().min(3), label: z.string().max(80).optional() })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const domain = parsed.data.domain
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, '')
        .toLowerCase();
      const [row] = await db
        .insert(competitors)
        .values({ siteId: site.id, domain, label: parsed.data.label ?? null, addedBy: 'user' })
        .onConflictDoNothing()
        .returning();
      if (row) {
        await enqueue('competitor-crawl', { siteId: site.id, competitorId: row.id });
        await recordAudit(req.userId!, 'strategy.competitor.add', site.id, { domain });
      }
      return reply.code(201).send({ competitor: row ?? null });
    },
  );

  app.delete<{ Params: { id: string; cId: string } }>(
    '/api/sites/:id/competitors/:cId',
    async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });
      await db
        .delete(competitors)
        .where(and(eq(competitors.id, req.params.cId), eq(competitors.siteId, site.id)));
      return { deleted: true };
    },
  );

  app.get<{ Params: { id: string; cId: string } }>(
    '/api/sites/:id/competitors/:cId/gap',
    async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });
      const [comp] = await db
        .select()
        .from(competitors)
        .where(and(eq(competitors.id, req.params.cId), eq(competitors.siteId, site.id)));
      if (!comp) return reply.code(404).send({ error: 'not found' });

      const [clusters, kws, compPages] = await Promise.all([
        db.select().from(keywordClusters).where(eq(keywordClusters.siteId, site.id)),
        db.select().from(keywordData).where(eq(keywordData.siteId, site.id)),
        db.select().from(competitorPages).where(eq(competitorPages.competitorId, comp.id)),
      ]);

      const coverage = clusterCoverage(
        clusters.map((c) => ({
          name: c.name,
          members: kws.filter((k) => k.clusterId === c.id).map((k) => k.keyword),
        })),
        kws.filter((k) => k.hasTargetPage).map((k) => ({ targetKeyword: k.keyword })),
        compPages.map((p) => ({ targetKeyword: p.targetKeywordGuess ?? '' })),
      );

      // A couple of page-level gap examples for the strongest competitor cluster.
      const examples = compPages
        .filter((p) => p.targetKeywordGuess)
        .slice(0, 8)
        .map((cp) => {
          const cpLike: PageLike = {
            url: cp.url,
            title: cp.title,
            h1: cp.h1,
            headings: (cp.headings as { level: number; text: string }[] | null) ?? [],
            wordCount: cp.wordCount,
            schemaTypes: ((cp.schema as unknown[] | null) ?? []).filter(
              (x): x is string => typeof x === 'string',
            ),
          };
          return { url: cp.url, keyword: cp.targetKeywordGuess, gap: pageContentGap(null, cpLike) };
        });

      return { competitor: comp, coverage, examples };
    },
  );

  // --- Opportunities / roadmap / overview ---
  app.get<{ Params: { id: string } }>('/api/sites/:id/opportunities', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select()
      .from(keywordData)
      .where(
        and(
          eq(keywordData.siteId, site.id),
          inArray(keywordData.bucket, ['quick_win', 'build_content', 'long_game']),
        ),
      )
      .orderBy(desc(keywordData.opportunityScore))
      .limit(200);
    const byBucket = { quick_win: [], build_content: [], long_game: [] } as Record<
      string,
      typeof rows
    >;
    for (const r of rows) (byBucket[r.bucket] ??= []).push(r);
    return { opportunities: byBucket };
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id/roadmap', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select()
      .from(roadmapItems)
      .where(eq(roadmapItems.siteId, site.id))
      .orderBy(asc(roadmapItems.phase), asc(roadmapItems.sortOrder));
    return { roadmap: rows };
  });

  app.patch<{ Params: { itemId: string }; Body: { status?: string } }>(
    '/api/roadmap/:itemId',
    async (req, reply) => {
      const parsed = z
        .object({ status: z.enum(['todo', 'doing', 'done', 'skipped']) })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
      const [row] = await db
        .select({ item: roadmapItems, userId: sites.userId })
        .from(roadmapItems)
        .innerJoin(sites, eq(sites.id, roadmapItems.siteId))
        .where(eq(roadmapItems.id, req.params.itemId));
      if (!row || row.userId !== req.userId!) return reply.code(404).send({ error: 'not found' });
      const [updated] = await db
        .update(roadmapItems)
        .set({
          status: parsed.data.status,
          doneAt: parsed.data.status === 'done' ? new Date() : null,
        })
        .where(eq(roadmapItems.id, req.params.itemId))
        .returning();
      return { item: updated };
    },
  );

  app.get<{ Params: { id: string } }>('/api/sites/:id/strategy/overview', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const [agg] = await db
      .select({
        total: sql<number>`count(*)::int`,
        ranking: sql<number>`count(*) filter (where ${keywordData.currentPosition} is not null)::int`,
        top10: sql<number>`count(*) filter (where ${keywordData.currentPosition} <= 10)::int`,
        top3: sql<number>`count(*) filter (where ${keywordData.currentPosition} <= 3)::int`,
        striking: sql<number>`count(*) filter (where ${keywordData.currentPosition} between 5 and 20)::int`,
        avgPos: sql<number>`round(avg(${keywordData.currentPosition})::numeric, 1)`,
      })
      .from(keywordData)
      .where(eq(keywordData.siteId, site.id));

    const [profile] = await db
      .select()
      .from(businessProfiles)
      .where(eq(businessProfiles.siteId, site.id));
    const roadmap = await db
      .select({ status: roadmapItems.status })
      .from(roadmapItems)
      .where(eq(roadmapItems.siteId, site.id));
    const done = roadmap.filter((r) => r.status === 'done').length;

    return {
      overview: {
        hasProfile: !!profile,
        profileConfirmed: !!profile?.confirmedAt,
        keywords: Number(agg?.total ?? 0),
        ranking: Number(agg?.ranking ?? 0),
        top10: Number(agg?.top10 ?? 0),
        top3: Number(agg?.top3 ?? 0),
        striking: Number(agg?.striking ?? 0),
        avgPosition: agg?.avgPos != null ? Number(agg.avgPos) : null,
        roadmapTotal: roadmap.length,
        roadmapDone: done,
      },
    };
  });
}
