import { describe, expect, it } from 'vitest';

import { hashPassword, passwordProblem, verifyPassword } from '../src/password.ts';

describe('password hashing', () => {
  it('accepts the password it hashed', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(stored, 'correct horse battery staple')).toBe(true);
  });

  it('refuses a different password', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(stored, 'correct horse battery stapl')).toBe(false);
    expect(await verifyPassword(stored, 'Correct horse battery staple')).toBe(false);
    expect(await verifyPassword(stored, '')).toBe(false);
  });

  it('never stores the password itself', async () => {
    const password = 'supersecretpassphrase';
    const stored = await hashPassword(password);
    expect(stored).not.toContain(password);
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('gives two hashes of the same password different salts', async () => {
    const first = await hashPassword('same password twice');
    const second = await hashPassword('same password twice');
    expect(first).not.toBe(second);
    expect(await verifyPassword(first, 'same password twice')).toBe(true);
    expect(await verifyPassword(second, 'same password twice')).toBe(true);
  });

  it('treats a missing or malformed hash as no match, instead of crashing', async () => {
    expect(await verifyPassword(null, 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
    expect(await verifyPassword('sha256$deadbeef', 'anything')).toBe(false);
    expect(await verifyPassword('scrypt$0$8$1$aa$bb', 'anything')).toBe(false);
    expect(await verifyPassword('scrypt$16384$8$1$zz$bb', 'anything')).toBe(false);
  });

  it('keeps the parameters with the hash, so they can be raised later', async () => {
    const stored = await hashPassword('a password worth keeping');
    expect(stored.split('$')[1]).toBe('16384');
  });

  it('asks for a long enough password', () => {
    expect(passwordProblem('short')).toMatch(/at least 10 characters/);
    expect(passwordProblem('long enough')).toBeNull();
    expect(passwordProblem('x'.repeat(2000))).toMatch(/too long/);
  });
});
