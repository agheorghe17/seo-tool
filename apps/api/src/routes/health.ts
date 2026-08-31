import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async () => ({ ok: true, service: 'api', ts: new Date().toISOString() }));

  app.get('/readyz', async (_req, reply) => {
    // Epic 11.6 wires real DB + queue checks here.
    return reply.send({ ok: true });
  });
}
