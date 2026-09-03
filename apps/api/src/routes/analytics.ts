import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db, sites } from 'db';
import { ga4 } from 'connectors';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { getEnv } from '../env.js';
import { loadGoogleRefreshToken, saveGoogleRefreshToken } from '../lib/googleCreds.js';
import { withCache, MemoryCacheStore } from 'connectors';

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

const ga4Cache = new MemoryCacheStore();

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  // --- GA4 OAuth callback (browser redirect, no auth header) ---
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/sites/ga/callback',
    async (req, reply) => {
      const web = getEnv().WEB_BASE_URL;
      const siteId = req.query.state ? decodeState(req.query.state) : null;
      if (req.query.error || !req.query.code || !siteId) {
        return reply.redirect(`${web}/sites?ga=error`);
      }
      try {
        const tokens = await ga4.exchangeCode(req.query.code);
        await saveGoogleRefreshToken(siteId, 'ga4_refresh_token', tokens.refreshToken);

        const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
        let property = site?.ga4Property ?? null;
        try {
          const list = await ga4.listProperties(tokens.accessToken);
          const picked = ga4.pickProperty(site?.domain ?? '', list);
          if (picked) property = picked;
          req.log.info({ siteId, properties: list.map((p) => p.property), picked }, 'ga4 property discovery');
        } catch (err) {
          req.log.warn({ err, siteId }, 'ga4 accountSummaries failed');
        }

        await db.update(sites).set({ ga4Property: property }).where(eq(sites.id, siteId));
        await recordAudit(null, 'site.ga4.connect', siteId, { property });
        return reply.redirect(`${web}/sites/${siteId}/settings?ga=connected`);
      } catch (err) {
        req.log.error({ err, siteId }, 'ga4 callback failed');
        return reply.redirect(`${web}/sites/${siteId}/settings?ga=error`);
      }
    },
  );

  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth);

    async function ownedSite(userId: string, siteId: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
      return row ?? null;
    }

    // POST /api/sites/:id/ga/connect — start GA4 OAuth
    authed.post<{ Params: { id: string } }>('/api/sites/:id/ga/connect', async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });
      try {
        const { authUrl } = ga4.buildAuthUrl(encodeState(site.id));
        return { authUrl };
      } catch (err) {
        return reply.code(500).send({ error: String(err) });
      }
    });

    // GET /api/sites/:id/ga/traffic — real traffic totals (cached 6h)
    authed.get<{ Params: { id: string } }>('/api/sites/:id/ga/traffic', async (req, reply) => {
      const site = await ownedSite(req.userId!, req.params.id);
      if (!site) return reply.code(404).send({ error: 'not found' });

      const refresh = await loadGoogleRefreshToken(site.id, 'ga4_refresh_token');
      if (!refresh) return reply.code(409).send({ error: 'GA4 token missing — reconnect' });

      // Property auto-discovery can fail at callback time (Admin API not enabled
      // yet, race). Retry it here, lazily, and persist what we find.
      let property = site.ga4Property;
      if (!property) {
        try {
          const token = await ga4.refreshAccessToken(refresh);
          const list = await ga4.listProperties(token);
          property = ga4.pickProperty(site.domain, list);
          if (property) {
            await db.update(sites).set({ ga4Property: property }).where(eq(sites.id, site.id));
          }
          req.log.info(
            { siteId: site.id, properties: list.map((p) => p.property), picked: property },
            'ga4 lazy property discovery',
          );
        } catch (err) {
          req.log.warn({ err, siteId: site.id }, 'ga4 lazy property discovery failed');
        }
        if (!property) {
          return reply
            .code(409)
            .send({ error: 'GA4 conectat, dar nicio proprietate accesibilă cu acest cont Google' });
        }
      }

      try {
        const totals = await withCache(
          ga4Cache,
          `ga4:totals:${site.id}`,
          6 * 60 * 60,
          async () => {
            const token = await ga4.refreshAccessToken(refresh);
            return ga4.fetchTotals(token, property!, 90);
          },
        );
        return { traffic: { ...totals, monthlyOrganic: Math.round(totals.organicSessions / 3) } };
      } catch (err) {
        req.log.warn({ err, siteId: site.id }, 'ga4 traffic fetch failed');
        return reply.code(502).send({ error: 'GA4 fetch failed' });
      }
    });
  });
}
