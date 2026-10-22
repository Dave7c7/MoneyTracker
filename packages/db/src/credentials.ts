/**
 * Credential storage.
 *
 * A provider gives the app a token. The token is a password: anyone with it
 * can read the transactions. It is encrypted with AES-256-GCM before it
 * touches the database, and it never leaves the server in clear text.
 *
 * The key comes from `ENCRYPTION_KEY`. It is 32 bytes, written as hex, and
 * it is not in the repository: the app refuses to store a credential without
 * it.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** The version of the stored format. */
const FORMAT_VERSION = 'v1';

/**
 * Encrypts a secret with AES-256-GCM.
 *
 * The result is `v1:<iv>:<tag>:<ciphertext>`, with everything after the
 * version in base64. The key is 32 bytes of hex.
 *
 * @example
 * encryptSecret('token', key); // 'v1:...'
 */
export function encryptSecret(plaintext: string, keyHex: string): string {
  const key = parseKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a secret that was encrypted with `encryptSecret`.
 *
 * A payload that was tampered with fails loudly instead of returning
 * something wrong.
 *
 * @example
 * decryptSecret(stored, key); // 'token'
 */
export function decryptSecret(payload: string, keyHex: string): string {
  const parts = payload.split(':');
  const [version, ivPart, tagPart, dataPart] = parts;
  if (version !== FORMAT_VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error('The stored credential is not in a format this app understands');
  }

  const key = parseKey(keyHex);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Whether a value looks like an encryption key.
 *
 * @example
 * isEncryptionKey('a'.repeat(64)); // true
 */
export function isEncryptionKey(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{64}$/i.test(value.trim());
}

/** Reads the key and says what is wrong with it when it is not usable. */
function parseKey(keyHex: string): Buffer {
  if (!isEncryptionKey(keyHex)) {
    throw new Error(
      'ENCRYPTION_KEY must be 32 bytes written as hex (64 characters). ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return Buffer.from(keyHex.trim(), 'hex');
}
