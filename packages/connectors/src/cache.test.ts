import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore, withCache } from './cache.js';

describe('withCache', () => {
  it('calls fn once, then serves from cache', async () => {
    const store = new MemoryCacheStore();
    const fn = vi.fn(async () => ({ n: 42 }));

    const a = await withCache(store, 'k', 60, fn);
    const b = await withCache(store, 'k', 60, fn);

    expect(a).toEqual({ n: 42 });
    expect(b).toEqual({ n: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-runs fn after TTL expiry', async () => {
    const store = new MemoryCacheStore();
    const fn = vi.fn(async () => Math.random());

    await withCache(store, 'k', 0, fn);
    await new Promise((r) => setTimeout(r, 2));
    await withCache(store, 'k', 0, fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
