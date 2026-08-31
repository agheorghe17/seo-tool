import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  auditLog,
  crawls,
  db,
  issues,
  jobRuns,
  keywordData,
  pages,
  recommendations,
  sites,
  trafficEstimates,
  users,
} from 'db';
import { readFlags } from 'shared';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/me — profile + plan/quota (Epic 10.2)
  app.get('/api/me', async (req) => {
    const [me] = await db.select().from(users).where(eq(users.id, req.userId!));
    return { me: me ?? null, flags: publicFlags() };
  });

  // GET /api/me/usage — Epic 11.7 (cost/usage view)
  app.get('/api/me/usage', async (req) => {
    const [me] = await db.select().from(users).where(eq(users.id, req.userId!));
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const siteIds = (
      await db.select({ id: sites.id }).from(sites).where(eq(sites.userId, req.userId!))
    ).map((s) => s.id);

    const [crawlCount] = siteIds.length
      ? await db
          .select({ n: count() })
          .from(crawls)
          .where(and(inArray(crawls.siteId, siteIds), gte(crawls.createdAt, monthStart)))
      : [{ n: 0 }];

    const crawlIds = siteIds.length
      ? (
          await db
            .select({ id: crawls.id })
            .from(crawls)
            .where(and(inArray(crawls.siteId, siteIds), gte(crawls.createdAt, monthStart)))
        ).map((c) => c.id)
      : [];

    const jobs = crawlIds.length
      ? await db
          .select({ type: jobRuns.type, status: jobRuns.status, n: count() })
          .from(jobRuns)
          .where(inArray(jobRuns.crawlId, crawlIds))
          .groupBy(jobRuns.type, jobRuns.status)
      : [];

    return {
      usage: {
        plan: me?.plan ?? 'free',
        quotaPagesMonth: me?.quotaPagesMonth ?? 0,
        quotaUsed: me?.quotaUsed ?? 0,
        crawlsThisMonth: Number(crawlCount?.n ?? 0),
        jobsThisMonth: jobs.map((j) => ({ ...j, n: Number(j.n) })),
      },
    };
  });

  // GET /api/me/export — Epic 11.5 (GDPR data portability)
  app.get('/api/me/export', async (req, reply) => {
    const userId = req.userId!;
    const [me] = await db.select().from(users).where(eq(users.id, userId));
    const mySites = await db.select().from(sites).where(eq(sites.userId, userId));
    const siteIds = mySites.map((s) => s.id);

    const myCrawls = siteIds.length
      ? await db.select().from(crawls).where(inArray(crawls.siteId, siteIds))
      : [];
    const crawlIds = myCrawls.map((c) => c.id);
    const myPages = crawlIds.length
      ? await db.select().from(pages).where(inArray(pages.crawlId, crawlIds))
      : [];
    const pageIds = myPages.map((p) => p.id);
    const myIssues = pageIds.length
      ? await db.select().from(issues).where(inArray(issues.pageId, pageIds))
      : [];
    const issueIds = myIssues.map((i) => i.id);
    const myRecos = issueIds.length
      ? await db.select().from(recommendations).where(inArray(recommendations.issueId, issueIds))
      : [];
    const myKeywords = siteIds.length
      ? await db.select().from(keywordData).where(inArray(keywordData.siteId, siteIds))
      : [];
    const myEstimates = siteIds.length
      ? await db.select().from(trafficEstimates).where(inArray(trafficEstimates.siteId, siteIds))
      : [];
    const myAudit = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt));

    reply.header('content-disposition', 'attachment; filename="seo-tool-export.json"');
    return {
      exportedAt: new Date().toISOString(),
      user: me ? { id: me.id, email: me.email, plan: me.plan, createdAt: me.createdAt } : null,
      sites: mySites.map(({ ...s }) => s),
      crawls: myCrawls,
      pages: myPages,
      issues: myIssues,
      recommendations: myRecos,
      keywordData: myKeywords,
      trafficEstimates: myEstimates,
      auditLog: myAudit,
    };
  });

  // DELETE /api/me — Epic 11.5 (right to erasure). FK cascade wipes all owned data.
  // NOTE: also delete the Supabase auth user from the client / an admin job.
  app.delete('/api/me', async (req) => {
    await recordAudit(req.userId!, 'account.delete');
    await db.delete(users).where(eq(users.id, req.userId!));
    return { deleted: true };
  });
}

function publicFlags() {
  const f = readFlags();
  return { billing: f.billing, llmProvider: f.llmProvider, crawlMaxPages: f.crawlMaxPages };
}
