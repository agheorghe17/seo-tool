import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, generateEncryptionKey } from './crypto.js';

describe('crypto', () => {
  const key = generateEncryptionKey();

  it('round-trips a secret', () => {
    const plaintext = 'xxxx yyyy zzzz 1234 abcd ef00';
    const enc = encryptSecret(plaintext, key);
    expect(enc.ciphertext).not.toContain(plaintext);
    expect(decryptSecret(enc, key)).toBe(plaintext);
  });

  it('fails auth check when the tag is tampered', () => {
    const enc = encryptSecret('secret', key);
    const tampered = { ...enc, tag: Buffer.from('0'.repeat(24)).toString('base64') };
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encryptSecret('x', 'too-short')).toThrow(/32 bytes/);
  });
});
