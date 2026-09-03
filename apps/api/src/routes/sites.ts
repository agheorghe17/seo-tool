import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { crawls, db, siteSecrets, sites } from 'db';
import { z } from 'zod';
import { CONNECTION_TYPES, VERIFICATION_METHODS, encryptSecret } from 'shared';
import { wordpress } from 'connectors';
import { requireAuth } from '../middleware/auth.js';
import { recordAudit } from '../lib/audit.js';
import { verifyOwnership } from '../lib/verification.js';

const createSiteBody = z.object({
  domain: z
    .string()
    .min(3)
    .transform((d) =>
      d
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/\/$/, '')
        .toLowerCase(),
    ),
  connectionType: z.enum(CONNECTION_TYPES),
  wpSiteUrl: z.string().url().optional(),
});

const verifyBody = z.object({ method: z.enum(VERIFICATION_METHODS) });

const wpConnectBody = z.object({
  // accept "https://site.tld", "https://site.tld/", or a trailing path — normalise to origin
  wpSiteUrl: z
    .string()
    .url()
    .transform((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return u.replace(/\/+$/, '');
      }
    }),
  username: z.string().min(1).trim(),
  // WP Application Passwords display with spaces; they work with or without — strip them
  applicationPassword: z
    .string()
    .min(1)
    .transform((p) => p.replace(/\s+/g, '')),
});

async function loadOwnedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

async function latestCrawlsBySite(siteIds: string[]) {
  if (siteIds.length === 0) return new Map<string, typeof crawls.$inferSelect>();
  const rows = await db
    .select()
    .from(crawls)
    .where(inArray(crawls.siteId, siteIds))
    .orderBy(desc(crawls.createdAt));
  const map = new Map<string, typeof crawls.$inferSelect>();
  for (const row of rows) {
    if (!map.has(row.siteId)) map.set(row.siteId, row);
  }
  return map;
}

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/sites — Epic 1.6
  app.get('/api/sites', async (req) => {
    const rows = await db.select().from(sites).where(eq(sites.userId, req.userId!));
    const latest = await latestCrawlsBySite(rows.map((r) => r.id));
    return {
      sites: rows.map((s) => ({
        ...s,
        verified: s.verifiedAt != null,
        lastCrawl: latest.get(s.id) ?? null,
      })),
    };
  });

  // GET /api/sites/:id — Epic 1.6
  app.get<{ Params: { id: string } }>('/api/sites/:id', async (req, reply) => {
    const site = await loadOwnedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const latest = await latestCrawlsBySite([site.id]);
    const secretKinds = await db
      .select({ kind: siteSecrets.kind })
      .from(siteSecrets)
      .where(eq(siteSecrets.siteId, site.id));
    const kinds = new Set(secretKinds.map((s) => s.kind));
    return {
      site: {
        ...site,
        verified: site.verifiedAt != null,
        lastCrawl: latest.get(site.id) ?? null,
        // A stored refresh token = the OAuth link is live, even if property
        // auto-discovery didn't land a value on `ga4Property` yet.
        ga4Connected: kinds.has('ga4_refresh_token'),
        gbpConnected: kinds.has('gbp_refresh_token'),
      },
    };
  });

  // POST /api/sites — Epic 1.1
  app.post('/api/sites', async (req, reply) => {
    const parsed = createSiteBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { domain, connectionType, wpSiteUrl } = parsed.data;

    const existing = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.userId, req.userId!), eq(sites.domain, domain)));
    if (existing.length > 0) return reply.code(409).send({ error: 'site already exists' });

    const [row] = await db
      .insert(sites)
      .values({
        userId: req.userId!,
        domain,
        connectionType,
        wpSiteUrl: wpSiteUrl ?? null,
        verificationToken: `seo-tool-${randomUUID()}`,
      })
      .returning();

    await recordAudit(req.userId!, 'site.create', row!.id, { domain });
    return reply.code(201).send({ site: row });
  });

  // POST /api/sites/:id/verify — Epic 1.3
  app.post<{ Params: { id: string } }>('/api/sites/:id/verify', async (req, reply) => {
    const parsed = verifyBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const site = await loadOwnedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const outcome = await verifyOwnership(parsed.data.method, site.domain, site.verificationToken);
    if (!outcome.verified) {
      return reply.code(200).send({ verified: false, reason: outcome.reason, detail: outcome.detail });
    }

    const [updated] = await db
      .update(sites)
      .set({ verifiedAt: new Date(), verificationMethod: parsed.data.method })
      .where(eq(sites.id, site.id))
      .returning();

    await recordAudit(req.userId!, 'site.verify', site.id, { method: parsed.data.method });
    return { verified: true, site: updated };
  });

  // POST /api/sites/:id/wordpress — Epic 1.4
  app.post<{ Params: { id: string } }>('/api/sites/:id/wordpress', async (req, reply) => {
    const parsed = wpConnectBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const site = await loadOwnedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });

    const info = await wordpress.testConnection({
      siteUrl: parsed.data.wpSiteUrl,
      username: parsed.data.username,
      applicationPassword: parsed.data.applicationPassword,
    });
    if (!info.ok) {
      req.log.warn({ wpSiteUrl: parsed.data.wpSiteUrl, restBase: info.restBase, reason: info.reason }, 'wordpress connect failed');
      return reply.code(400).send({ error: info.reason ?? 'connection failed', restBase: info.restBase });
    }

    const enc = encryptSecret(parsed.data.applicationPassword);
    await db
      .insert(siteSecrets)
      .values({
        siteId: site.id,
        kind: 'wp_app_password',
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        tag: enc.tag,
        meta: { username: parsed.data.username },
      })
      .onConflictDoUpdate({
        target: [siteSecrets.siteId, siteSecrets.kind],
        set: {
          ciphertext: enc.ciphertext,
          iv: enc.iv,
          tag: enc.tag,
          meta: { username: parsed.data.username },
          updatedAt: new Date(),
        },
      });

    // Authenticating as a WordPress user that can edit content proves ownership → auto-verify.
    const [updated] = await db
      .update(sites)
      .set({
        connectionType: 'wordpress',
        wpSiteUrl: parsed.data.wpSiteUrl,
        verifiedAt: site.verifiedAt ?? new Date(),
      })
      .where(eq(sites.id, site.id))
      .returning();

    await recordAudit(req.userId!, 'site.wordpress.connect', site.id, {
      wpSiteUrl: parsed.data.wpSiteUrl,
      seoPlugin: info.seoPlugin,
    });
    return { ok: true, types: info.types, seoPlugin: info.seoPlugin, site: updated };
  });
}
