/**
 * The mock data source.
 *
 * It implements the same adapter interface as a live bank connection, so
 * nothing else in the app changes when the real thing arrives.
 */

import type {
  DataSourceAdapter,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTransaction,
} from '@moneytracker/core';

import { generateMockData, type MockDataOptions } from './generator.ts';

/**
 * A data source that generates realistic demo data.
 *
 * @example
 * const adapter = new MockAdapter({ seed: 7 });
 * await adapter.fetchAccounts(); // three accounts
 */
export class MockAdapter implements DataSourceAdapter {
  readonly id = 'mock';

  private readonly options: MockDataOptions;

  constructor(options: MockDataOptions = {}) {
    this.options = options;
  }

  async fetchAccounts(): Promise<NormalizedAccount[]> {
    return generateMockData(this.options).accounts;
  }

  async fetchTransactions(accountId: string, since?: Date): Promise<NormalizedTransaction[]> {
    const dataset = generateMockData(this.options);
    const transactions = dataset.transactions.get(accountId) ?? [];
    if (!since) return transactions;

    const cutoff = since.getTime();
    return transactions.filter((transaction) => {
      if (!transaction.postedAt) return true;
      return transaction.postedAt.getTime() >= cutoff;
    });
  }

  async fetchBalances(): Promise<NormalizedBalance[]> {
    return generateMockData(this.options).balances;
  }
}
