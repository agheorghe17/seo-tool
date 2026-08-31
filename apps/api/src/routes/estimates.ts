import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { crawls, db, siteSecrets, sites, trafficEstimates } from 'db';
import { encryptSecret } from 'shared';
import { gsc } from 'connectors';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { enqueue } from '../queue.js';
import { getEnv } from '../env.js';

function encodeState(siteId: string): string {
  return Buffer.from(`${siteId}:${Date.now()}`).toString('base64url');
}
function decodeState(state: string): string | null {
  try {
    return Buffer.from(state, 'base64url').toString('utf8').split(':')[0] ?? null;
  } catch {
    return null;
  }
}

export async function estimateRoutes(app: FastifyInstance): Promise<void> {
  // --- GSC OAuth callback (no auth header — Google redirects the browser here) ---
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/sites/gsc/callback',
    async (req, reply) => {
      const web = getEnv().WEB_BASE_URL;
      const siteId = req.query.state ? decodeState(req.query.state) : null;
      if (req.query.error || !req.query.code || !siteId) {
        return reply.redirect(`${web}/sites?gsc=error`);
      }
      try {
        const tokens = await gsc.exchangeCode(req.query.code);
        const enc = encryptSecret(tokens.refreshToken);
        await db
          .insert(siteSecrets)
          .values({
            siteId,
            kind: 'gsc_refresh_token',
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            tag: enc.tag,
          })
          .onConflictDoUpdate({
            target: [siteSecrets.siteId, siteSecrets.kind],
            set: { ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag, updatedAt: new Date() },
          });

        const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
        await db
          .update(sites)
          .set({ gscConnected: true, gscProperty: site?.gscProperty ?? `sc-domain:${site?.domain}` })
          .where(eq(sites.id, siteId));

        return reply.redirect(`${web}/sites/${siteId}?gsc=connected`);
      } catch {
        return reply.redirect(`${web}/sites/${siteId}?gsc=error`);
      }
    },
  );

  // --- authenticated routes ---
  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth);

    async function ownedSite(userId: string, siteId: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
      return row ?? null;
    }

    // POST /api/sites/:id/gsc/connect — Epic 7.1
    authed.post<{ Params: { id: string }; Body: { property?: string } }>(
      '/api/sites/:id/gsc/connect',
      async (req, reply) => {
        const site = await ownedSite(req.userId!, req.params.id);
        if (!site) return reply.code(404).send({ error: 'not found' });
        const body = z.object({ property: z.string().optional() }).parse(req.body ?? {});
        if (body.property) {
          await db
            .update(sites)
            .set({ gscProperty: body.property })
            .where(eq(sites.id, site.id));
        }
        try {
          const { authUrl } = gsc.buildAuthUrl(encodeState(site.id));
          return { authUrl };
        } catch (err) {
          return reply.code(500).send({ error: String(err) });
        }
      },
    );

    // POST /api/sites/:id/traffic-estimate — recompute for the latest completed crawl
    authed.post<{ Params: { id: string } }>(
      '/api/sites/:id/traffic-estimate',
      async (req, reply) => {
        const site = await ownedSite(req.userId!, req.params.id);
        if (!site) return reply.code(404).send({ error: 'not found' });
        const [crawl] = await db
          .select({ id: crawls.id })
          .from(crawls)
          .where(and(eq(crawls.siteId, site.id), eq(crawls.status, 'completed')))
          .orderBy(desc(crawls.completedAt))
          .limit(1);
        if (!crawl) return reply.code(409).send({ error: 'no completed crawl to estimate from' });
        await enqueue('estimate', { siteId: site.id, crawlId: crawl.id });
        return reply.code(202).send({ queued: true });
      },
    );

    // GET /api/sites/:id/traffic-estimate — Epic 7.7 (always an interval + assumptions)
    authed.get<{ Params: { id: string } }>(
      '/api/sites/:id/traffic-estimate',
      async (req, reply) => {
        const site = await ownedSite(req.userId!, req.params.id);
        if (!site) return reply.code(404).send({ error: 'not found' });
        const [row] = await db
          .select()
          .from(trafficEstimates)
          .where(eq(trafficEstimates.siteId, site.id))
          .orderBy(desc(trafficEstimates.generatedAt))
          .limit(1);
        if (!row) return reply.code(404).send({ error: 'no estimate yet' });
        return { estimate: row };
      },
    );
  });
}
