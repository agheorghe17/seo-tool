import { pino } from 'pino';
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: [
    '*.applicationPassword',
    '*.password',
    '*.refreshToken',
    '*.access_token',
    '*.ciphertext',
    '*.ANTHROPIC_API_KEY',
  ],
  transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

export function captureError(err: unknown, ctx?: Record<string, unknown>): void {
  if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra: ctx });
}
