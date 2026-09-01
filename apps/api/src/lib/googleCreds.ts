import { and, eq } from 'drizzle-orm';
import { db, siteSecrets } from 'db';
import { decryptSecret, encryptSecret } from 'shared';

type GoogleSecretKind = 'gsc_refresh_token' | 'ga4_refresh_token' | 'gbp_refresh_token';

/** Load + decrypt a stored Google refresh token for a site. */
export async function loadGoogleRefreshToken(
  siteId: string,
  kind: GoogleSecretKind,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(siteSecrets)
    .where(and(eq(siteSecrets.siteId, siteId), eq(siteSecrets.kind, kind)));
  if (!row) return null;
  try {
    return decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
  } catch {
    return null;
  }
}

/** Upsert an encrypted Google refresh token for a site. */
export async function saveGoogleRefreshToken(
  siteId: string,
  kind: GoogleSecretKind,
  refreshToken: string,
): Promise<void> {
  const enc = encryptSecret(refreshToken);
  await db
    .insert(siteSecrets)
    .values({ siteId, kind, ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag })
    .onConflictDoUpdate({
      target: [siteSecrets.siteId, siteSecrets.kind],
      set: { ciphertext: enc.ciphertext, iv: enc.iv, tag: enc.tag, updatedAt: new Date() },
    });
}
