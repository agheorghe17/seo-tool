import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { crawls, db, pages, sites } from 'db';
import { requireAuth } from '../middleware/auth.js';
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
}
