import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db, sites } from 'db';
import { z } from 'zod';
import { CONNECTION_TYPES } from 'shared';
import { requireAuth } from '../middleware/auth.js';

const createSiteBody = z.object({
  domain: z
    .string()
    .min(3)
    .transform((d) => d.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()),
  connectionType: z.enum(CONNECTION_TYPES),
  wpSiteUrl: z.string().url().optional(),
});

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // GET /api/sites
  app.get('/api/sites', async (req) => {
    const rows = await db.select().from(sites).where(eq(sites.userId, req.userId!));
    return { sites: rows };
  });

  // POST /api/sites  — Epic 1.1
  app.post('/api/sites', async (req, reply) => {
    const parsed = createSiteBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const { domain, connectionType, wpSiteUrl } = parsed.data;

    const existing = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.userId, req.userId!), eq(sites.domain, domain)));
    if (existing.length > 0) {
      return reply.code(409).send({ error: 'site already exists' });
    }

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

    return reply.code(201).send({ site: row });
  });
}
