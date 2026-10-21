/**
 * The shared adapter contract.
 *
 * Every data source runs this suite, so a new adapter is proven to behave
 * like the others before it reaches the app.
 */

import { describe, expect, it } from 'vitest';

import type { DataSourceAdapter } from '@moneytracker/core';

/**
 * Runs the contract suite against one adapter.
 *
 * @example
 * describeAdapterContract('mock', () => new MockAdapter());
 */
export function describeAdapterContract(name: string, factory: () => DataSourceAdapter): void {
  describe(`${name} adapter contract`, () => {
    it('exposes a stable id', () => {
      const adapter = factory();
      expect(typeof adapter.id).toBe('string');
      expect(adapter.id.length).toBeGreaterThan(0);
      expect(adapter.id).toBe(factory().id);
    });

    it('returns accounts with the fields the app needs', async () => {
      const accounts = await factory().fetchAccounts();
      expect(accounts.length).toBeGreaterThan(0);

      for (const account of accounts) {
        expect(typeof account.externalId).toBe('string');
        expect(account.externalId.length).toBeGreaterThan(0);
        expect(typeof account.name).toBe('string');
        expect(['checking', 'savings', 'credit_card', 'loan', 'cash']).toContain(account.type);
        expect(account.currency).toMatch(/^[A-Z]{3}$/);
        // Full account numbers must never leave the adapter.
        if (account.mask !== undefined) {
          expect(account.mask.length).toBeLessThanOrEqual(4);
        }
      }
    });

    it('returns unique external ids per account', async () => {
      const accounts = await factory().fetchAccounts();
      const ids = accounts.map((account) => account.externalId);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('returns transactions with integer minor units', async () => {
      const adapter = factory();
      const accounts = await adapter.fetchAccounts();

      for (const account of accounts) {
        const transactions = await adapter.fetchTransactions(account.externalId);
        for (const transaction of transactions) {
          expect(Number.isSafeInteger(transaction.amountMinor)).toBe(true);
          expect(transaction.currency).toMatch(/^[A-Z]{3}$/);
          expect(transaction.accountId).toBe(account.externalId);
          expect(typeof transaction.descriptionRaw).toBe('string');
          expect(transaction.descriptionRaw.length).toBeGreaterThan(0);
          if (transaction.pending) {
            expect(transaction.postedAt).toBeNull();
          }
        }
      }
    });

    it('uses unique external ids per account', async () => {
      const adapter = factory();
      const accounts = await adapter.fetchAccounts();

      for (const account of accounts) {
        const transactions = await adapter.fetchTransactions(account.externalId);
        const ids = transactions.map((transaction) => transaction.externalId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it('returns nothing for an unknown account', async () => {
      const transactions = await factory().fetchTransactions('no-such-account');
      expect(transactions).toEqual([]);
    });

    it('honours the since filter', async () => {
      const adapter = factory();
      const accounts = await adapter.fetchAccounts();
      const account = accounts[0];
      if (!account) throw new Error('adapter returned no accounts');

      const all = await adapter.fetchTransactions(account.externalId);
      const cutoff = new Date('2026-06-01T00:00:00.000Z');
      const recent = await adapter.fetchTransactions(account.externalId, cutoff);

      expect(recent.length).toBeLessThanOrEqual(all.length);
      for (const transaction of recent) {
        if (!transaction.postedAt) continue;
        expect(transaction.postedAt.getTime()).toBeGreaterThanOrEqual(cutoff.getTime());
      }
    });

    it('returns balances when the adapter implements them', async () => {
      const adapter = factory();
      if (!adapter.fetchBalances) return;

      const balances = await adapter.fetchBalances();
      for (const balance of balances) {
        expect(Number.isSafeInteger(balance.balanceMinor)).toBe(true);
        expect(balance.currency).toMatch(/^[A-Z]{3}$/);
        expect(balance.asOf).toBeInstanceOf(Date);
      }
    });

    it('is deterministic', async () => {
      const first = await factory().fetchTransactions(
        (await factory().fetchAccounts())[0]!.externalId,
      );
      const second = await factory().fetchTransactions(
        (await factory().fetchAccounts())[0]!.externalId,
      );
      expect(first).toEqual(second);
    });
  });
}
