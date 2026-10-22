import { describe, expect, it } from 'vitest';

import { createCsvMapping, type CsvMapping } from '@moneytracker/core';

import { CsvAdapter, readCsvFile } from '../src/csv/index.ts';
import { describeAdapterContract } from './contract.ts';

const MAPPING: CsvMapping = createCsvMapping({
  dateColumn: 'Date',
  amountColumn: 'Amount',
  descriptionColumn: 'Description',
});

const FILE = [
  'Date,Amount,Description',
  '2026-01-05,-12.34,BLUE BOTTLE COFFEE',
  '2026-01-06,2500.00,PAYROLL',
  '2026-01-06,-45.00,BOOK STORE',
].join('\n');

const OPTIONS = {
  content: FILE,
  mapping: MAPPING,
  accountKey: 'csv:sofi-checking',
  accountName: 'SoFi Checking',
  accountType: 'checking' as const,
  currency: 'USD',
};

describeAdapterContract('csv', () => new CsvAdapter(OPTIONS));

describe('readCsvFile', () => {
  it('reads the accounts of a file that names none', () => {
    const read = readCsvFile(OPTIONS);

    expect(read.accounts).toHaveLength(1);
    expect(read.accounts[0]).toMatchObject({
      externalId: 'csv:sofi-checking',
      name: 'SoFi Checking',
      type: 'checking',
      currency: 'USD',
    });
  });

  it('reads one account per name when the file names them', () => {
    const read = readCsvFile({
      ...OPTIONS,
      content: [
        'Date,Account,Amount,Description',
        '2026-01-05,Checking,-1.00,COFFEE',
        '2026-01-06,Savings,-2.00,BOOK',
      ].join('\n'),
      mapping: createCsvMapping({ ...MAPPING, accountColumn: 'Account' }),
    });

    expect(read.accounts.map((account) => account.externalId)).toEqual([
      'csv:sofi-checking:Checking',
      'csv:sofi-checking:Savings',
    ]);
    expect(read.transactions.map((transaction) => transaction.accountId)).toEqual([
      'csv:sofi-checking:Checking',
      'csv:sofi-checking:Savings',
    ]);
  });

  it('keeps money out negative', () => {
    const read = readCsvFile(OPTIONS);

    expect(read.transactions.map((transaction) => transaction.amountMinor)).toEqual([
      -1234, 250000, -4500,
    ]);
  });

  it('gives every row the same id when the file is read twice', () => {
    const first = readCsvFile(OPTIONS);
    const second = readCsvFile(OPTIONS);

    expect(first.transactions.map((t) => t.externalId)).toEqual(
      second.transactions.map((t) => t.externalId),
    );
  });

  it('gives identical rows different ids', () => {
    const read = readCsvFile({
      ...OPTIONS,
      content: [
        'Date,Amount,Description',
        '2026-01-05,-4.50,COFFEE',
        '2026-01-05,-4.50,COFFEE',
      ].join('\n'),
    });

    const ids = read.transactions.map((transaction) => transaction.externalId);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps the bank category of a row', () => {
    const read = readCsvFile({
      ...OPTIONS,
      content: 'Date,Amount,Description,Category\n2026-01-05,-1.00,COFFEE,Food and drink',
      mapping: createCsvMapping({ ...MAPPING, categoryColumn: 'Category' }),
    });

    expect(read.transactions[0]?.sourceCategory).toBe('Food and drink');
  });

  it('posts a transaction on the day the file says', () => {
    const read = readCsvFile(OPTIONS);

    expect(read.transactions[0]?.postedAt?.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(read.transactions[0]?.pending).toBe(false);
  });

  it('reports the rows it could not read', () => {
    const read = readCsvFile({
      ...OPTIONS,
      content: ['Date,Amount,Description', 'nope,-1.00,COFFEE'].join('\n'),
    });

    expect(read.transactions).toHaveLength(0);
    expect(read.outcome.errors).toHaveLength(1);
    expect(read.outcome.errors[0]?.rowNumber).toBe(2);
  });

  it('reads a file in a currency without decimals', () => {
    const read = readCsvFile({
      ...OPTIONS,
      currency: 'JPY',
      content: 'Date,Amount,Description\n2026-01-05,-1200,COFFEE',
    });

    // Yen has no decimals, so 1200 yen is 1200 minor units.
    expect(read.transactions[0]?.amountMinor).toBe(-1200);
    expect(read.transactions[0]?.currency).toBe('JPY');
  });
});
