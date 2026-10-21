# Data and money rules

## Money

- Store amounts as **integers in minor units** (cents). Column type `bigint`.
- Sign convention: **negative = money out, positive = money in**, for every account type. Normalize in the adapter. For credit cards, a purchase is negative.
- Never use floating-point math on money. Format only at the UI edge, with `Intl.NumberFormat`.
- Store currency code per transaction. Do not mix currencies in totals without explicit conversion.
- Rounding for splits and percentages: allocate remainders deterministically so parts always sum to the original exactly.

## Dates

- Store timestamps in UTC. Store `posted_date` as a plain date (no timezone shifting) for display and monthly grouping.
- Monthly buckets use the user's configured timezone.

## Idempotent imports

- Unique key: `(account_id, external_id)`.
- If the source has no stable ID, derive `external_id` as a hash of `(account, posted_date, amount, normalized description, occurrence index within that day)`.
- Re-importing the same data must create zero duplicates. Add a test.
- Pending to posted: update the existing row, do not insert a new one. Match on external ID when available, otherwise on account + amount + merchant + date within a short window.
- Never delete user edits (category, notes, splits) during a sync.

## Transfers and card payments

- Detect transfers: two transactions on different own accounts, opposite amounts, within 3 days. Link them with a shared `transfer_group_id`.
- Credit card payment: outflow from checking/savings matched to an inflow on a card account. Treated as a transfer.
- Transfers are excluded from spending, income, and category budgets. They remain visible in transaction lists with a "Transfer" badge.
- Unmatched suspected transfers go to the review inbox, never silently counted as spending or income.
- User can manually mark or unmark a transaction as a transfer.

## Refunds

- A refund is a positive amount in the original category, and reduces that category's spending. Do not count it as income.

## Splits

- A split transaction has child lines, each with a category and amount. The sum of children must equal the parent exactly. Enforce in code and with a DB constraint where possible.

## Balances

- Store balance snapshots (`account_id, as_of, balance_minor`). Net worth is computed from snapshots, not by summing transactions.
- Liabilities (credit cards, loans) are negative contributions to net worth.

## Recurring / subscriptions (Phase 4)

- Candidate: same normalized merchant, 3+ occurrences, amounts within 10%, regular cadence (weekly ±1 day, monthly ±3 days, annual ±7 days).
- Store as `recurring_item` with status: `detected | confirmed | dismissed`. User decisions are final and never re-detected.
- Flag price changes (new amount differs from previous by more than 5%).

## Mock data

- Must include: transfers, card payments, refunds, pending items, duplicate-looking charges, messy merchant names, recurring subscriptions, a price increase, and one annual charge.
- Seeded with a fixed random seed so tests are reproducible.
