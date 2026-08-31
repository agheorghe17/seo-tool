/** Bounded-concurrency map. Runs `fn` over `items`, at most `concurrency` in flight. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const queue = items.map((item, index) => ({ item, index }));
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await fn(next.item, next.index);
    }
  });
  await Promise.all(workers);
}
