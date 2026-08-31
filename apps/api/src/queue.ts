import PgBoss from 'pg-boss';
import type { JobType } from 'shared';
import { getEnv } from './env.js';

/**
 * The API only ENQUEUES jobs. The worker (apps/worker) owns all handlers.
 * pg-boss runs on the same Postgres as the app data — no Redis needed for the queue.
 */
let boss: PgBoss | null = null;

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  boss = new PgBoss({ connectionString: getEnv().DATABASE_URL });
  boss.on('error', (err) => console.error('[pg-boss]', err));
  await boss.start();
  return boss;
}

export async function enqueue<T extends object>(type: JobType, data: T): Promise<string | null> {
  const q = await getQueue();
  return q.send(type, data);
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
  }
}
