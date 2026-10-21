/**
 * API request schemas.
 *
 * Every body that reaches a route handler is validated here first, so a
 * route never passes unvalidated input to the query layer.
 */

import { z } from 'zod';

/** A category id: a uuid. */
const categoryId = z.string().uuid();

/** An amount in minor units. */
const amountMinor = z.number().int();

/** The body of a rule, used for creating and for previewing. */
export const ruleBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId,
  priority: z.number().int().min(0).max(10_000).optional(),
  enabled: z.boolean().optional(),
  matchMerchant: z.string().trim().max(120).nullable().optional(),
  matchDescriptionPattern: z.string().trim().max(200).nullable().optional(),
  minAmountMinor: amountMinor.nullable().optional(),
  maxAmountMinor: amountMinor.nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
});

/** The body of a rule preview: the same fields, nothing else needed. */
export const rulePreviewSchema = ruleBodySchema.partial({ name: true }).extend({
  name: z.string().trim().max(120).optional(),
});

/** The body of a rule update: every field optional. */
export const ruleUpdateSchema = ruleBodySchema.partial();

/** The body of a reorder: the rule ids in their new order. */
export const reorderSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

/** The body of a manual category change. */
export const manualCategorySchema = z.object({
  categoryId,
});

/** The body of a bulk category change. */
export const bulkCategorySchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1).max(500),
  categoryId,
});

/**
 * Reads and validates a JSON body.
 *
 * @example
 * const body = await readJson(request, ruleBodySchema);
 * if (!body.ok) return body.response;
 */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid JSON body' }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        {
          error: 'Invalid request',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
