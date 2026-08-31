/**
 * Epic 3.4 — tiny cache abstraction for PSI/CrUX responses. The worker injects a Redis-backed
 * store; tests use the in-memory one. TTL is in seconds.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, { value: string; expires: number }>();

  async get(key: string): Promise<string | null> {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.map.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
}

export const noopCacheStore: CacheStore = {
  get: async () => null,
  set: async () => {},
};

export async function withCache<T>(
  store: CacheStore,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await store.get(key);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }
  const fresh = await fn();
  await store.set(key, JSON.stringify(fresh), ttlSeconds);
  return fresh;
}
