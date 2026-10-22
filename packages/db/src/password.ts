/**
 * Password hashing.
 *
 * A password is never stored. What is stored is the result of scrypt, with a
 * random salt per password, so two people with the same password get different
 * hashes and a stolen database does not hand out passwords.
 *
 * scrypt is used rather than a plain hash because it is deliberately slow and
 * memory hungry: a guess costs the attacker real time and real memory. It is
 * part of node, so no dependency is added.
 *
 * The stored format is `scrypt$<n>$<r>$<p>$<salt>$<hash>`, all hex, so the
 * parameters travel with the hash and can be raised later without breaking the
 * passwords that are already stored.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

export { MIN_PASSWORD_LENGTH, passwordProblem } from '@moneytracker/core';

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** The cost parameters of a new hash. */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** The length of the derived key, in bytes. */
const KEY_LENGTH = 32;

/** The length of the salt, in bytes. */
const SALT_LENGTH = 16;

/**
 * Hashes a password so it can be stored.
 *
 * @example
 * const stored = await hashPassword('correct horse battery staple');
 * // scrypt$16384$8$1$<salt>$<hash>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$');
}

/**
 * Whether a password matches the stored hash.
 *
 * The comparison is constant time, so a caller cannot learn the hash byte by
 * byte from how long a wrong password takes.
 *
 * @example
 * await verifyPassword(stored, 'correct horse battery staple'); // true
 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split('$');
  if (parts.length !== 6) return false;

  const [scheme, nPart, rPart, pPart, saltPart, hashPart] = parts;
  if (scheme !== 'scrypt' || !nPart || !rPart || !pPart || !saltPart || !hashPart) return false;

  const N = Number(nPart);
  const r = Number(rPart);
  const p = Number(pPart);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N <= 1 || r < 1 || p < 1) return false;

  const expected = Buffer.from(hashPart, 'hex');
  if (expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(
      password.normalize('NFKC'),
      Buffer.from(saltPart, 'hex'),
      expected.length,
      {
        N,
        r,
        p,
        maxmem: 256 * 1024 * 1024,
      },
    );
  } catch {
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
