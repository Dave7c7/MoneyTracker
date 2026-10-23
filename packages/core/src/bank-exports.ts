/**
 * Recognising an export.
 *
 * Every bank writes its own export, and the app has to read all of them. This
 * file is the shortcut for the ones we have seen: a small table of header
 * signatures that says "this looks like a SoFi checking export, so the date is
 * in the first column and money out is negative".
 *
 * It is a shortcut, not a rule. A file that is not recognised is still
 * importable: the mapping screen shows every column, the guess from the column
 * names is filled in, and the profile saves whatever the user corrects. That is
 * why a signature here is only ever a starting point.
 *
 * Nothing in here is SoFi-specific code. The table is data.
 */

import { createCsvMapping, detectDelimiter, parseCsv, type CsvMapping } from './csv.ts';

/** An export the app recognises by its columns. */
export interface KnownExport {
  /** Stable id, e.g. `sofi-checking`. */
  id: string;
  /** The bank, as a person writes it. */
  bank: string;
  /** What the export is, e.g. `Checking`. */
  kind: string;
  /** The account type an import of this file belongs to. */
  accountType: 'checking' | 'savings' | 'credit_card' | 'loan' | 'cash';
  /**
   * Header cells that must all be in the file, in normalised form.
   *
   * Extra columns are allowed: a bank that adds one should not stop being
   * recognised.
   */
  headers: readonly string[];
  /** Header cells that must not be there, to tell two exports apart. */
  absentHeaders?: readonly string[];
  /** The mapping to start from. */
  mapping: Partial<CsvMapping>;
  /** Where the file is downloaded, in words, for the import screen. */
  hint: string;
}

/**
 * The exports the app knows.
 *
 * A signature has to be specific enough that it does not claim another bank's
 * file: a false "SoFi" badge is worse than no badge, because it presets the
 * date order and the sign of every amount. So the one signature here asks for
 * the Type column, which is the column the SoFi Money export has and a card
 * export does not.
 *
 * The SoFi card export is not in this table: its columns vary, and the generic
 * guess reads it correctly anyway (one amount column, no bank category). The
 * user saves it once as a profile.
 */
export const KNOWN_EXPORTS: readonly KnownExport[] = [
  {
    id: 'sofi-checking',
    bank: 'SoFi',
    kind: 'Checking or savings',
    accountType: 'checking',
    headers: ['date', 'description', 'amount', 'type'],
    mapping: {
      dateColumn: 'Date',
      dateFormat: 'mdy',
      amountMode: 'single',
      amountColumn: 'Amount',
      amountSign: 'signed',
      descriptionColumn: 'Description',
      // "Type" says how the money moved (a card purchase, a transfer), not
      // what it was for, so it is not a bank category.
      categoryColumn: null,
      accountColumn: null,
    },
    hint: 'SoFi: Banking → the account → Documents → export as CSV.',
  },
];

/** A header cell reduced to letters and digits, so spacing and case do not matter. */
function normaliseHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the known export a set of columns belongs to.
 *
 * The first signature whose columns are all present, and whose excluded columns
 * are all absent, wins. Anything else is null, and the caller falls back to the
 * guess from the column names.
 *
 * @example
 * recogniseExport(['Date', 'Description', 'Type', 'Amount'])?.id; // 'sofi-checking'
 * recogniseExport(['Date', 'Description', 'Amount']); // null: any bank looks like this
 */
export function recogniseExport(columns: readonly string[]): KnownExport | null {
  const present = new Set(columns.map(normaliseHeader));

  for (const known of KNOWN_EXPORTS) {
    if (!known.headers.every((header) => present.has(header))) continue;
    if (known.absentHeaders?.some((header) => present.has(header))) continue;
    return known;
  }

  return null;
}

/**
 * The column names of a file, read the way the import screen reads it.
 *
 * @example
 * columnsOf('Date,Description,Amount\n2026-01-02,Coffee,-450'); // ['Date','Description','Amount']
 */
export function columnsOf(text: string): string[] {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  return (rows[0] ?? []).map((cell) => cell.trim());
}

/**
 * The mapping to start from for a file.
 *
 * A recognised export gives its own mapping, with the account name and the
 * institution filled in so the profile is named after the bank without the
 * user typing it. An unknown file gets the mapping guessed from its column
 * names, exactly as before.
 *
 * @example
 * const { mapping, known } = suggestMapping(['Date', 'Description', 'Amount']);
 * known?.bank; // 'SoFi'
 */
export function suggestMapping(columns: readonly string[]): {
  mapping: CsvMapping;
  known: KnownExport | null;
} {
  const known = recogniseExport(columns);
  if (!known) return { mapping: guessFromColumnNames(columns), known: null };

  return {
    mapping: createCsvMapping({ delimiter: 'auto', headerRow: 0, ...known.mapping }),
    known,
  };
}

/**
 * A first guess from the names of the columns.
 *
 * It is deliberately shallow: it is a guess to be corrected, and the columns of
 * the file are always on screen next to it.
 *
 * @example
 * guessFromColumnNames(['Posted', 'Payee', 'Amount']).descriptionColumn; // 'Payee'
 */
export function guessFromColumnNames(columns: readonly string[]): CsvMapping {
  const mapping = createCsvMapping();

  const find = (patterns: RegExp[]): string =>
    columns.find((column) => patterns.some((pattern) => pattern.test(column))) ?? '';

  mapping.dateColumn = find([/^date/i, /posted/i, /transaction date/i]);
  mapping.descriptionColumn = find([/description/i, /memo/i, /payee/i, /details/i, /name/i]);
  mapping.categoryColumn = find([/category/i, /type/i]) || null;
  mapping.accountColumn = find([/^account/i, /account name/i]) || null;

  const singleColumn = find([/^amount/i, /^value/i, /transaction amount/i]);
  const debitColumn = find([/^debit/i, /withdrawal/i, /money out/i, /paid out/i]);
  const creditColumn = find([/^credit amount/i, /^credit$/i, /^deposit/i, /money in/i, /paid in/i]);

  if (singleColumn) {
    // One signed amount is unambiguous, so it wins when a file has both: the
    // Debit/Credit pair is usually blank in the exports that also write an
    // amount.
    mapping.amountMode = 'single';
    mapping.amountColumn = singleColumn;
  } else if (debitColumn && creditColumn) {
    // Two columns, one for each direction. Reading only the debit column would
    // throw away every deposit.
    mapping.amountMode = 'separate';
    mapping.debitColumn = debitColumn;
    mapping.creditColumn = creditColumn;
  } else {
    mapping.amountMode = 'single';
    mapping.amountColumn = debitColumn || creditColumn;
  }

  return mapping;
}
