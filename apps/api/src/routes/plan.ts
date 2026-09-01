import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq } from 'drizzle-orm';
import { businessProfiles, db, pageBlueprints, sites, trafficEstimates } from 'db';
import { wordpress } from 'connectors';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { enqueue } from '../queue.js';
import { loadWpCreds } from '../lib/wpCreds.js';

async function ownedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

async function ownedBlueprint(userId: string, bpId: string) {
  const [row] = await db
    .select({ bp: pageBlueprints, userId: sites.userId })
    .from(pageBlueprints)
    .innerJoin(sites, eq(sites.id, pageBlueprints.siteId))
    .where(eq(pageBlueprints.id, bpId));
  return row && row.userId === userId ? row.bp : null;
}

type Recommended = NonNullable<(typeof pageBlueprints.$inferSelect)['recommended']>;

export async function planRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/sites/:id/plan — blueprints + phased traffic projection
  app.get<{ Params: { id: string } }>('/api/sites/:id/plan', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const [blueprints, estRow, profileRow] = await Promise.all([
      db
        .select()
        .from(pageBlueprints)
        .where(eq(pageBlueprints.siteId, site.id))
        .orderBy(asc(pageBlueprints.priority)),
      db
        .select()
        .from(trafficEstimates)
        .where(eq(trafficEstimates.siteId, site.id))
        .orderBy(desc(trafficEstimates.generatedAt))
        .limit(1),
      db.select().from(businessProfiles).where(eq(businessProfiles.siteId, site.id)),
    ]);

    const est = estRow[0];
    const profile = profileRow[0];

    return {
      blueprints,
      market: {
        geoCountry: profile?.geoCountry ?? null,
        geoLanguage: profile?.geoLanguage ?? null,
        primaryCity: profile?.primaryCity ?? null,
        localEmphasis: !!profile?.localEmphasis,
      },
      projection: est
        ? {
            baselineMonthlyVisits: est.baselineMonthlyVisits,
            baselineSource: est.baselineSource,
            confidence: est.confidenceLevel,
            phases: est.phases ?? [],
            assumptions: est.assumptions,
          }
        : null,
    };
  });

  // POST /api/sites/:id/plan/rebuild — regenerate blueprints
  app.post<{ Params: { id: string } }>('/api/sites/:id/plan/rebuild', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    await enqueue('page-plan', { siteId: site.id });
    return reply.code(202).send({ queued: true });
  });

  // GET /api/sites/:id/blueprints/:bpId
  app.get<{ Params: { id: string; bpId: string } }>(
    '/api/sites/:id/blueprints/:bpId',
    async (req, reply) => {
      const bp = await ownedBlueprint(req.userId!, req.params.bpId);
      if (!bp || bp.siteId !== req.params.id) return reply.code(404).send({ error: 'not found' });
      return { blueprint: bp };
    },
  );

  // POST /api/sites/:id/blueprints/:bpId/prompt — rewrite prompt for the page body
  app.post<{ Params: { id: string; bpId: string } }>(
    '/api/sites/:id/blueprints/:bpId/prompt',
    async (req, reply) => {
      const bp = await ownedBlueprint(req.userId!, req.params.bpId);
      if (!bp || bp.siteId !== req.params.id) return reply.code(404).send({ error: 'not found' });
      const [profile] = await db
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.siteId, bp.siteId));
      const site = await ownedSite(req.userId!, req.params.id);
      const rec = bp.recommended;
      const services = ((profile?.services as string[] | null) ?? []).slice(0, 4);
      const bullets = (xs: string[]) =>
        xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- (folosește-ți judecata pe baza subiectului)';
      const prompt = [
        `Ești copywriter SEO. Rescrie conținutul acestei pagini pentru site-ul ${site?.domain ?? ''}.`,
        '',
        `PAGINA: ${bp.url}`,
        `CUVÂNT CHEIE PRINCIPAL: ${bp.targetKeyword ?? '(alege pe baza titlului)'}`,
        bp.secondaryKeywords.length ? `CUVINTE SECUNDARE: ${bp.secondaryKeywords.join(', ')}` : null,
        profile?.summary ? `DESPRE AFACERE: ${profile.summary}` : null,
        services.length ? `SERVICII: ${services.join(', ')}` : null,
        profile?.primaryCity && profile?.localEmphasis ? `ORAȘ PRINCIPAL: ${profile.primaryCity}` : null,
        '',
        rec ? `TITLU RECOMANDAT: ${rec.title}` : null,
        rec ? `H1 RECOMANDAT: ${rec.h1}` : null,
        rec ? `META DESCRIPTION RECOMANDAT (120-160): ${rec.metaDescription}` : null,
        rec ? `LUNGIME ȚINTĂ: ~${rec.wordCountTarget} de cuvinte.` : null,
        '',
        'STRUCTURĂ — folosește aceste secțiuni H2 (adaptează formularea, păstrează ordinea):',
        bullets(rec?.h2Outline ?? []),
        '',
        rec && rec.internalLinksOut.length
          ? `LINKURI INTERNE de inserat natural: ${rec.internalLinksOut.join(', ')}`
          : null,
        rec ? `SCHEMA de adăugat: ${rec.schemaType} (JSON-LD).` : null,
        '',
        'REGULI STRICTE:',
        '- NU inventa statistici, procente, studii, prețuri sau citate.',
        '- NU promite poziții în Google sau creșteri de trafic.',
        '- Include cuvântul cheie în primul paragraf, într-un H2 și în concluzie — natural.',
        '- Începe cu un rezumat scurt sub un H2 „Pe scurt".',
        '- Livrează în Markdown: `#` titlu, `##` secțiuni, o secțiune `## Întrebări frecvente`.',
        '',
        'Livrează DOAR conținutul în Markdown, fără alt comentariu.',
      ]
        .filter((l) => l !== null)
        .join('\n');
      return { prompt };
    },
  );

  // POST /api/sites/:id/blueprints/:bpId/apply — write recommended title + meta to WordPress
  app.post<{ Params: { id: string; bpId: string } }>(
    '/api/sites/:id/blueprints/:bpId/apply',
    async (req, reply) => {
      const bp = await ownedBlueprint(req.userId!, req.params.bpId);
      if (!bp || bp.siteId !== req.params.id) return reply.code(404).send({ error: 'not found' });
      const rec = bp.recommended as Recommended | null;
      if (!rec) return reply.code(409).send({ error: 'blueprint has no recommendation yet' });

      const creds = await loadWpCreds(bp.siteId);
      if (!creds) return reply.code(409).send({ error: 'site is not connected to WordPress' });

      const obj = await wordpress.resolveObject(creds, bp.url);
      if (!obj) return reply.code(422).send({ error: 'could not resolve the WordPress object for this URL' });
      const conn = await wordpress.testConnection(creds);

      const result = await wordpress.applyFix(creds, {
        kind: 'meta',
        objectType: obj.type,
        objectId: obj.id,
        seoPlugin: conn.seoPlugin,
        metaTitle: rec.title,
        metaDescription: rec.metaDescription,
      });
      if (!result.applied) {
        return reply.code(502).send({ error: 'WordPress rejected the change', detail: result.reason });
      }

      const [updated] = await db
        .update(pageBlueprints)
        .set({
          status: 'applied',
          appliedResult: {
            kind: 'meta',
            objectType: obj.type,
            objectId: obj.id,
            previous: result.previous,
          },
          updatedAt: new Date(),
        })
        .where(eq(pageBlueprints.id, bp.id))
        .returning();
      await recordAudit(req.userId!, 'blueprint.apply', bp.siteId, { url: bp.url });
      return { blueprint: updated };
    },
  );

  // POST /api/blueprints/:bpId/rollback
  app.post<{ Params: { bpId: string } }>('/api/blueprints/:bpId/rollback', async (req, reply) => {
    const bp = await ownedBlueprint(req.userId!, req.params.bpId);
    if (!bp) return reply.code(404).send({ error: 'not found' });
    const saved = bp.appliedResult as
      | { kind: 'meta'; objectType?: 'post' | 'page'; objectId?: number; previous: Record<string, unknown> }
      | null;
    if (bp.status !== 'applied' || !saved) return reply.code(409).send({ error: 'nothing to roll back' });

    const creds = await loadWpCreds(bp.siteId);
    if (!creds) return reply.code(409).send({ error: 'site is not connected to WordPress' });
    const { applied } = await wordpress.rollbackFix(creds, saved);
    if (!applied) return reply.code(502).send({ error: 'rollback failed' });

    const [updated] = await db
      .update(pageBlueprints)
      .set({ status: 'approved', appliedResult: null, updatedAt: new Date() })
      .where(eq(pageBlueprints.id, bp.id))
      .returning();
    await recordAudit(req.userId!, 'blueprint.rollback', bp.siteId, { url: bp.url });
    return { blueprint: updated };
  });

  // POST /api/sites/:id/blueprints/:bpId/dismiss
  app.post<{ Params: { id: string; bpId: string } }>(
    '/api/sites/:id/blueprints/:bpId/dismiss',
    async (req, reply) => {
      const bp = await ownedBlueprint(req.userId!, req.params.bpId);
      if (!bp || bp.siteId !== req.params.id) return reply.code(404).send({ error: 'not found' });
      const [updated] = await db
        .update(pageBlueprints)
        .set({ status: bp.status === 'dismissed' ? 'draft' : 'dismissed', updatedAt: new Date() })
        .where(eq(pageBlueprints.id, bp.id))
        .returning();
      return { blueprint: updated };
    },
  );
}
