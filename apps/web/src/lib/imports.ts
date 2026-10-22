/**
 * Import schemas.
 *
 * The same schemas validate the request in the API and the form in the
 * browser, so a mapping can never mean two different things in the two
 * places it is written down.
 */

import { z } from 'zod';

/** How a file is read. */
export const csvMappingSchema = z.object({
  delimiter: z.enum(['auto', ',', ';', '\t', '|']),
  headerRow: z.number().int().min(0).max(100),
  dateColumn: z.string().max(200),
  dateFormat: z.enum(['auto', 'iso', 'mdy', 'dmy', 'month_day_year']),
  amountMode: z.enum(['single', 'separate']),
  amountColumn: z.string().max(200),
  debitColumn: z.string().max(200),
  creditColumn: z.string().max(200),
  amountSign: z.enum(['signed', 'debit_positive', 'debit_negative']),
  decimalSeparator: z.enum(['auto', '.', ',']),
  descriptionColumn: z.string().max(200),
  categoryColumn: z.string().max(200).nullable(),
  accountColumn: z.string().max(200).nullable(),
  currency: z.string().trim().length(3),
});

/** The body of a new import profile. */
export const importProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  institution: z.string().trim().max(120).nullable().optional(),
  mapping: csvMappingSchema,
  accountName: z.string().trim().min(1).max(120),
  accountType: z.enum(['checking', 'savings', 'credit_card', 'loan', 'cash']),
  currency: z.string().trim().length(3),
});

/** The body of a change to an import profile. */
export const importProfileUpdateSchema = importProfileSchema.partial();

/** A profile as the screen sees it. */
export interface ImportProfileView {
  id: string;
  name: string;
  institution: string | null;
  mapping: z.infer<typeof csvMappingSchema>;
  accountName: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'loan' | 'cash';
  currency: string;
}

/** What a file would do, before it does anything. */
export interface ImportPreviewView {
  fileName: string;
  rowCount: number;
  newRowCount: number;
  duplicateCount: number;
  dateRange: { from: string | null; to: string | null };
  columns: string[];
  unmappedColumns: string[];
  missingColumns: string[];
  errors: { rowNumber: number; reason: string }[];
  ambiguousDates: number;
  totalMinor: number;
  accounts: {
    externalId: string;
    name: string;
    type: string;
    currency: string;
    exists: boolean;
    rowCount: number;
  }[];
  sample: {
    date: string;
    amountMinor: number;
    description: string;
    category: string | null;
  }[];
}

/** What an import did. */
export interface ImportResultView {
  accountsUpserted: number;
  transactionsInserted: number;
  transactionsUpdated: number;
  assignmentsWritten: number;
  transferGroupsCreated: number;
  transfersLinked: number;
  suspectedTransfers: number;
  skippedRows: number;
}
