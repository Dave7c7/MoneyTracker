/**
 * Tests for the time-based one-time passwords.
 *
 * The vectors come from RFC 6238, appendix B: the same secret and the same
 * moments must give the same digits as the specification. They are truncated
 * to six digits, which is what the app shows.
 *
 * No database is needed here: this is arithmetic and HMAC, and it should be
 * right before anything is stored.
 */

import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normaliseRecoveryCode,
  normaliseTotpCode,
  otpauthUri,
  TOTP_PERIOD_SECONDS,
  TOTP_DIGITS,
  totpCode,
  totpStep,
  verifyTotp,
} from '../src/totp.ts';

/** The secret of RFC 6238: the ASCII digits 1 to 9 and 0, in base32. */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/** A moment in seconds since the epoch. */
const at = (seconds: number): Date => new Date(seconds * 1000);

describe('totpCode', () => {
  it('matches the RFC 6238 vectors', () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];

    for (const [seconds, expected] of vectors) {
      expect(totpCode(RFC_SECRET, at(seconds)), `T=${seconds}`).toBe(expected);
    }
  });

  it('gives the same code for a whole step, and a new one after it', () => {
    const start = 60 * 60 * 1000;
    const first = totpCode(RFC_SECRET, new Date(start));
    expect(totpCode(RFC_SECRET, new Date(start + 29_000))).toBe(first);
    expect(totpCode(RFC_SECRET, new Date(start + TOTP_PERIOD_SECONDS * 1000))).not.toBe(first);
  });

  it('is always the right number of digits', () => {
    for (let step = 0; step < 50; step += 1) {
      const code = totpCode(RFC_SECRET, new Date(step * TOTP_PERIOD_SECONDS * 1000));
      expect(code).toMatch(new RegExp(`^\\d{${TOTP_DIGITS}}$`));
    }
  });
});

describe('totpStep', () => {
  it('counts whole thirty-second steps from the epoch', () => {
    expect(totpStep(0)).toBe(0);
    expect(totpStep(29_999)).toBe(0);
    expect(totpStep(30_000)).toBe(1);
    expect(totpStep(59_000)).toBe(1);
  });
});

describe('verifyTotp', () => {
  const time = at(1111111111);

  it('accepts the code of this moment', () => {
    const checked = verifyTotp(RFC_SECRET, '050471', { time });
    expect(checked).toEqual({ ok: true, step: totpStep(time) });
  });

  it('accepts the code from one step before or after', () => {
    const previous = totpCode(RFC_SECRET, time.getTime() - TOTP_PERIOD_SECONDS * 1000);
    const next = totpCode(RFC_SECRET, time.getTime() + TOTP_PERIOD_SECONDS * 1000);

    expect(verifyTotp(RFC_SECRET, previous, { time }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, next, { time }).ok).toBe(true);
  });

  it('refuses a code from outside the window', () => {
    const old = totpCode(RFC_SECRET, time.getTime() - 2 * TOTP_PERIOD_SECONDS * 1000);
    expect(verifyTotp(RFC_SECRET, old, { time }).ok).toBe(false);
  });

  it('refuses a code that was already used', () => {
    const checked = verifyTotp(RFC_SECRET, '050471', { time });
    if (!checked.ok || checked.step === null) throw new Error('expected a match');

    // The same moment, with the step it was accepted at remembered.
    const again = verifyTotp(RFC_SECRET, '050471', { time, lastStep: checked.step });
    expect(again.ok).toBe(false);
  });

  it('refuses anything that is not six digits', () => {
    for (const code of ['', '05047', '0504711', 'abcdef', '050 471 x']) {
      expect(verifyTotp(RFC_SECRET, code, { time }).ok, code).toBe(false);
    }
  });

  it('refuses a well-formed but wrong code', () => {
    // '000000' cannot collide with the vector at this moment.
    expect(verifyTotp(RFC_SECRET, '000000', { time }).ok).toBe(false);
  });

  it('accepts a code typed with a space or a hyphen', () => {
    expect(verifyTotp(RFC_SECRET, '050 471', { time }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, '050-471', { time }).ok).toBe(true);
  });
});

describe('normaliseTotpCode', () => {
  it('strips spaces and hyphens', () => {
    expect(normaliseTotpCode(' 050 471 ')).toBe('050471');
    expect(normaliseTotpCode('050-471')).toBe('050471');
  });
});

describe('the secret', () => {
  it('is twenty random bytes in base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it('is different every time', () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(20);
  });

  it('survives a round trip, whatever the case and spacing', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret.toLowerCase())).toEqual(base32Decode(secret));
    expect(base32Decode(`${secret.slice(0, 4)} ${secret.slice(4)}`)).toEqual(base32Decode(secret));
    expect(base32Decode(`${secret}====`)).toEqual(base32Decode(secret));
  });

  it('refuses letters that are not in the alphabet', () => {
    expect(() => base32Decode('not a secret!')).toThrow();
  });
});

describe('recovery codes', () => {
  it('gives eight codes that look typeable and are all different', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  });

  it('hashes the code, not the dashes or the case', () => {
    const [code] = generateRecoveryCodes();
    if (!code) throw new Error('expected a code');

    const hash = hashRecoveryCode(code);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRecoveryCode(code.toLowerCase())).toBe(hash);
    expect(hashRecoveryCode(code.replace('-', ' '))).toBe(hash);
    expect(hash).not.toContain(code.replace('-', ''));
  });

  it('gives a different hash for a different code', () => {
    const [first, second] = generateRecoveryCodes(2);
    if (!first || !second) throw new Error('expected two codes');
    expect(hashRecoveryCode(first)).not.toBe(hashRecoveryCode(second));
  });
});

describe('normaliseRecoveryCode', () => {
  it('uppercases and strips spacing', () => {
    expect(normaliseRecoveryCode(' abcde fghij ')).toBe('ABCDEFGHIJ');
    expect(normaliseRecoveryCode('abcde-fghij')).toBe('ABCDEFGHIJ');
  });
});

describe('otpauthUri', () => {
  it('carries the secret, the issuer and the settings an app needs', () => {
    const uri = otpauthUri({ secret: RFC_SECRET, account: 'you@example.com' });
    expect(uri.startsWith('otpauth://totp/MoneyTracker:you%40example.com?')).toBe(true);

    const query = new URLSearchParams(uri.split('?')[1]);
    expect(query.get('secret')).toBe(RFC_SECRET);
    expect(query.get('issuer')).toBe('MoneyTracker');
    expect(query.get('digits')).toBe('6');
    expect(query.get('period')).toBe('30');
    expect(query.get('algorithm')).toBe('SHA1');
  });
});
