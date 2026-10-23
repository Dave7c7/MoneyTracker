/**
 * CSV reading.
 *
 * A bank export is not a format, it is a family of formats: every institution
 * picks its own column names, its own date style and its own idea of which
 * sign means "money left". So the app never guesses a format. It reads the
 * file the way the user's mapping profile tells it to, and the same code
 * reads the file for the preview and for the import, so what the preview
 * shows is what the import does.
 *
 * Everything in this file is pure and browser-safe: the browser uses it to
 * show the columns of a file before the file is sent anywhere.
 */

/** How the columns of a file are separated. */
export type CsvDelimiter = 'auto' | ',' | ';' | '\t' | '|';

/** How dates are written in a file. */
export type CsvDateFormat =
  | 'auto'
  | 'iso'
  | 'mdy'
  | 'dmy'
  | 'month_day_year';

/** Which sign in a file means "money left the account". */
export type CsvAmountSign =
  /** The file already says it: negative is money out. */
  | 'signed'
  /** The file writes money out as a positive number. */
  | 'debit_positive'
  /** The file writes money out as a negative number. */
  | 'debit_negative';

/** Which character separates the decimals in a file. */
export type CsvDecimalSeparator = 'auto' | '.' | ',';

/** Where the amount of a row comes from. */
export type CsvAmountMode =
  /** One column with signed amounts. */
  | 'single'
  /** Two columns: one for money out, one for money in. */
  | 'separate';

/**
 * How one institution's export is laid out.
 *
 * Column names are the header cells of the file, not indexes, so a profile
 * keeps working when the bank adds or removes an unrelated column.
 */
export interface CsvMapping {
  delimiter: CsvDelimiter;
  /** Row of the file that holds the column names. 0 is the first row. */
  headerRow: number;
  dateColumn: string;
  dateFormat: CsvDateFormat;
  amountMode: CsvAmountMode;
  /** Column with the amount, when `amountMode` is `single`. */
  amountColumn: string;
  /** Column with money out, when `amountMode` is `separate`. */
  debitColumn: string;
  /** Column with money in, when `amountMode` is `separate`. */
  creditColumn: string;
  amountSign: CsvAmountSign;
  decimalSeparator: CsvDecimalSeparator;
  descriptionColumn: string;
  /** Column with the bank's own category, when the file has one. */
  categoryColumn: string | null;
  /** Column that names the account, for files that hold several accounts. */
  accountColumn: string | null;
}

/** A mapping with every field filled in, ready to be adjusted. */
export function createCsvMapping(overrides: Partial<CsvMapping> = {}): CsvMapping {
  return {
    delimiter: 'auto',
    headerRow: 0,
    dateColumn: '',
    dateFormat: 'auto',
    amountMode: 'single',
    amountColumn: '',
    debitColumn: '',
    creditColumn: '',
    amountSign: 'signed',
    decimalSeparator: 'auto',
    descriptionColumn: '',
    categoryColumn: null,
    accountColumn: null,
    ...overrides,
  };
}

/** A row of a file that could not be read. */
export interface CsvRowError {
  /** 1-based line number in the file. */
  rowNumber: number;
  reason: string;
  /** The row as it was in the file. */
  raw: string[];
}

const DELIMITER_CANDIDATES: readonly string[] = [',', ';', '\t', '|'];

/**
 * Guesses the delimiter of a file by counting, outside quotes, how often each
 * candidate appears in the first lines. The one that appears the same number
 * of times in every line wins.
 *
 * @example
 * detectDelimiter('a;b\n1;2'); // ";"
 */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 20);

  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = -1;

  for (const candidate of DELIMITER_CANDIDATES) {
    const counts = lines.map((line) => countOutsideQuotes(line, candidate));
    const first = counts[0] ?? 0;
    if (first === 0) continue;

    const consistent = counts.every((count) => count === first);
    // A consistent delimiter beats a busier one, and more columns beats fewer.
    const score = (consistent ? 1000 : 0) + first * 10 + DELIMITER_CANDIDATES.indexOf(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

/**
 * Splits a file into rows of raw text, honouring quoted cells that contain
 * the delimiter or a line break.
 *
 * @example
 * parseCsv('a,b\n"x, y",2'); // [['a','b'], ['x, y','2']]
 */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/** One row of a file, read the way the mapping says. */
export interface CsvParsedRow {
  /** 1-based line number in the file. */
  rowNumber: number;
  /** Plain date, `YYYY-MM-DD`. */
  date: string;
  /** Signed amount in minor units: negative means money out. */
  amountMinor: number;
  description: string;
  /** The bank's own category, when the file has one. */
  sourceCategory: string | null;
  /** The account named by the file, or an empty string when it names none. */
  accountKey: string;
  /**
   * How many rows before this one look exactly the same.
   *
   * Two coffees on the same day are two coffees, so they must not collapse
   * into one. The number keeps them apart while still making the import
   * repeatable: the same file always produces the same numbers.
   */
  occurrence: number;
  /** True when the date of this row could be read in two ways. */
  ambiguousDate: boolean;
}

/** Everything that came out of reading a file. */
export interface CsvParseOutcome {
  rows: CsvParsedRow[];
  /** Rows that could not be read, with the reason. */
  errors: CsvRowError[];
  /** How many rows had a date that could be read two ways. */
  ambiguousDates: number;
  /** The column names of the file. */
  columns: string[];
  /** Columns the mapping does not use. */
  unmappedColumns: string[];
  /** Columns the mapping names that the file does not have. */
  missingColumns: string[];
  /** The first and last date in the file. */
  dateRange: { from: string | null; to: string | null };
  /** The distinct accounts the file names. */
  accountKeys: string[];
  /** The sum of every amount in the file, in minor units. */
  totalMinor: number;
}

/**
 * Reads a file with a mapping.
 *
 * Rows that cannot be read are reported instead of guessed at: a row without
 * a date or an amount is never worth importing, and the user deserves to
 * know that three rows were skipped.
 *
 * The number of decimals in the amounts comes from the currency of the
 * account, not from the file, so a file in yen is read as yen.
 *
 * @example
 * const outcome = parseCsvRows(text, createCsvMapping({ dateColumn: 'Date', amountColumn: 'Amount', descriptionColumn: 'Description' }), { minorUnits: 2 });
 * outcome.rows.length; // 412
 */
export function parseCsvRows(
  text: string,
  mapping: CsvMapping,
  options: { minorUnits: number },
): CsvParseOutcome {
  const delimiter = mapping.delimiter === 'auto' ? detectDelimiter(text) : mapping.delimiter;
  const allRows = parseCsv(text, delimiter);

  const headerRow = Math.max(0, mapping.headerRow);
  const columns = (allRows[headerRow] ?? []).map((cell) => cell.trim());
  const body = allRows.slice(headerRow + 1);

  const indexByColumn = new Map<string, number>();
  columns.forEach((column, index) => {
    if (column.length > 0 && !indexByColumn.has(column)) {
      indexByColumn.set(column, index);
    }
  });

  const usedColumns = new Set(
    [
      mapping.dateColumn,
      mapping.descriptionColumn,
      mapping.categoryColumn ?? '',
      mapping.accountColumn ?? '',
      mapping.amountMode === 'single' ? mapping.amountColumn : '',
      mapping.amountMode === 'separate' ? mapping.debitColumn : '',
      mapping.amountMode === 'separate' ? mapping.creditColumn : '',
    ].filter((column) => column.length > 0),
  );

  const unmappedColumns = columns.filter(
    (column) => column.length > 0 && !usedColumns.has(column),
  );
  const missingColumns = [...usedColumns].filter((column) => !indexByColumn.has(column));

  const minorUnits = options.minorUnits;
  const rows: CsvParsedRow[] = [];
  const errors: CsvRowError[] = [];
  const accountKeys: string[] = [];
  let ambiguousDates = 0;
  let totalMinor = 0;
  let from: string | null = null;
  let to: string | null = null;
  const occurrences = new Map<string, number>();

  body.forEach((raw, index) => {
    const rowNumber = headerRow + index + 2;
    if (raw.every((cell) => cell.trim().length === 0)) return;

    const dateCell = cellAt(raw, indexByColumn, mapping.dateColumn);
    const parsedDate = dateCell === null ? null : parseCsvDate(dateCell, mapping.dateFormat);
    if (!parsedDate) {
      errors.push({
        rowNumber,
        reason: dateCell === null
          ? `The file has no column named "${mapping.dateColumn}"`
          : `"${dateCell}" is not a date the app can read`,
        raw,
      });
      return;
    }

    const amount = readAmount(raw, indexByColumn, mapping, minorUnits);
    if (amount === null) {
      errors.push({ rowNumber, reason: amountReason(raw, indexByColumn, mapping), raw });
      return;
    }

    const description = cellAt(raw, indexByColumn, mapping.descriptionColumn)?.trim() ?? '';
    if (description.length === 0) {
      errors.push({ rowNumber, reason: 'The row has no description', raw });
      return;
    }

    const accountKey = mapping.accountColumn
      ? (cellAt(raw, indexByColumn, mapping.accountColumn)?.trim() ?? '')
      : '';
    if (accountKey.length > 0 && !accountKeys.includes(accountKey)) {
      accountKeys.push(accountKey);
    }

    const signature = `${parsedDate.date}|${amount}|${description}`;
    const occurrence = occurrences.get(signature) ?? 0;
    occurrences.set(signature, occurrence + 1);

    if (parsedDate.ambiguous) ambiguousDates += 1;
    if (from === null || parsedDate.date < from) from = parsedDate.date;
    if (to === null || parsedDate.date > to) to = parsedDate.date;
    totalMinor += amount;

    rows.push({
      rowNumber,
      date: parsedDate.date,
      amountMinor: amount,
      description,
      sourceCategory: mapping.categoryColumn
        ? (cellAt(raw, indexByColumn, mapping.categoryColumn)?.trim() || null)
        : null,
      accountKey,
      occurrence,
      ambiguousDate: parsedDate.ambiguous,
    });
  });

  return {
    rows,
    errors,
    ambiguousDates,
    columns,
    unmappedColumns,
    missingColumns,
    dateRange: { from, to },
    accountKeys,
    totalMinor,
  };
}

/**
 * The number of minor units in one unit of a currency.
 *
 * Most currencies use two decimals, some use none and a few use three.
 *
 * @example
 * currencyMinorUnits('USD'); // 2
 * currencyMinorUnits('JPY'); // 0
 */
export function currencyMinorUnits(currency: string): number {
  const code = currency.trim().toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

/**
 * Reads an amount from a file into minor units.
 *
 * The text is read, never converted through a float: the digits are moved
 * into place by hand, so "$1,234.56" becomes 123456 and never 123455.99999.
 *
 * @example
 * parseAmountToMinor('$1,234.56', { decimalSeparator: 'auto', minorUnits: 2 }); // 123456
 * parseAmountToMinor('(19.99)', { decimalSeparator: 'auto', minorUnits: 2 }); // -1999
 */
export function parseAmountToMinor(
  raw: string,
  options: { decimalSeparator: CsvDecimalSeparator; minorUnits: number },
): number | null {
  const { decimalSeparator, minorUnits } = options;
  const value = raw.trim();
  if (value.length === 0) return null;

  let negative = false;
  let text = value;

  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  const digitsOnly = text.replace(/[^\d.,]/g, '');
  if (digitsOnly.length === 0) return null;

  const separator = resolveDecimalSeparator(digitsOnly, decimalSeparator);
  const integerPart = separator
    ? digitsOnly.slice(0, digitsOnly.indexOf(separator)).replace(/[^\d]/g, '')
    : digitsOnly.replace(/[^\d]/g, '');
  const fractionPart = separator
    ? digitsOnly.slice(digitsOnly.indexOf(separator) + 1).replace(/[^\d]/g, '')
    : '';

  if (integerPart.length === 0 && fractionPart.length === 0) return null;

  const padded = fractionPart.padEnd(minorUnits, '0');
  const kept = padded.slice(0, minorUnits);
  const dropped = padded.slice(minorUnits);

  const units = integerPart.length === 0 ? 0 : Number.parseInt(integerPart, 10);
  if (!Number.isFinite(units)) return null;

  const fraction = minorUnits === 0 ? 0 : Number.parseInt(kept.length > 0 ? kept : '0', 10);
  let minor = units * 10 ** minorUnits + fraction;

  // Anything the currency cannot hold is rounded away from zero.
  if (dropped.length > 0 && Number.parseInt(dropped[0]!, 10) >= 5) {
    minor += 1;
  }

  return negative ? -minor : minor;
}

/**
 * Reads a date from a file.
 *
 * The result is a plain date, `YYYY-MM-DD`, because that is what the app
 * groups money by. `ambiguous` is true when the date could be read in two
 * ways, which happens with day-first and month-first files.
 *
 * @example
 * parseCsvDate('03/04/2026', 'auto'); // { date: '2026-03-04', ambiguous: true }
 * parseCsvDate('2026-03-04', 'iso'); // { date: '2026-03-04', ambiguous: false }
 */
export function parseCsvDate(
  raw: string,
  format: CsvDateFormat,
): { date: string; ambiguous: boolean } | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  if (format === 'iso') {
    return readIsoDate(value);
  }
  if (format === 'mdy') {
    return readNumericDate(value, 'mdy');
  }
  if (format === 'dmy') {
    return readNumericDate(value, 'dmy');
  }
  if (format === 'month_day_year') {
    return readTextDate(value);
  }

  const iso = readIsoDate(value);
  if (iso) return iso;

  const numeric = readNumericDate(value, 'auto');
  if (numeric) return numeric;

  return readTextDate(value);
}

/**
 * Applies the sign convention of a file to an amount.
 *
 * The app stores money out as negative, always:
 *
 * - `signed` and `debit_negative` already say it: out is negative.
 * - `debit_positive` writes out as a positive number, so every sign flips —
 *   a payment written as a negative number becomes money coming in.
 *
 * @example
 * applyAmountSign(450, 'debit_positive'); // -450, a charge
 * applyAmountSign(-25000, 'debit_positive'); // 25000, a payment
 */
export function applyAmountSign(amountMinor: number, sign: CsvAmountSign): number {
  if (sign === 'debit_positive') return -amountMinor;
  return amountMinor;
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const THREE_DECIMAL_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

const MONTH_NAMES: readonly string[] = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** The cell of a named column, or null when the file has no such column. */
function cellAt(
  row: readonly string[],
  indexByColumn: ReadonlyMap<string, number>,
  column: string,
): string | null {
  if (column.length === 0) return null;
  const index = indexByColumn.get(column);
  if (index === undefined) return null;
  return row[index] ?? '';
}

/**
 * Reads the amount of a row.
 *
 * Money out is negative, always, whatever the file says.
 */
function readAmount(
  row: readonly string[],
  indexByColumn: ReadonlyMap<string, number>,
  mapping: CsvMapping,
  minorUnits: number,
): number | null {
  const options = { decimalSeparator: mapping.decimalSeparator, minorUnits };

  if (mapping.amountMode === 'separate') {
    const debitCell = cellAt(row, indexByColumn, mapping.debitColumn);
    const creditCell = cellAt(row, indexByColumn, mapping.creditColumn);
    const debit = debitCell === null ? null : parseAmountToMinor(debitCell, options);
    const credit = creditCell === null ? null : parseAmountToMinor(creditCell, options);

    if (debit !== null && debit !== 0) return -Math.abs(debit);
    if (credit !== null && credit !== 0) return Math.abs(credit);
    if (debit !== null || credit !== null) return 0;
    return null;
  }

  const cell = cellAt(row, indexByColumn, mapping.amountColumn);
  if (cell === null) return null;

  const parsed = parseAmountToMinor(cell, options);
  if (parsed === null) return null;
  return applyAmountSign(parsed, mapping.amountSign);
}

/** Says why the amount of a row could not be read. */
function amountReason(
  row: readonly string[],
  indexByColumn: ReadonlyMap<string, number>,
  mapping: CsvMapping,
): string {
  if (mapping.amountMode === 'separate') {
    const debitCell = cellAt(row, indexByColumn, mapping.debitColumn);
    const creditCell = cellAt(row, indexByColumn, mapping.creditColumn);
    if (debitCell === null && creditCell === null) {
      return `The file has no column named "${mapping.debitColumn}" or "${mapping.creditColumn}"`;
    }
    return 'The row has no amount in either the debit or the credit column';
  }

  const cell = cellAt(row, indexByColumn, mapping.amountColumn);
  if (cell === null) {
    return `The file has no column named "${mapping.amountColumn}"`;
  }
  return `"${cell.trim()}" is not an amount the app can read`;
}

/** Counts how often a character appears in a line, ignoring quoted parts. */
function countOutsideQuotes(line: string, char: string): number {  let count = 0;
  let inQuotes = false;

  for (const current of line) {
    if (current === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && current === char) count += 1;
  }

  return count;
}

/**
 * Works out which character separates the decimals.
 *
 * When both appear, the last one is the decimal separator. When only one
 * appears and three digits follow it, it is a thousands separator, because
 * "1,234" is a whole number far more often than it is 1.234.
 */
function resolveDecimalSeparator(digits: string, preferred: CsvDecimalSeparator): string | null {
  if (preferred !== 'auto') return preferred;

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    return lastDot > lastComma ? '.' : ',';
  }
  if (lastDot >= 0) {
    return digits.length - lastDot - 1 === 3 ? null : '.';
  }
  if (lastComma >= 0) {
    return digits.length - lastComma - 1 === 3 ? null : ',';
  }
  return null;
}

/** Reads `YYYY-MM-DD` and `YYYY/MM/DD`. */
function readIsoDate(value: string): { date: string; ambiguous: boolean } | null {
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);

  return buildDate(year, month, day, false);
}

/** Reads `M/D/YYYY` and `D/M/YYYY`. */
function readNumericDate(
  value: string,
  order: 'mdy' | 'dmy' | 'auto',
): { date: string; ambiguous: boolean } | null {
  const match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!match) return null;

  const first = Number.parseInt(match[1]!, 10);
  const second = Number.parseInt(match[2]!, 10);
  let year = Number.parseInt(match[3]!, 10);
  if (year < 100) year += year < 70 ? 2000 : 1900;

  if (order === 'mdy') return buildDate(year, first, second, false);
  if (order === 'dmy') return buildDate(year, second, first, false);

  // Automatic: a day above twelve can only be a day.
  if (first > 12 && second <= 12) return buildDate(year, second, first, false);
  if (second > 12 && first <= 12) return buildDate(year, first, second, false);

  // Both are twelve or less, so both readings are possible.
  return buildDate(year, first, second, true);
}

/** Reads dates such as "Jan 5, 2026" and "5 Jan 2026". */
function readTextDate(value: string): { date: string; ambiguous: boolean } | null {
  const match = value.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const month = monthNumber(match[1]!);
    if (month === null) return null;
    return buildDate(Number.parseInt(match[3]!, 10), month, Number.parseInt(match[2]!, 10), false);
  }

  const reversed = value.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/);
  if (reversed) {
    const month = monthNumber(reversed[2]!);
    if (month === null) return null;
    return buildDate(
      Number.parseInt(reversed[3]!, 10),
      month,
      Number.parseInt(reversed[1]!, 10),
      false,
    );
  }

  return null;
}

/** The number of a month name, 1 to 12. */
function monthNumber(name: string): number | null {
  const index = MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase());
  return index === -1 ? null : index + 1;
}

/** Builds a plain date, rejecting days that do not exist. */
function buildDate(
  year: number,
  month: number,
  day: number,
  ambiguous: boolean,
): { date: string; ambiguous: boolean } | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;

  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return { date: `${year}-${monthText}-${dayText}`, ambiguous };
}
