/**
 * AES-256-GCM encryption for site secrets (WordPress Application Passwords, GSC refresh tokens).
 *
 * Storage shape (table `site_secrets`): { ciphertext, iv, tag } — all base64.
 * The key comes from `ENCRYPTION_KEY` (32 bytes, base64 or hex). Never log decrypted values.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

function loadKey(rawKey: string | undefined = process.env.ENCRYPTION_KEY): Buffer {
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY is not set');
  }
  // Accept base64 or hex; must decode to exactly 32 bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    key = Buffer.from(rawKey, 'hex');
  } else {
    key = Buffer.from(rawKey, 'base64');
  }
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

export function encryptSecret(plaintext: string, rawKey?: string): EncryptedSecret {
  const key = loadKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(secret: EncryptedSecret, rawKey?: string): string {
  const key = loadKey(rawKey);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Generate a fresh 32-byte key as base64 — for `ENCRYPTION_KEY`. */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}
