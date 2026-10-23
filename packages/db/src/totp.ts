/**
 * Time-based one-time passwords (RFC 6238), in as few lines as is honest.
 *
 * An authenticator app and this server share a secret. Every thirty seconds
 * both turn the current time into the same six digits, so the code proves the
 * person holds the shared secret and not just the password. Nothing is sent
 * between them: the code is only useful for the half-minute it belongs to.
 *
 * The secret is twenty random bytes, written in base32 because that is what
 * authenticator apps scan and type. Codes are checked with a constant-time
 * comparison, and a code that was already used is refused even if its
 * half-minute has not quite ended.
 *
 * No dependency: HMAC-SHA1 is in node, and the algorithm is short enough to
 * read.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a code belongs to, in seconds. */
export const TOTP_PERIOD_SECONDS = 30;

/** How many digits a code has. */
export const TOTP_DIGITS = 6;

/**
 * How many steps on either side of now are accepted.
 *
 * One step is thirty seconds, which covers a phone whose clock is a little
 * behind the server's without widening the guessable window much.
 */
export const TOTP_WINDOW = 1;

/** How many recovery codes an enrolment gives out. */
export const RECOVERY_CODE_COUNT = 8;

/** The alphabet of base32, which is what authenticator apps expect. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * A new shared secret, in base32.
 *
 * @example
 * generateTotpSecret(); // 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
 */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/**
 * The counter a moment belongs to: whole thirty-second steps since the epoch.
 *
 * @example
 * totpStep(new Date('2026-10-23T03:15:00Z')); // 59772210
 */
export function totpStep(time: Date | number = Date.now()): number {
  const milliseconds = typeof time === 'number' ? time : time.getTime();
  return Math.floor(milliseconds / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * The six digits for a secret at a moment.
 *
 * @example
 * totpCode(secret, new Date()); // '287082'
 */
export function totpCode(secret: string, time: Date | number = Date.now()): string {
  return codeForStep(secret, totpStep(time));
}

/**
 * Checks a code against a secret, allowing for a clock a little off.
 *
 * `lastStep` refuses a code that has already been used, which is what stops
 * someone who watched a code go by from using it again.
 *
 * @example
 * verifyTotp(secret, '287082', { time, lastStep: null }); // { ok: true, step }
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { time?: Date | number; window?: number; lastStep?: number | null } = {},
): { ok: boolean; step: number | null } {
  const normalised = normaliseTotpCode(code);
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalised)) return { ok: false, step: null };

  const time = options.time ?? Date.now();
  const window = options.window ?? TOTP_WINDOW;
  const current = totpStep(time);
  const lastStep = options.lastStep ?? null;

  let matched: number | null = null;
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    if (step < 0) continue;
    if (lastStep !== null && step <= lastStep) continue;

    // A constant-time comparison: the length and every digit are always read.
    if (equalsInConstantTime(codeForStep(secret, step), normalised)) {
      matched = step;
    }
  }

  return { ok: matched !== null, step: matched };
}

/**
 * Strips what a person types around a code: spaces and hyphens.
 *
 * @example
 * normaliseTotpCode(' 287 082 '); // '287082'
 */
export function normaliseTotpCode(code: string): string {
  return code.replace(/[\s-]/g, '');
}

/**
 * The `otpauth://` address an authenticator app scans or opens.
 *
 * The app has no QR renderer and no dependency for one, so the address and the
 * secret are shown as text: every authenticator accepts a typed secret, and a
 * phone can open the link.
 *
 * @example
 * otpauthUri({ secret, account: 'you@example.com' });
 * // 'otpauth://totp/MoneyTracker:you%40example.com?secret=...&issuer=MoneyTracker'
 */
export function otpauthUri(input: { secret: string; account: string; issuer?: string }): string {
  const issuer = input.issuer ?? 'MoneyTracker';
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(input.account)}`;
  const query = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/**
 * Fresh recovery codes, in the form a person writes down.
 *
 * Ten characters of base32 is fifty bits, and eight of them are single use.
 *
 * @example
 * generateRecoveryCodes(); // ['ABCDE-FGHIJ', ...]
 */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const raw = base32Encode(randomBytes(7)).slice(0, 10);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

/**
 * The stored form of a recovery code: a hash, never the code.
 *
 * Fifty bits is not guessable, so a plain SHA-256 is enough; a slow hash would
 * only make signing in with a code slower.
 *
 * @example
 * hashRecoveryCode('abcde-fghij'); // 64 hex characters
 */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normaliseRecoveryCode(code)).digest('hex');
}

/**
 * Strips what a person types around a recovery code.
 *
 * @example
 * normaliseRecoveryCode('abcde fghij'); // 'ABCDEFGHIJ'
 */
export function normaliseRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** The digits for one step, as the specification writes them. */
function codeForStep(secret: string, step: number): string {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/** Compares two strings without letting their difference steer the clock. */
function equalsInConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Encodes bytes as base32, without padding. */
function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Decodes base32, ignoring padding and spacing, and refusing anything else. */
export function base32Decode(secret: string): Buffer {
  const cleaned = secret.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error('That is not a base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
