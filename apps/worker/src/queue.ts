import type PgBoss from 'pg-boss';
import type { JobPayloads } from './jobs/types.js';

/** Epic 9.2/9.3 — every pipeline hand-off uses the same retry + expiry policy. */
export const JOB_SEND_OPTIONS: PgBoss.SendOptions = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60 * 30,
};

export function sendNext<K extends keyof JobPayloads>(
  boss: PgBoss,
  type: K,
  data: JobPayloads[K],
): Promise<string | null> {
  return boss.send(type, data as object, { ...JOB_SEND_OPTIONS });
}
