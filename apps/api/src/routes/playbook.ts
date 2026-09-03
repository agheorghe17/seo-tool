import type { FastifyInstance } from 'fastify';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db, playbookRules, sites } from 'db';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { distilRule, readBasePlaybook, mergePlaybook } from '../lib/playbook.js';

async function ownedSite(userId: string, siteId: string) {
  const [row] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return row ?? null;
}

async function ownsRule(userId: string, ruleId: string) {
  const [row] = await db
    .select({ id: playbookRules.id, siteId: playbookRules.siteId, userId: sites.userId })
    .from(playbookRules)
    .leftJoin(sites, eq(sites.id, playbookRules.siteId))
    .where(eq(playbookRules.id, ruleId));
  if (!row) return null;
  // global rules (siteId null) are editable by any authenticated owner; site rules by the owner
  if (row.siteId && row.userId !== userId) return null;
  return row;
}

export async function playbookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Full playbook: base file + this owner's learned rules (site + global).
  app.get<{ Params: { id: string } }>('/api/sites/:id/playbook', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rules = await db
      .select()
      .from(playbookRules)
      .where(or(isNull(playbookRules.siteId), eq(playbookRules.siteId, site.id)))
      .orderBy(desc(playbookRules.createdAt));
    return { base: await readBasePlaybook(), rules };
  });

  // Merged markdown, for pasting back into seo-playbook.md.
  app.get<{ Params: { id: string } }>('/api/sites/:id/playbook/export', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const rules = await db
      .select({ rule: playbookRules.rule, siteId: playbookRules.siteId })
      .from(playbookRules)
      .where(
        and(
          eq(playbookRules.active, true),
          or(isNull(playbookRules.siteId), eq(playbookRules.siteId, site.id)),
        ),
      )
      .orderBy(desc(playbookRules.createdAt));
    const md = mergePlaybook(await readBasePlaybook(), rules);
    return reply.header('content-type', 'text/markdown; charset=utf-8').send(md);
  });

  // Learn from a correction → distilled rule.
  app.post<{ Params: { id: string } }>('/api/sites/:id/playbook/learn', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const b = z
      .object({
        context: z.string().max(400).default(''),
        correction: z.string().min(3).max(600),
        scope: z.enum(['site', 'global']).default('site'),
        sourceRef: z.string().max(120).optional(),
      })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });

    const rule = await distilRule(b.data.context, b.data.correction);
    const [row] = await db
      .insert(playbookRules)
      .values({
        siteId: b.data.scope === 'global' ? null : site.id,
        rule,
        rationale: `${b.data.context}${b.data.context ? ' — ' : ''}${b.data.correction}`.slice(0, 600),
        source: 'correction',
        sourceRef: b.data.sourceRef ?? null,
      })
      .returning();
    return { rule: row };
  });

  // Manual rule.
  app.post<{ Params: { id: string } }>('/api/sites/:id/playbook/rules', async (req, reply) => {
    const site = await ownedSite(req.userId!, req.params.id);
    if (!site) return reply.code(404).send({ error: 'not found' });
    const b = z
      .object({ rule: z.string().min(5).max(240), scope: z.enum(['site', 'global']).default('site') })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    const [row] = await db
      .insert(playbookRules)
      .values({
        siteId: b.data.scope === 'global' ? null : site.id,
        rule: b.data.rule.trim(),
        source: 'manual',
      })
      .returning();
    return { rule: row };
  });

  app.patch<{ Params: { ruleId: string } }>('/api/playbook/rules/:ruleId', async (req, reply) => {
    if (!(await ownsRule(req.userId!, req.params.ruleId)))
      return reply.code(404).send({ error: 'not found' });
    const b = z
      .object({ active: z.boolean().optional(), rule: z.string().min(5).max(240).optional() })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    const set: Record<string, unknown> = {};
    if (b.data.active != null) set.active = b.data.active;
    if (b.data.rule != null) set.rule = b.data.rule.trim();
    if (Object.keys(set).length === 0) return { ok: true };
    const [row] = await db
      .update(playbookRules)
      .set(set)
      .where(eq(playbookRules.id, req.params.ruleId))
      .returning();
    return { rule: row };
  });

  app.delete<{ Params: { ruleId: string } }>('/api/playbook/rules/:ruleId', async (req, reply) => {
    if (!(await ownsRule(req.userId!, req.params.ruleId)))
      return reply.code(404).send({ error: 'not found' });
    await db.delete(playbookRules).where(eq(playbookRules.id, req.params.ruleId));
    return { ok: true };
  });
}
