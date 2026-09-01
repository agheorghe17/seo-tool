import { desc, eq } from 'drizzle-orm';
import { db, interventions, rankSnapshots } from 'db';

type Kind = 'blueprint' | 'recommendation' | 'content' | 'roadmap' | 'internal_link' | 'manual';

/**
 * Epic 23 — log a change the user just applied, with a "before" snapshot. A weekly job
 * (`intervention-check`) later measures what actually happened and feeds `impact_calibration`.
 */
export async function recordIntervention(input: {
  siteId: string;
  kind: Kind;
  label: string;
  category?: string | null;
  targetUrl?: string | null;
  targetKeywordId?: string | null;
}): Promise<void> {
  let before: { position: number | null; clicks: number | null; impressions: number | null } | null = null;
  if (input.targetKeywordId) {
    const [snap] = await db
      .select({
        position: rankSnapshots.position,
        clicks: rankSnapshots.clicks,
        impressions: rankSnapshots.impressions,
      })
      .from(rankSnapshots)
      .where(eq(rankSnapshots.keywordId, input.targetKeywordId))
      .orderBy(desc(rankSnapshots.capturedAt))
      .limit(1);
    if (snap) before = { position: snap.position, clicks: snap.clicks, impressions: snap.impressions };
  }

  await db
    .insert(interventions)
    .values({
      siteId: input.siteId,
      kind: input.kind,
      category: input.category ?? null,
      targetUrl: input.targetUrl ?? null,
      targetKeywordId: input.targetKeywordId ?? null,
      label: input.label.slice(0, 300),
      before,
    })
    .catch(() => {
      /* logging an intervention must never break the user's action */
    });
}
