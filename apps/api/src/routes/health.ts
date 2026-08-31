import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from 'db';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    ok: true,
    service: 'api',
    ts: new Date().toISOString(),
  }));

  // Epic 11.6 — readiness: the DB must answer.
  app.get('/readyz', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true };
    } catch (err) {
      return reply.code(503).send({ ok: false, error: String(err) });
    }
  });
}
