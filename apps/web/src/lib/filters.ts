/**
 * Transaction filters.
 *
 * The same schema validates the query string in the browser and in the API,
 * so a filter can never mean two different things.
 */

import { z } from 'zod';

const plainDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a plain date (YYYY-MM-DD)');

/** The validated filters the query layer understands. */
export const transactionFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: plainDate.optional(),
  to: plainDate.optional(),
  minAmountMinor: z.coerce.number().int().optional(),
  maxAmountMinor: z.coerce.number().int().optional(),
  pending: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Filters after validation. */
export type TransactionFilters = z.infer<typeof transactionFilterSchema>;

/**
 * Parses filters from an untyped source, dropping anything invalid.
 *
 * @example
 * parseTransactionFilters({ search: 'coffee', limit: '25' });
 * // { search: 'coffee', limit: 25, offset: 0 }
 */
export function parseTransactionFilters(input: Record<string, unknown>): TransactionFilters {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    cleaned[key] = value;
  }

  const parsed = transactionFilterSchema.safeParse(cleaned);
  if (parsed.success) return parsed.data;

  // Fall back to the defaults, keeping only the fields that are valid.
  const partial: Record<string, unknown> = {};
  for (const key of Object.keys(transactionFilterSchema.shape)) {
    const single = transactionFilterSchema.shape[
      key as keyof typeof transactionFilterSchema.shape
    ].safeParse(cleaned[key]);
    if (single.success) partial[key] = single.data;
  }
  return transactionFilterSchema.parse(partial);
}
