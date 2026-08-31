import type { Redis } from 'ioredis';
import { MemoryCacheStore, type CacheStore } from 'connectors';
import { logger } from './logger.js';

/**
 * CACHE ONLY (Epic 3.4) — PSI/CrUX responses. Not the job queue (that's pg-boss on Postgres).
 * Falls back to an in-process cache when `REDIS_URL` is unset (local dev).
 */
class RedisCacheStore implements CacheStore {
  constructor(private readonly client: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }
}

let store: CacheStore | null = null;

export async function getCacheStore(): Promise<CacheStore> {
  if (store) return store;
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not set — using in-memory cache for PSI/CrUX');
    store = new MemoryCacheStore();
    return store;
  }
  try {
    const { Redis } = await import('ioredis');
    const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    client.on('error', (err) => logger.error({ err }, 'redis error'));
    store = new RedisCacheStore(client);
  } catch (err) {
    logger.error({ err }, 'failed to init redis, falling back to memory cache');
    store = new MemoryCacheStore();
  }
  return store;
}
