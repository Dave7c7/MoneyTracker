/**
 * Exporting transactions.
 *
 * Two files come out of here: a CSV that a spreadsheet opens, and the shape the
 * JSON export is built from. Both say the same things, including why a category
 * was chosen — an export that dropped the reason would be a worse record than
 * the screen.
 *
 * Money leaves as a decimal string ("-4.50"), the way a bank writes it, so the
 * file can be read by a person and re-imported by this app. The integer in the
 * database is what is authoritative; the decimal is a rendering of it.
 */

/** One transaction, as an export writes it. */
export interface ExportTransaction {
  /** The plain date the transaction was posted, YYYY-MM-DD. */
  postedDate: string | null;
  /** What the bank wrote. */
  description: string;
  /** The merchant the app knows it by, when it does. */
  merchant: string | null;
  /** The category, when one is assigned. */
  category: string | null;
  /** The account it belongs to. */
  account: string;
  /** The amount in minor units; negative is money out. */
  amountMinor: number;
  currency: string;
  pending: boolean;
  /** Whether it is part of a transfer rather than spending. */
  transfer: boolean;
  /** How the category was chosen: a rule, a guess, a person. */
  categorySource: string | null;
  /** The sentence that explains the category. */
  categoryReason: string | null;
}

/** The columns of the CSV, in order. */
export const TRANSACTION_EXPORT_HEADERS = [
  'date',
  'description',
  'merchant',
  'category',
  'account',
  'amount',
  'currency',
  'pending',
  'transfer',
  'category_source',
  'category_reason',
] as const;

/**
 * Writes the transactions as CSV.
 *
 * Lines end in CRLF, which is what the format asks for and what spreadsheets
 * expect. Every value is a string in the file; the amount keeps its sign and
 * two decimal places.
 *
 * @example
 * transactionsToCsv([row]); // 'date,description,...\r\n2026-10-01,Coffee,...\r\n'
 */
export function transactionsToCsv(rows: readonly ExportTransaction[]): string {
  const lines = [TRANSACTION_EXPORT_HEADERS.join(',')];

  for (const row of rows) {
    lines.push(
      [
        plainCell(row.postedDate ?? ''),
        textCell(row.description),
        textCell(row.merchant ?? ''),
        textCell(row.category ?? ''),
        textCell(row.account),
        plainCell(formatExportAmount(row.amountMinor)),
        plainCell(row.currency),
        plainCell(row.pending ? 'true' : 'false'),
        plainCell(row.transfer ? 'true' : 'false'),
        textCell(row.categorySource ?? ''),
        textCell(row.categoryReason ?? ''),
      ].join(','),
    );
  }

  // A trailing newline: every line ends the same way, and a file with no rows
  // still ends after the header.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Formats an amount in minor units as a decimal string.
 *
 * @example
 * formatExportAmount(-450); // '-4.50'
 */
export function formatExportAmount(amountMinor: number): string {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`An amount must be a whole number of minor units, got: ${amountMinor}`);
  }
  const sign = amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(amountMinor);
  const whole = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  return `${sign}${whole}.${cents}`;
}

/**
 * The name of the file a download arrives as.
 *
 * @example
 * exportFileName('csv', '2026-10-23'); // 'moneytracker-transactions-2026-10-23.csv'
 */
export function exportFileName(format: 'csv' | 'json', day: string): string {
  return `moneytracker-transactions-${day}.${format}`;
}

/**
 * A cell a spreadsheet must not read as a formula.
 *
 * A description that begins with `=`, `+`, `-` or `@` is a formula to Excel and
 * to Sheets, and a bank description is not a trusted author. Those cells get a
 * leading apostrophe, which spreadsheets treat as "this is text" and hide.
 */
function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return quoteIfNeeded(safe);
}

/** A cell whose value this app produced, so it needs no formula guard. */
function plainCell(value: string): string {
  return quoteIfNeeded(value);
}

/** Quotes a cell that contains a comma, a quote or a line break. */
function quoteIfNeeded(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}
