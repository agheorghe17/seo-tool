/**
 * Epic 1.4 + Epic 6 — WordPress REST client authenticated with an Application Password.
 * Credentials come decrypted from `site_secrets` (never stored in plaintext).
 */

export interface WpCredentials {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

export interface WpConnectionInfo {
  ok: boolean;
  restBase: string;
  types: string[];
  seoPlugin: 'yoast' | 'rankmath' | null;
}

export async function testConnection(_creds: WpCredentials): Promise<WpConnectionInfo> {
  throw new Error('not implemented — Epic 1.4');
}

export interface ApplyMetaInput {
  creds: WpCredentials;
  objectType: 'post' | 'page' | 'media';
  objectId: number;
  fields: Partial<{ title: string; metaTitle: string; metaDescription: string; altText: string }>;
}

export interface ApplyResult {
  applied: boolean;
  previous: Record<string, unknown>;
}

/** Epic 6.4/6.5 — write a safe fix, returning the previous values for rollback. */
export async function applyMeta(_input: ApplyMetaInput): Promise<ApplyResult> {
  throw new Error('not implemented — Epic 6.4');
}
