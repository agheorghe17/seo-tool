import cors from '@fastify/cors';
import Fastify, { type FastifyError } from 'fastify';
import { getEnv } from './env.js';
import { healthRoutes } from './routes/health.js';
import { siteRoutes } from './routes/sites.js';
import { stopQueue } from './queue.js';

const env = getEnv();

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
});

await app.register(cors, {
  origin: env.NODE_ENV === 'production' ? [env.WEB_BASE_URL] : true,
  credentials: true,
});

app.setErrorHandler((err: FastifyError, req, reply) => {
  req.log.error(err);
  const status = err.statusCode ?? 500;
  reply.code(status).send({
    error: status >= 500 ? 'internal error' : err.message,
  });
});

await app.register(healthRoutes);
await app.register(siteRoutes);

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
