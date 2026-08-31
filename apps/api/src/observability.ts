import * as Sentry from '@sentry/node';

/** Epic 11.1/11.3 — Sentry (opt-in via SENTRY_DSN) + log redaction paths. */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (process.env.SENTRY_DSN) Sentry.captureException(err, { extra: context });
}

/** Keep secrets and auth material out of logs. */
export const LOG_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.applicationPassword',
  '*.password',
  '*.refreshToken',
  '*.access_token',
  '*.ciphertext',
  '*.ANTHROPIC_API_KEY',
  '*.SUPABASE_SERVICE_ROLE_KEY',
];
