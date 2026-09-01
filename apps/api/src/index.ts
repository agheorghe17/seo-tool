import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import { getEnv } from './env.js';
import { captureError, initSentry, LOG_REDACT } from './observability.js';
import { billingRoutes } from './routes/billing.js';
import { crawlRoutes } from './routes/crawls.js';
import { estimateRoutes } from './routes/estimates.js';
import { analyticsRoutes } from './routes/analytics.js';
import { contentRoutes } from './routes/content.js';
import { healthRoutes } from './routes/health.js';
import { homeRoutes } from './routes/home.js';
import { meRoutes } from './routes/me.js';
import { recommendationRoutes } from './routes/recommendations.js';
import { siteRoutes } from './routes/sites.js';
import { strategyRoutes } from './routes/strategy.js';
import { stopQueue } from './queue.js';

const env = getEnv();
initSentry();

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    redact: LOG_REDACT,
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
});

await app.register(cors, {
  origin: env.NODE_ENV === 'production' ? [env.WEB_BASE_URL] : true,
  credentials: true,
});

// Tolerate `content-type: application/json` with an empty body (DELETE / bodyless POST).
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body, done) => {
    const s = (body as string).trim();
    if (s === '') return done(null, {});
    try {
      done(null, JSON.parse(s));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  },
);

// Epic 10.4 — per-user (falls back to IP) rate limiting. In-memory; swap for a Redis
// store when running more than one API instance.
await app.register(rateLimit, {
  global: true,
  max: 240,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.userId ?? req.ip,
});

app.setErrorHandler((err: FastifyError, req, reply) => {
  req.log.error(err);
  const status = err.statusCode ?? 500;
  if (status >= 500) captureError(err, { url: req.url, userId: req.userId });
  reply.code(status).send({ error: status >= 500 ? 'internal error' : err.message });
});

await app.register(healthRoutes);
await app.register(siteRoutes);
await app.register(crawlRoutes);
await app.register(recommendationRoutes);
await app.register(estimateRoutes);
await app.register(meRoutes);
await app.register(billingRoutes);
await app.register(strategyRoutes);
await app.register(homeRoutes);
await app.register(contentRoutes);
await app.register(analyticsRoutes);

const close = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await stopQueue();
  process.exit(0);
};
process.on('SIGINT', () => void close('SIGINT'));
process.on('SIGTERM', () => void close('SIGTERM'));

try {
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
