import { pino } from 'pino';

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});
