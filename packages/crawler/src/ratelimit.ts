/**
 * Epic 2.2 — per-domain rate limiting. In-memory token bucket used by the package;
 * the worker swaps in a Redis-backed bucket when running multiple instances.
 */
export interface RateLimiter {
  /** Resolves when the caller is allowed to make the next request to `key`. */
  take(key: string): Promise<void>;
}

export class TokenBucketRateLimiter implements RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly buckets = new Map<string, { tokens: number; last: number }>();

  constructor(requestsPerSecond: number, burst = requestsPerSecond) {
    this.refillPerMs = requestsPerSecond / 1000;
    this.capacity = Math.max(1, burst);
  }

  async take(key: string): Promise<void> {
    for (;;) {
      const now = Date.now();
      const bucket = this.buckets.get(key) ?? { tokens: this.capacity, last: now };
      const elapsed = now - bucket.last;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
      bucket.last = now;

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        this.buckets.set(key, bucket);
        return;
      }
      this.buckets.set(key, bucket);
      const waitMs = Math.ceil((1 - bucket.tokens) / this.refillPerMs);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/** No-op limiter for tests. */
export const noopRateLimiter: RateLimiter = { take: async () => {} };
