import { auditLog, db } from 'db';

/** Epic 10.6 — best-effort audit trail for sensitive actions. Never throws. */
export async function recordAudit(
  userId: string | null,
  action: string,
  subjectId?: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.insert(auditLog).values({ userId, action, subjectId: subjectId ?? null, meta });
  } catch {
    /* auditing must not break the request */
  }
}
