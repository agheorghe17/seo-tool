import type { FastifyInstance } from 'fastify';
import { and, avg, count, desc, eq, sql } from 'drizzle-orm';
import { crawls, db, issues, pages, sites, users } from 'db';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { enqueue } from '../queue.js';

async function ownedCrawl(userId: string, crawlId: string) {
  const [row] = await db
    .select({ crawl: crawls, siteUserId: sites.userId })
    .from(crawls)
    .innerJoin(sites, eq(sites.id, crawls.siteId))
    .where(eq(crawls.id, crawlId));
  if (!row || row.siteUserId !== userId) return null;
  return row.crawl;
}

export async function crawlRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // POST /api/sites/:id/crawls — Epic 2.6: enqueue, return immediately.
  app.post<{ Params: { id: string } }>('/api/sites/:id/crawls', async (req, reply) => {
    const [site] = await db
      .select()
      .from(sites)
      .where(and(eq(sites.id, req.params.id), eq(sites.userId, req.userId!)));
    if (!site) return reply.code(404).send({ error: 'not found' });
    if (!site.verifiedAt) return reply.code(409).send({ error: 'site not verified' });

    // Epic 10.3 — monthly page quota.
    const [me] = await db.select().from(users).where(eq(users.id, req.userId!));
    if (me && me.quotaUsed >= me.quotaPagesMonth) {
      return reply
        .code(429)
        .send({ error: 'monthly page quota reached', quotaUsed: me.quotaUsed, quota: me.quotaPagesMonth });
    }

    const running = await db
      .select({ id: crawls.id })
      .from(crawls)
      .where(and(eq(crawls.siteId, site.id), eq(crawls.status, 'running')));
    if (running.length > 0) {
      return reply.code(409).send({ error: 'a crawl is already running', crawlId: running[0]!.id });
    }

    const [crawl] = await db
      .insert(crawls)
      .values({ siteId: site.id, status: 'queued' })
      .returning();
    await enqueue('crawl', { crawlId: crawl!.id, siteId: site.id });
    await recordAudit(req.userId!, 'crawl.start', crawl!.id, { siteId: site.id });

    return reply.code(202).send({ crawlId: crawl!.id, status: 'queued' });
  });

  // GET /api/crawls/:id — Epic 2.7: status + progress.
  app.get<{ Params: { id: string } }>('/api/crawls/:id', async (req, reply) => {
    const crawl = await ownedCrawl(req.userId!, req.params.id);
    if (!crawl) return reply.code(404).send({ error: 'not found' });
    const pct =
      crawl.pagesTotal > 0 ? Math.round((crawl.pagesScanned / crawl.pagesTotal) * 100) : 0;
    return { crawl: { ...crawl, progressPct: pct } };
  });

  // GET /api/crawls/:id/pages — list pages + scores.
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    '/api/crawls/:id/pages',
    async (req, reply) => {
      const crawl = await ownedCrawl(req.userId!, req.params.id);
      if (!crawl) return reply.code(404).send({ error: 'not found' });
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const offset = Number(req.query.offset ?? 0);
      const rows = await db
        .select()
        .from(pages)
        .where(eq(pages.crawlId, crawl.id))
        .orderBy(desc(pages.scoreTotal))
        .limit(limit)
        .offset(offset);
      return { pages: rows };
    },
  );

  // GET /api/crawls/:id/summary — Epic 8.3: category averages + issue severity counts.
  app.get<{ Params: { id: string } }>('/api/crawls/:id/summary', async (req, reply) => {
    const crawl = await ownedCrawl(req.userId!, req.params.id);
    if (!crawl) return reply.code(404).send({ error: 'not found' });

    const [agg] = await db
      .select({
        pages: count(),
        technical: avg(pages.scoreTechnical),
        cwv: avg(pages.scoreCwv),
        onpage: avg(pages.scoreOnpage),
        content: avg(pages.scoreContent),
        geo: avg(pages.scoreGeo),
        total: avg(pages.scoreTotal),
      })
      .from(pages)
      .where(eq(pages.crawlId, crawl.id));

    const severity = await db
      .select({ severity: issues.severity, n: count() })
      .from(issues)
      .innerJoin(pages, eq(pages.id, issues.pageId))
      .where(eq(pages.crawlId, crawl.id))
      .groupBy(issues.severity);

    const num = (v: unknown) => (v == null ? null : Math.round(Number(v)));
    return {
      summary: {
        pages: Number(agg?.pages ?? 0),
        scores: {
          technical: num(agg?.technical),
          cwv: num(agg?.cwv),
          onpage: num(agg?.onpage),
          content: num(agg?.content),
          geo: num(agg?.geo),
          total: num(agg?.total),
        },
        issues: Object.fromEntries(severity.map((s) => [s.severity, Number(s.n)])),
      },
    };
  });

  // GET /api/pages/:id — single page row (ownership via crawl -> site).
  app.get<{ Params: { id: string } }>('/api/pages/:id', async (req, reply) => {
    const [row] = await db
      .select({ page: pages, userId: sites.userId, crawlId: crawls.id, siteId: sites.id })
      .from(pages)
      .innerJoin(crawls, eq(crawls.id, pages.crawlId))
      .innerJoin(sites, eq(sites.id, crawls.siteId))
      .where(eq(pages.id, req.params.id));
    if (!row || row.userId !== req.userId!) return reply.code(404).send({ error: 'not found' });
    return { page: row.page, crawlId: row.crawlId, siteId: row.siteId };
  });

  // DELETE /api/crawls/:id — Epic 9.5 (used by the UI): mark failed, stop pending jobs.
  app.delete<{ Params: { id: string } }>('/api/crawls/:id', async (req, reply) => {
    const crawl = await ownedCrawl(req.userId!, req.params.id);
    if (!crawl) return reply.code(404).send({ error: 'not found' });
    await db
      .update(crawls)
      .set({ status: 'failed', error: 'cancelled by user', completedAt: sql`now()` })
      .where(eq(crawls.id, crawl.id));
    return { cancelled: true };
  });
}
