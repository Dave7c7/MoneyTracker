/**
 * Transfer detection.
 *
 * Two transactions on two of the user's own accounts are one transfer when the
 * amounts are opposite and the dates are close. Nothing here touches the
 * database: the matcher is a pure function over a flat list, so it can be
 * tested against hand-checked fixtures.
 *
 * A credit card payment is a transfer too: money leaves checking and arrives
 * on the card, which reduces the balance owed rather than spending anything.
 */

import type { AccountType } from './types.ts';

/** How far apart two transactions may be and still be the same transfer. */
export const TRANSFER_WINDOW_DAYS = 3;

/** What the matcher needs to know about a transaction. */
export interface TransferCandidate {
  id: string;
  accountId: string;
  accountType: AccountType;
  /** UTC timestamp. A pending transaction has none. */
  postedAt: Date | null;
  amountMinor: number;
  descriptionRaw: string;
}

/** What kind of transfer a pair is. */
export type TransferKind = 'internal' | 'card_payment';

/** Two transactions that are the two sides of one transfer. */
export interface TransferPair {
  /** Stable key both sides share. */
  key: string;
  /** The side the money left. */
  debitId: string;
  /** The side the money arrived on. */
  creditId: string;
  /** The amount that moved, as a positive number. */
  amountMinor: number;
  kind: TransferKind;
  /** Whole days between the two postings. */
  daysApart: number;
}

/** A transaction that looks like a transfer but has no other side. */
export interface SuspectedTransfer {
  transactionId: string;
  amountMinor: number;
  reason: string;
}

/** The result of one detection run. */
export interface TransferDetection {
  pairs: TransferPair[];
  suspected: SuspectedTransfer[];
}

/** Options for the matcher. */
export interface TransferOptions {
  /** How many days apart two postings may be. Defaults to 3. */
  windowDays?: number;
}

/**
 * Words that mean "money moved between the user's own accounts".
 *
 * A pair needs at least one side that says so. Without that, a refund that
 * happens to match an outgoing payment would look like a transfer.
 *
 * The words have to be specific. "Payment" on its own is not enough: a utility
 * bill called "ELECTRIC BILL PAYMENT" is spending, and a payment to a person
 * is spending too. "Autopay" is not enough either: a phone bill paid by
 * autopay is spending. Banks that describe a card payment without naming the
 * card are missed, and the user can mark those by hand.
 */
const PAYMENT_HINTS: readonly RegExp[] = [
  /transfer/i,
  /credit\s*card/i,
  /debit\s*card/i,
  /thank\s*you/i,
  /payment\s*received/i,
];

/**
 * Whether a description reads like money moving between own accounts.
 *
 * @example
 * looksLikePayment('ONLINE TRANSFER TO SAVINGS 8820'); // true
 * looksLikePayment('BLUE BOTTLE COFFEE'); // false
 */
export function looksLikePayment(descriptionRaw: string): boolean {
  return PAYMENT_HINTS.some((pattern) => pattern.test(descriptionRaw));
}

/**
 * Words that mean "the merchant gave money back".
 *
 * A refund on a credit card looks like a payment on the card: same sign
 * change, and it can match an outgoing payment by accident.
 */
const REFUND_HINTS: readonly RegExp[] = [
  /refund/i,
  /reversal/i,
  /chargeback/i,
  /charge\s*back/i,
  /returned?\s+(payment|item|goods)/i,
];

/**
 * Whether a description reads like a refund rather than a payment.
 *
 * @example
 * looksLikeRefund('AIRBNB * REFUND 4HK2L9'); // true
 */
export function looksLikeRefund(descriptionRaw: string): boolean {
  return REFUND_HINTS.some((pattern) => pattern.test(descriptionRaw));
}

/**
 * Finds the transfers among a list of transactions.
 *
 * A pair needs four things: two different accounts, opposite amounts of the
 * same size, postings no more than `windowDays` apart, and at least one side
 * that reads like a payment. Every transaction belongs to at most one pair.
 *
 * A transaction that reads like a payment but found no partner is *suspected*:
 * it goes to the review inbox instead of being quietly counted as spending.
 *
 * @example
 * const { pairs, suspected } = detectTransfers(candidates);
 * pairs[0].kind; // 'card_payment'
 */
export function detectTransfers(
  candidates: readonly TransferCandidate[],
  options: TransferOptions = {},
): TransferDetection {
  const windowDays = options.windowDays ?? TRANSFER_WINDOW_DAYS;
  const posted = candidates.filter(
    (candidate) => candidate.postedAt !== null && candidate.amountMinor !== 0,
  );

  const inflowsByAmount = new Map<number, TransferCandidate[]>();
  for (const candidate of posted) {
    if (candidate.amountMinor < 0) continue;
    // Keyed by the size of the amount, so an outflow of -80_000 finds the
    // inflow of +80_000.
    const key = Math.abs(candidate.amountMinor);
    const list = inflowsByAmount.get(key);
    if (list) list.push(candidate);
    else inflowsByAmount.set(key, [candidate]);
  }

  const paired = new Set<string>();
  const pairs: TransferPair[] = [];

  // Outflows are walked oldest first, so the pairing does not depend on the
  // order the database returned the rows in.
  const outflows = posted
    .filter((candidate) => candidate.amountMinor < 0)
    .sort((a, b) => (a.postedAt?.getTime() ?? 0) - (b.postedAt?.getTime() ?? 0));

  for (const outflow of outflows) {
    if (paired.has(outflow.id)) continue;

    const amount = Math.abs(outflow.amountMinor);
    const partner = findPartner(outflow, inflowsByAmount.get(amount) ?? [], paired, windowDays);

    if (!partner) continue;

    paired.add(outflow.id);
    paired.add(partner.inflow.id);

    pairs.push({
      key: transferKey(outflow, partner.inflow),
      debitId: outflow.id,
      creditId: partner.inflow.id,
      amountMinor: amount,
      kind:
        outflow.accountType === 'credit_card' ||
        outflow.accountType === 'loan' ||
        partner.inflow.accountType === 'credit_card' ||
        partner.inflow.accountType === 'loan'
          ? 'card_payment'
          : 'internal',
      daysApart: partner.daysApart,
    });
  }

  const suspected: SuspectedTransfer[] = [];
  for (const candidate of posted) {
    if (paired.has(candidate.id)) continue;
    if (!looksLikePayment(candidate.descriptionRaw)) continue;
    if (looksLikeRefund(candidate.descriptionRaw)) continue;
    suspected.push({
      transactionId: candidate.id,
      amountMinor: Math.abs(candidate.amountMinor),
      reason:
        'Looks like money moving between your own accounts, but no matching transaction was found. ' +
        'Check it here, or mark it as a transfer.',
    });
  }

  return { pairs, suspected };
}

/**
 * Finds the inflow that pairs with an outflow: the closest one in time that
 * is still inside the window and not already used.
 */
function findPartner(
  outflow: TransferCandidate,
  inflows: readonly TransferCandidate[],
  paired: ReadonlySet<string>,
  windowDays: number,
): { inflow: TransferCandidate; daysApart: number } | null {
  let best: { inflow: TransferCandidate; daysApart: number } | null = null;

  for (const inflow of inflows) {
    if (paired.has(inflow.id)) continue;
    if (inflow.accountId === outflow.accountId) continue;

    const daysApart = daysBetween(outflow.postedAt, inflow.postedAt);
    if (daysApart > windowDays) continue;

    // The payment word has to be on one of the two sides, otherwise a refund
    // that happens to match an outgoing payment would look like a transfer.
    if (!looksLikePayment(outflow.descriptionRaw) && !looksLikePayment(inflow.descriptionRaw)) {
      continue;
    }

    // A refund is money coming back, not money moving between accounts.
    if (looksLikeRefund(outflow.descriptionRaw) || looksLikeRefund(inflow.descriptionRaw)) {
      continue;
    }

    if (!best || daysApart < best.daysApart) {
      best = { inflow, daysApart };
    }
  }

  return best;
}

/** Whole days between two timestamps. */
function daysBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.round(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * A key both sides of a pair share, so the same pair found twice has the same
 * key. The two ids and the amount are enough.
 */
function transferKey(debit: TransferCandidate, credit: TransferCandidate): string {
  const ids = [debit.id, credit.id].sort();
  return `${ids[0]}:${ids[1]}:${Math.abs(debit.amountMinor)}`;
}
