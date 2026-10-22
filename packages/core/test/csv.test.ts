import { describe, expect, it } from 'vitest';

import {
  applyAmountSign,
  createCsvMapping,
  currencyMinorUnits,
  detectDelimiter,
  parseAmountToMinor,
  parseCsv,
  parseCsvDate,
  parseCsvRows,
} from '../src/csv.ts';

const OPTIONS = { decimalSeparator: 'auto' as const, minorUnits: 2 };

describe('detectDelimiter', () => {
  it('finds the delimiter a file uses', () => {
    expect(detectDelimiter('date,amount\n2026-01-01,10')).toBe(',');
    expect(detectDelimiter('date;amount\n2026-01-01;10')).toBe(';');
    expect(detectDelimiter('date\tamount\n2026-01-01\t10')).toBe('\t');
  });

  it('ignores delimiters inside quotes', () => {
    expect(detectDelimiter('a,b\n"x,y",2')).toBe(',');
  });

  it('falls back to a comma for an empty file', () => {
    expect(detectDelimiter('')).toBe(',');
  });
});

describe('parseCsv', () => {
  it('keeps commas and line breaks inside quotes', () => {
    expect(parseCsv('a,b\n"x, y",2', ',')).toEqual([
      ['a', 'b'],
      ['x, y', '2'],
    ]);
  });

  it('turns doubled quotes into one', () => {
    expect(parseCsv('a\n"say ""hi"""', ',')).toEqual([['a'], ['say "hi"']]);
  });

  it('reads files with windows line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseAmountToMinor', () => {
  it('reads plain amounts', () => {
    expect(parseAmountToMinor('19.99', OPTIONS)).toBe(1999);
    expect(parseAmountToMinor('0.05', OPTIONS)).toBe(5);
  });

  it('reads thousands separators', () => {
    expect(parseAmountToMinor('1,234.56', OPTIONS)).toBe(123456);
    expect(parseAmountToMinor('$1,234.56', OPTIONS)).toBe(123456);
  });

  it('treats three digits after a separator as thousands', () => {
    expect(parseAmountToMinor('1,234', OPTIONS)).toBe(123400);
  });

  it('reads european amounts', () => {
    expect(parseAmountToMinor('1.234,56', OPTIONS)).toBe(123456);
  });

  it('reads accounting negatives', () => {
    expect(parseAmountToMinor('(19.99)', OPTIONS)).toBe(-1999);
    expect(parseAmountToMinor('-19.99', OPTIONS)).toBe(-1999);
  });

  it('never uses floating point for money', () => {
    expect(parseAmountToMinor('1234.56', OPTIONS)).toBe(123456);
    expect(parseAmountToMinor('0.07', OPTIONS)).toBe(7);
    expect(parseAmountToMinor('19.99', OPTIONS)).toBe(1999);
  });

  it('rounds away what the currency cannot hold', () => {
    expect(parseAmountToMinor('19.9999', OPTIONS)).toBe(2000);
    expect(parseAmountToMinor('19.9944', OPTIONS)).toBe(1999);
  });

  it('reads currencies without decimals', () => {
    expect(parseAmountToMinor('1200', { decimalSeparator: 'auto', minorUnits: 0 })).toBe(1200);
  });

  it('says no when there is no amount', () => {
    expect(parseAmountToMinor('', OPTIONS)).toBeNull();
    expect(parseAmountToMinor('n/a', OPTIONS)).toBeNull();
  });
});

describe('currencyMinorUnits', () => {
  it('knows how many decimals a currency has', () => {
    expect(currencyMinorUnits('USD')).toBe(2);
    expect(currencyMinorUnits('eur')).toBe(2);
    expect(currencyMinorUnits('JPY')).toBe(0);
    expect(currencyMinorUnits('KWD')).toBe(3);
  });
});

describe('parseCsvDate', () => {
  it('reads iso dates', () => {
    expect(parseCsvDate('2026-03-04', 'auto')).toEqual({ date: '2026-03-04', ambiguous: false });
  });

  it('reads month first dates', () => {
    expect(parseCsvDate('03/04/2026', 'mdy')).toEqual({ date: '2026-03-04', ambiguous: false });
  });

  it('reads day first dates', () => {
    expect(parseCsvDate('03/04/2026', 'dmy')).toEqual({ date: '2026-04-03', ambiguous: false });
  });

  it('says when a date could be read two ways', () => {
    expect(parseCsvDate('03/04/2026', 'auto')).toEqual({ date: '2026-03-04', ambiguous: true });
  });

  it('reads a day above twelve as a day', () => {
    expect(parseCsvDate('25/03/2026', 'auto')).toEqual({ date: '2026-03-25', ambiguous: false });
  });

  it('reads month names', () => {
    expect(parseCsvDate('Jan 5, 2026', 'auto')).toEqual({ date: '2026-01-05', ambiguous: false });
    expect(parseCsvDate('5 Jan 2026', 'auto')).toEqual({ date: '2026-01-05', ambiguous: false });
  });

  it('refuses a day that does not exist', () => {
    expect(parseCsvDate('02/30/2026', 'mdy')).toBeNull();
  });
});

describe('applyAmountSign', () => {
  it('turns money out negative whatever the file says', () => {
    expect(applyAmountSign(1999, 'signed')).toBe(1999);
    expect(applyAmountSign(1999, 'debit_positive')).toBe(-1999);
    expect(applyAmountSign(-1999, 'debit_negative')).toBe(-1999);
  });
});

describe('parseCsvRows', () => {
  const mapping = createCsvMapping({
    dateColumn: 'Date',
    amountColumn: 'Amount',
    descriptionColumn: 'Description',
  });

  it('reads a simple export', () => {
    const text = [
      'Date,Amount,Description',
      '2026-01-05,-12.34,BLUE BOTTLE COFFEE',
      '2026-01-06,2500.00,PAYROLL',
    ].join('\n');

    const outcome = parseCsvRows(text, mapping);

    expect(outcome.errors).toEqual([]);
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows[0]).toMatchObject({
      date: '2026-01-05',
      amountMinor: -1234,
      description: 'BLUE BOTTLE COFFEE',
      occurrence: 0,
    });
    expect(outcome.rows[1]?.amountMinor).toBe(250000);
    expect(outcome.dateRange).toEqual({ from: '2026-01-05', to: '2026-01-06' });
    expect(outcome.totalMinor).toBe(248766);
  });

  it('reports the columns the mapping does not use', () => {
    const text = 'Date,Amount,Description,Memo\n2026-01-05,-1.00,Coffee,hello';
    const outcome = parseCsvRows(text, mapping);

    expect(outcome.unmappedColumns).toEqual(['Memo']);
    expect(outcome.missingColumns).toEqual([]);
  });

  it('reports columns the mapping names that the file does not have', () => {
    const text = 'Date,Description\n2026-01-05,Coffee';
    const outcome = parseCsvRows(text, mapping);

    expect(outcome.missingColumns).toEqual(['Amount']);
  });

  it('keeps rows that look the same apart', () => {
    const text = [
      'Date,Amount,Description',
      '2026-01-05,-4.50,COFFEE',
      '2026-01-05,-4.50,COFFEE',
    ].join('\n');

    const outcome = parseCsvRows(text, mapping);

    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows[0]?.occurrence).toBe(0);
    expect(outcome.rows[1]?.occurrence).toBe(1);
  });

  it('reports rows it cannot read instead of guessing', () => {
    const text = [
      'Date,Amount,Description',
      'not a date,-4.50,COFFEE',
      '2026-01-06,n/a,SHIRT',
      '2026-01-07,-1.00,',
    ].join('\n');

    const outcome = parseCsvRows(text, mapping);

    expect(outcome.rows).toHaveLength(0);
    expect(outcome.errors).toHaveLength(3);
    expect(outcome.errors[0]?.rowNumber).toBe(2);
    expect(outcome.errors[0]?.reason).toContain('not a date');
  });

  it('reads files that hold two columns for the amount', () => {
    const text = [
      'Date,Debit,Credit,Description',
      '2026-01-05,12.34,,COFFEE',
      '2026-01-06,,2500.00,REFUND',
    ].join('\n');

    const outcome = parseCsvRows(
      text,
      createCsvMapping({
        dateColumn: 'Date',
        amountMode: 'separate',
        debitColumn: 'Debit',
        creditColumn: 'Credit',
        descriptionColumn: 'Description',
      }),
    );

    expect(outcome.rows[0]?.amountMinor).toBe(-1234);
    expect(outcome.rows[1]?.amountMinor).toBe(250000);
  });

  it('reads a file that names several accounts', () => {
    const text = [
      'Date,Account,Amount,Description',
      '2026-01-05,Checking,-1.00,COFFEE',
      '2026-01-06,Savings,-2.00,BOOK',
    ].join('\n');

    const outcome = parseCsvRows(
      text,
      createCsvMapping({
        dateColumn: 'Date',
        accountColumn: 'Account',
        amountColumn: 'Amount',
        descriptionColumn: 'Description',
      }),
    );

    expect(outcome.accountKeys).toEqual(['Checking', 'Savings']);
    expect(outcome.rows[0]?.accountKey).toBe('Checking');
  });

  it('skips the lines before the header row', () => {
    const text = ['My Bank Export', 'Date,Amount,Description', '2026-01-05,-1.00,COFFEE'].join(
      '\n',
    );

    const outcome = parseCsvRows(text, createCsvMapping({ ...mapping, headerRow: 1 }));

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]?.description).toBe('COFFEE');
  });

  it('counts the dates it could only read one way', () => {
    const text = [
      'Date,Amount,Description',
      '03/04/2026,-1.00,COFFEE',
      '2026-01-07,-2.00,BOOK',
    ].join('\n');

    const outcome = parseCsvRows(text, mapping);

    expect(outcome.ambiguousDates).toBe(1);
    expect(outcome.rows[0]?.ambiguousDate).toBe(true);
  });
});
