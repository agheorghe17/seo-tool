import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db, users } from 'db';
import { getEnv } from '../env.js';

/**
 * Verifies the Supabase access token (Bearer), attaches `userId`, and lazily provisions
 * the matching `public.users` row on first request (so FKs to users always resolve).
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
const provisioned = new Set<string>();

function getJwks(supabaseUrl: string) {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

async function ensureUserRow(userId: string, payload: JWTPayload): Promise<void> {
  if (provisioned.has(userId)) return;
  const email = typeof payload.email === 'string' ? payload.email : `${userId}@users.noreply`;
  try {
    await db.insert(users).values({ id: userId, email }).onConflictDoNothing();
    provisioned.add(userId);
  } catch {
    /* if the DB is briefly unavailable, retry provisioning on the next request */
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing bearer token' });
  }
  const token = header.slice('Bearer '.length);
  const env = getEnv();

  try {
    let payload: JWTPayload;
    if (env.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      ({ payload } = await jwtVerify(token, secret));
    } else if (env.SUPABASE_URL) {
      ({ payload } = await jwtVerify(token, getJwks(env.SUPABASE_URL)));
    } else {
      return reply.code(500).send({ error: 'auth not configured' });
    }
    req.userId = String(payload.sub);
    await ensureUserRow(req.userId, payload);
  } catch {
    return reply.code(401).send({ error: 'invalid token' });
  }
}
