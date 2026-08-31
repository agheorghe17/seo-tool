import type { FastifyInstance } from 'fastify';
import { readFlags } from 'shared';
import { requireAuth } from '../middleware/auth.js';

/**
 * Epic 12.3 — billing placeholder. Wired but inert: returns 501 whether or not the flag is on,
 * so the surface exists for a future Stripe integration without shipping payments now.
 */
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post('/api/billing/checkout', async (_req, reply) => {
    if (!readFlags().billing) {
      return reply.code(501).send({ error: 'billing is disabled (FEATURE_BILLING != on)' });
    }
    return reply.code(501).send({ error: 'billing not implemented yet' });
  });
}
