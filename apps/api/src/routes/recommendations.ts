import type { FastifyInstance } from 'fastify';
import { asc, eq } from 'drizzle-orm';
import { crawls, db, issues, pages, recommendations, sites } from 'db';
import { z } from 'zod';
import { wordpress } from 'connectors';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { recordIntervention } from '../lib/interventions.js';
import { loadWpCreds } from '../lib/wpCreds.js';

const applyBody = z.object({
  metaTitle: z.string().max(120).optional(),
  metaDescription: z.string().max(320).optional(),
  altText: z.string().max(300).optional(),
  mediaId: z.number().int().positive().optional(),
});

interface RecoContext {
  reco: typeof recommendations.$inferSelect;
  ruleId: string;
  pageUrl: string;
  siteId: string;
}

async function loadOwnedReco(userId: string, recoId: string): Promise<RecoContext | null> {
  const [row] = await db
    .select({
      reco: recommendations,
      ruleId: issues.ruleId,
      pageUrl: pages.url,
      siteId: sites.id,
      siteUserId: sites.userId,
    })
    .from(recommendations)
    .innerJoin(issues, eq(issues.id, recommendations.issueId))
    .innerJoin(pages, eq(pages.id, issues.pageId))
    .innerJoin(crawls, eq(crawls.id, pages.crawlId))
    .innerJoin(sites, eq(sites.id, crawls.siteId))
    .where(eq(recommendations.id, recoId));
  if (!row || row.siteUserId !== userId) return null;
  return { reco: row.reco, ruleId: row.ruleId, pageUrl: row.pageUrl, siteId: row.siteId };
}

const META_RULES = new Set(['onpage.title-length', 'onpage.meta-description']);

export async function recommendationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/pages/:id/issues
  app.get<{ Params: { id: string } }>('/api/pages/:id/issues', async (req, reply) => {
    const owned = await pageOwned(req.userId!, req.params.id);
    if (!owned) return reply.code(404).send({ error: 'not found' });
    const rows = await db.select().from(issues).where(eq(issues.pageId, req.params.id));
    return { issues: rows };
  });

  // GET /api/pages/:id/recommendations
  app.get<{ Params: { id: string } }>('/api/pages/:id/recommendations', async (req, reply) => {
    const owned = await pageOwned(req.userId!, req.params.id);
    if (!owned) return reply.code(404).send({ error: 'not found' });
    const rows = await db
      .select({ reco: recommendations, ruleId: issues.ruleId })
      .from(recommendations)
      .innerJoin(issues, eq(issues.id, recommendations.issueId))
      .where(eq(issues.pageId, req.params.id))
      .orderBy(asc(recommendations.priorityRank));
    return { recommendations: rows };
  });

  // POST /api/recommendations/:id/apply — Epic 6.5
  app.post<{ Params: { id: string } }>('/api/recommendations/:id/apply', async (req, reply) => {
    const parsed = applyBody.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const ctx = await loadOwnedReco(req.userId!, req.params.id);
    if (!ctx) return reply.code(404).send({ error: 'not found' });
    if (!ctx.reco.autoFixable) return reply.code(422).send({ error: 'recommendation is not auto-fixable' });

    const isMeta = META_RULES.has(ctx.ruleId);
    const isAlt = ctx.ruleId === 'onpage.image-alt';
    if (!isMeta && !isAlt) {
      return reply.code(422).send({ error: `apply not supported for rule ${ctx.ruleId}` });
    }

    const creds = await loadWpCreds(ctx.siteId);
    let appliedResult: Record<string, unknown>;

    if (creds) {
      // Values are only required when we're the ones writing them.
      if (isMeta && parsed.data.metaTitle === undefined && parsed.data.metaDescription === undefined) {
        return reply.code(400).send({ error: 'metaTitle or metaDescription is required' });
      }
      if (isAlt && (!parsed.data.mediaId || parsed.data.altText === undefined)) {
        return reply.code(400).send({ error: 'mediaId and altText are required for alt-text fixes' });
      }
      let target: wordpress.FixTarget;
      let saveTarget: Record<string, unknown>;
      if (isMeta) {
        const obj = await wordpress.resolveObject(creds, ctx.pageUrl);
        if (!obj) return reply.code(422).send({ error: 'could not resolve the WordPress object for this URL' });
        const conn = await wordpress.testConnection(creds);
        target = {
          kind: 'meta',
          objectType: obj.type,
          objectId: obj.id,
          seoPlugin: conn.seoPlugin,
          metaTitle: parsed.data.metaTitle,
          metaDescription: parsed.data.metaDescription,
        };
        saveTarget = { kind: 'meta', objectType: obj.type, objectId: obj.id };
      } else {
        target = { kind: 'alt', mediaId: parsed.data.mediaId!, altText: parsed.data.altText! };
        saveTarget = { kind: 'alt', mediaId: parsed.data.mediaId };
      }
      const result = await wordpress.applyFix(creds, target);
      if (!result.applied) {
        return reply.code(502).send({ error: 'WordPress rejected the change', detail: result.reason });
      }
      appliedResult = { ...saveTarget, previous: result.previous };
    } else {
      // No WordPress connection (universal / custom-built site) — the user makes the
      // change themselves and confirms it here. Tracked identically to a WP apply.
      appliedResult = { kind: 'manual', previous: {} };
    }

    const [updated] = await db
      .update(recommendations)
      .set({ applied: true, appliedAt: new Date(), appliedResult })
      .where(eq(recommendations.id, ctx.reco.id))
      .returning();

    await recordAudit(req.userId!, creds ? 'recommendation.apply' : 'recommendation.apply_manual', ctx.reco.id, {
      ruleId: ctx.ruleId,
    });
    await recordIntervention({
      siteId: ctx.siteId,
      kind: 'recommendation',
      category: ctx.ruleId,
      targetUrl: ctx.pageUrl,
      label: `Fix aplicat${creds ? '' : ' (manual)'}: ${ctx.reco.fixTitle}`,
    });
    return { applied: true, recommendation: updated, manual: !creds };
  });

  // POST /api/recommendations/:id/rollback — Epic 6.6
  app.post<{ Params: { id: string } }>('/api/recommendations/:id/rollback', async (req, reply) => {
    const ctx = await loadOwnedReco(req.userId!, req.params.id);
    if (!ctx) return reply.code(404).send({ error: 'not found' });
    if (!ctx.reco.applied || !ctx.reco.appliedResult) {
      return reply.code(409).send({ error: 'nothing to roll back' });
    }
    const saved = ctx.reco.appliedResult as { kind: string } & Record<string, unknown>;
    if (saved.kind !== 'manual') {
      const creds = await loadWpCreds(ctx.siteId);
      if (!creds) return reply.code(409).send({ error: 'site is not connected to WordPress' });
      const { applied } = await wordpress.rollbackFix(
        creds,
        saved as Parameters<typeof wordpress.rollbackFix>[1],
      );
      if (!applied) return reply.code(502).send({ error: 'rollback failed' });
    }
    // kind 'manual' — nothing was written through us, so "rollback" is just un-marking it.

    const [updated] = await db
      .update(recommendations)
      .set({ applied: false, appliedAt: null })
      .where(eq(recommendations.id, ctx.reco.id))
      .returning();
    await recordAudit(req.userId!, 'recommendation.rollback', ctx.reco.id, { ruleId: ctx.ruleId });
    return { rolledBack: true, recommendation: updated };
  });
}

async function pageOwned(userId: string, pageId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: sites.userId })
    .from(pages)
    .innerJoin(crawls, eq(crawls.id, pages.crawlId))
    .innerJoin(sites, eq(sites.id, crawls.siteId))
    .where(eq(pages.id, pageId));
  return !!row && row.userId === userId;
}
