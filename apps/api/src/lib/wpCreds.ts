import { and, eq } from 'drizzle-orm';
import { db, siteSecrets, sites } from 'db';
import { decryptSecret } from 'shared';
import type { WpCredentials } from 'connectors/wordpress';

/** Load + decrypt the WordPress Application Password for a site. */
export async function loadWpCreds(siteId: string): Promise<WpCredentials | null> {
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!site?.wpSiteUrl || site.connectionType !== 'wordpress') return null;

  const [secret] = await db
    .select()
    .from(siteSecrets)
    .where(and(eq(siteSecrets.siteId, siteId), eq(siteSecrets.kind, 'wp_app_password')));
  if (!secret) return null;

  const username = (secret.meta as { username?: string } | null)?.username;
  if (!username) return null;

  const applicationPassword = decryptSecret({
    ciphertext: secret.ciphertext,
    iv: secret.iv,
    tag: secret.tag,
  });
  return { siteUrl: site.wpSiteUrl, username, applicationPassword };
}
