/**
 * The CSV data source.
 *
 * A bank export is a source like any other: the adapter turns a file into
 * accounts and transactions, and everything downstream treats it the same way
 * it treats a live connection.
 *
 * What makes a file different is that its layout is not known in advance.
 * Every institution names its columns differently, writes its dates
 * differently and has its own idea of which sign means "money left". So the
 * adapter is told how to read the file through a mapping profile, and the
 * profile is saved so the next export of the same bank is read the same way.
 */

import { createHash } from 'node:crypto';

import {
  parseCsvRows,
  type AccountType,
  type CsvMapping,
  type CsvParseOutcome,
  type DataSourceAdapter,
  type NormalizedAccount,
  type NormalizedTransaction,
} from '@moneytracker/core';

/** What the adapter needs to read one file. */
export interface CsvAdapterOptions {
  /** The file, as text. */
  content: string;
  /** How to read the file. */
  mapping: CsvMapping;
  /**
   * Stable key of the account this file belongs to.
   *
   * It comes from the profile, so the same profile always lands on the same
   * account, and a second import of the same file updates the first one
   * instead of creating a second account.
   */
  accountKey: string;
  /** Name of the account, used when the file does not name one. */
  accountName: string;
  /** Kind of account. */
  accountType: AccountType;
  /** Currency of the account. */
  currency: string;
}

/** A file, read. */
export interface CsvFileRead {
  /** What the file contained. */
  outcome: CsvParseOutcome;
  /** The accounts the file belongs to. */
  accounts: NormalizedAccount[];
  /** The transactions in the file. */
  transactions: NormalizedTransaction[];
}

/**
 * Reads a file into accounts and transactions.
 *
 * The preview and the import both use this, so the preview shows exactly
 * what the import will do.
 *
 * @example
 * const read = readCsvFile({ content: text, mapping, accountKey: 'sofi', accountName: 'SoFi Checking', accountType: 'checking', currency: 'USD' });
 * read.transactions.length; // 412
 */
export function readCsvFile(options: CsvAdapterOptions): CsvFileRead {
  const { mapping } = options;
  const outcome = parseCsvRows(options.content, mapping);

  const currency = options.currency.toUpperCase();
  const accounts: NormalizedAccount[] = [];
  const accountIdByKey = new Map<string, string>();

  if (outcome.accountKeys.length > 0) {
    // A file that names its accounts holds several of them.
    for (const key of outcome.accountKeys) {
      const externalId = `${options.accountKey}:${key}`;
      accountIdByKey.set(key, externalId);
      accounts.push({
        externalId,
        name: key,
        type: options.accountType,
        currency,
      });
    }
  } else {
    const externalId = options.accountKey;
    accountIdByKey.set('', externalId);
    accounts.push({
      externalId,
      name: options.accountName,
      type: options.accountType,
      currency,
    });
  }

  const transactions: NormalizedTransaction[] = [];

  for (const row of outcome.rows) {
    const accountId = accountIdByKey.get(row.accountKey);
    if (!accountId) continue;

    transactions.push({
      externalId: transactionId({
        accountId,
        date: row.date,
        amountMinor: row.amountMinor,
        description: row.description,
        occurrence: row.occurrence,
      }),
      accountId,
      postedAt: new Date(`${row.date}T00:00:00.000Z`),
      pending: false,
      amountMinor: row.amountMinor,
      currency,
      descriptionRaw: row.description,
      sourceCategory: row.sourceCategory ?? undefined,
    });
  }

  return { outcome, accounts, transactions };
}

/**
 * A data source that reads a file export.
 *
 * @example
 * const adapter = new CsvAdapter({ content: text, mapping, accountKey: 'sofi', accountName: 'SoFi', accountType: 'checking', currency: 'USD' });
 * await adapter.fetchAccounts();
 */
export class CsvAdapter implements DataSourceAdapter {
  readonly id = 'csv';

  private readonly options: CsvAdapterOptions;
  private read: CsvFileRead | null = null;

  constructor(options: CsvAdapterOptions) {
    this.options = options;
  }

  async fetchAccounts(): Promise<NormalizedAccount[]> {
    return this.readFile().accounts;
  }

  async fetchTransactions(accountId: string, since?: Date): Promise<NormalizedTransaction[]> {
    const transactions = this.readFile().transactions.filter(
      (transaction) => transaction.accountId === accountId,
    );
    if (!since) return transactions;

    const cutoff = since.getTime();
    return transactions.filter((transaction) => {
      if (!transaction.postedAt) return true;
      return transaction.postedAt.getTime() >= cutoff;
    });
  }

  /** Reads the file once and keeps the result. */
  private readFile(): CsvFileRead {
    this.read ??= readCsvFile(this.options);
    return this.read;
  }
}

/**
 * The id of a transaction.
 *
 * It is derived from the account, the date, the amount and the description,
 * so importing the same file twice lands on the same rows instead of making
 * new ones. The occurrence number keeps two identical rows apart.
 */
function transactionId(options: {
  accountId: string;
  date: string;
  amountMinor: number;
  description: string;
  occurrence: number;
}): string {
  const description = options.description.trim().replace(/\s+/g, ' ');
  const signature = [
    options.accountId,
    options.date,
    options.amountMinor,
    description,
    options.occurrence,
  ].join('|');

  return createHash('sha256').update(signature).digest('hex').slice(0, 32);
}
