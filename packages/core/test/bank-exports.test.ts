import { describe, expect, it } from 'vitest';

import {
  columnsOf,
  guessFromColumnNames,
  recogniseExport,
  suggestMapping,
  KNOWN_EXPORTS,
} from '../src/bank-exports.ts';
import { parseCsvRows } from '../src/csv.ts';

/**
 * A SoFi Money export, as the bank writes it: with a Type column and a running
 * balance, dates month first, and money out as a negative number.
 */
const SOFI_CHECKING = [
  'Date,Description,Type,Amount,Current Balance',
  '10/01/2026,Direct Deposit - ACME PAYROLL,Deposit,2500.00,4321.10',
  '10/02/2026,BLUE BOTTLE COFFEE,Card Purchase,-4.50,4316.60',
  '10/03/2026,Transfer to Savings,Transfer,-500.00,3816.60',
].join('\n');

/**
 * A SoFi credit card export: no Type column, and purchases written as positive
 * numbers with payments as negative.
 */
const SOFI_CARD = [
  'Date,Description,Amount',
  '10/01/2026,SPOTIFY USA,12.99',
  '10/02/2026,PAYMENT RECEIVED,-250.00',
].join('\n');

describe('recognising a bank export', () => {
  it('reads the columns of a file', () => {
    expect(columnsOf(SOFI_CHECKING)).toEqual([
      'Date',
      'Description',
      'Type',
      'Amount',
      'Current Balance',
    ]);
  });

  it('recognises the SoFi Money export', () => {
    const known = recogniseExport(columnsOf(SOFI_CHECKING));
    expect(known?.id).toBe('sofi-checking');
    expect(known?.bank).toBe('SoFi');
    expect(known?.accountType).toBe('checking');
  });

  it('does not claim a file that only has a date, a description and an amount', () => {
    // Almost every bank's export looks like this. Calling it SoFi would preset
    // the date order and the sign of every amount on a guess.
    expect(recogniseExport(columnsOf(SOFI_CARD))).toBeNull();
  });

  it('does not claim a plain CSV that happens to have four columns', () => {
    expect(recogniseExport(['Date', 'Amount', 'Description', 'Memo'])).toBeNull();
  });

  it('does not mind how the columns are written', () => {
    const odd = ['  DATE ', 'description', 'Amount', 'TYPE', 'current balance'];
    expect(recogniseExport(odd)?.id).toBe('sofi-checking');
  });

  it('still recognises a file the bank has added a column to', () => {
    const columns = ['Date', 'Description', 'Type', 'Amount', 'Current Balance', 'Memo'];
    expect(recogniseExport(columns)?.id).toBe('sofi-checking');
  });

  it('leaves an unknown bank to the column-name guess', () => {
    const columns = ['Posted', 'Payee', 'Debit', 'Credit'];
    const { known, mapping } = suggestMapping(columns);
    expect(known).toBeNull();
    expect(mapping.amountMode).toBe('separate');
    expect(mapping.dateColumn).toBe('Posted');
  });

  it('prefers one signed amount over a pair when a file has both', () => {
    // The Debit/Credit pair is often blank in the exports that also write a
    // signed amount, so the amount column is the one to read.
    const columns = ['Date', 'Description', 'Amount', 'Debit', 'Credit'];
    const mapping = guessFromColumnNames(columns);
    expect(mapping.amountMode).toBe('single');
    expect(mapping.amountColumn).toBe('Amount');
  });

  it('describes every export it knows, so the screen can explain it', () => {
    for (const known of KNOWN_EXPORTS) {
      expect(known.hint.length).toBeGreaterThan(10);
      expect(known.mapping.dateColumn).toBeTruthy();
      expect(known.mapping.amountColumn).toBeTruthy();
      expect(known.mapping.descriptionColumn).toBeTruthy();
    }
  });
});

describe('reading a SoFi export with the suggestion', () => {
  it('reads the Money export: money out is negative, dates are month first', () => {
    const { mapping } = suggestMapping(columnsOf(SOFI_CHECKING));
    const outcome = parseCsvRows(SOFI_CHECKING, mapping, { minorUnits: 2 });

    expect(outcome.errors).toEqual([]);
    expect(outcome.dateRange).toEqual({ from: '2026-10-01', to: '2026-10-03' });
    expect(outcome.rows.map((row) => row.amountMinor)).toEqual([250_000, -450, -50_000]);
    expect(outcome.rows[1]?.description).toBe('BLUE BOTTLE COFFEE');
    // "Type" is how the money moved, not what it was for.
    expect(outcome.rows[1]?.sourceCategory).toBeNull();
    expect(outcome.unmappedColumns).toEqual(['Type', 'Current Balance']);
  });

  it('reads the card export with the guessed mapping, signs as written', () => {
    // A card export writes purchases as positive numbers; the guess leaves the
    // signs alone, so the user turns "a positive number means money out" on in
    // the mapping screen and the profile remembers it.
    const { mapping } = suggestMapping(columnsOf(SOFI_CARD));
    const signed = { ...mapping, amountSign: 'debit_positive' as const };
    const outcome = parseCsvRows(SOFI_CARD, signed, { minorUnits: 2 });

    expect(outcome.errors).toEqual([]);
    expect(outcome.rows.map((row) => row.amountMinor)).toEqual([-1299, 25_000]);
  });

  it('keeps two identical charges apart', () => {
    const text = [
      'Date,Description,Type,Amount,Current Balance',
      '10/02/2026,BLUE BOTTLE COFFEE,Card Purchase,-4.50,100.00',
      '10/02/2026,BLUE BOTTLE COFFEE,Card Purchase,-4.50,95.50',
    ].join('\n');

    const { mapping } = suggestMapping(columnsOf(text));
    const outcome = parseCsvRows(text, mapping, { minorUnits: 2 });

    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows.map((row) => row.occurrence)).toEqual([0, 1]);
  });

  it('says which rows it could not read instead of guessing', () => {
    const text = [
      'Date,Description,Type,Amount,Current Balance',
      '10/02/2026,BLUE BOTTLE COFFEE,Card Purchase,-4.50,100.00',
      'not a date,BROKEN ROW,Card Purchase,-1.00,99.00',
      '10/04/2026,,Card Purchase,-2.00,97.00',
    ].join('\n');

    const { mapping } = suggestMapping(columnsOf(text));
    const outcome = parseCsvRows(text, mapping, { minorUnits: 2 });

    expect(outcome.rows).toHaveLength(1);
    expect(outcome.errors).toHaveLength(2);
    expect(outcome.errors[0]?.rowNumber).toBe(3);
  });

  it('names the unknowns sensibly when the columns tell it nothing', () => {
    const mapping = guessFromColumnNames(['A', 'B', 'C']);
    expect(mapping.dateColumn).toBe('');
    expect(mapping.amountColumn).toBe('');
    expect(mapping.descriptionColumn).toBe('');
  });
});
