import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getEnv } from '../env.js';

/**
 * Verifies the Supabase access token (Bearer) and attaches `userId` to the request.
 *
 * Two verification paths:
 *  - `SUPABASE_JWT_SECRET` set  → HS256 symmetric verification (legacy Supabase JWTs)
 *  - otherwise                  → RS256 via Supabase JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
 */
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(supabaseUrl: string) {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing bearer token' });
  }
  const token = header.slice('Bearer '.length);
  const env = getEnv();

  try {
    if (env.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      req.userId = String(payload.sub);
      return;
    }
    if (env.SUPABASE_URL) {
      const { payload } = await jwtVerify(token, getJwks(env.SUPABASE_URL));
      req.userId = String(payload.sub);
      return;
    }
    return reply.code(500).send({ error: 'auth not configured' });
  } catch {
    return reply.code(401).send({ error: 'invalid token' });
  }
}
