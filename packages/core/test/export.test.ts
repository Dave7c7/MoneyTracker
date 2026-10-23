import { describe, expect, it } from 'vitest';

import {
  exportFileName,
  formatExportAmount,
  transactionsToCsv,
  TRANSACTION_EXPORT_HEADERS,
  type ExportTransaction,
} from '../src/export.ts';

/** A transaction with everything filled in, so a test changes one thing. */
function transaction(overrides: Partial<ExportTransaction> = {}): ExportTransaction {
  return {
    postedDate: '2026-10-01',
    description: 'BLUE BOTTLE COFFEE',
    merchant: 'Blue Bottle',
    category: 'Coffee',
    account: 'SoFi Checking',
    amountMinor: -450,
    currency: 'USD',
    pending: false,
    transfer: false,
    categorySource: 'merchant_memory',
    categoryReason: 'You chose Coffee for Blue Bottle once.',
    ...overrides,
  };
}

describe('the transaction export', () => {
  it('writes a header and one line per transaction', () => {
    const csv = transactionsToCsv([transaction(), transaction({ description: 'ACME PAYROLL' })]);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(TRANSACTION_EXPORT_HEADERS.join(','));
    expect(lines).toHaveLength(4); // header, two rows, and the empty tail
    expect(lines[3]).toBe('');
    expect(lines[1]).toContain('2026-10-01,BLUE BOTTLE COFFEE');
  });

  it('still writes the header when there is nothing to export', () => {
    expect(transactionsToCsv([])).toBe(`${TRANSACTION_EXPORT_HEADERS.join(',')}\r\n`);
  });

  it('keeps the sign and two places of every amount', () => {
    expect(formatExportAmount(-450)).toBe('-4.50');
    expect(formatExportAmount(250_000)).toBe('2500.00');
    expect(formatExportAmount(0)).toBe('0.00');
    expect(formatExportAmount(-5)).toBe('-0.05');

    const row = transactionsToCsv([transaction({ amountMinor: -5 })]).split('\r\n')[1] ?? '';
    expect(row.split(',')[5]).toBe('-0.05');
  });

  it('quotes a value with a comma, a quote or a line break', () => {
    const csv = transactionsToCsv([
      transaction({ description: 'SHOP, INC' }),
      transaction({ description: 'THE "BEST" SHOP' }),
      transaction({ description: 'TWO\nLINES' }),
    ]);

    expect(csv).toContain('"SHOP, INC"');
    expect(csv).toContain('"THE ""BEST"" SHOP"');
    expect(csv).toContain('"TWO\nLINES"');
  });

  it('does not let a description become a spreadsheet formula', () => {
    const csv = transactionsToCsv([
      transaction({ description: '=HYPERLINK("http://example.test","click")' }),
      transaction({ description: '+1 (555) 0100' }),
      transaction({ description: '@here' }),
    ]);

    // A leading apostrophe is the spreadsheet's way of saying "text".
    expect(csv).toContain(`"'=HYPERLINK(""http://example.test"",""click"")"`);
    expect(csv).toContain("'+1 (555) 0100");
    expect(csv).toContain("'@here");
  });

  it('leaves a negative amount alone, because it is a number', () => {
    const row = transactionsToCsv([transaction()]).split('\r\n')[1] ?? '';
    expect(row.split(',')[5]).toBe('-4.50');
  });

  it('writes empty cells for what is not known', () => {
    const row = transactionsToCsv([
      transaction({
        merchant: null,
        category: null,
        postedDate: null,
        categorySource: null,
        categoryReason: null,
      }),
    ]).split('\r\n')[1];
    const cells = (row ?? '').split(',');

    expect(cells[0]).toBe('');
    expect(cells[2]).toBe('');
    expect(cells[3]).toBe('');
    expect(cells[9]).toBe('');
  });

  it('names the file after the day it was made', () => {
    expect(exportFileName('csv', '2026-10-23')).toBe('moneytracker-transactions-2026-10-23.csv');
    expect(exportFileName('json', '2026-10-23')).toBe('moneytracker-transactions-2026-10-23.json');
  });
});
