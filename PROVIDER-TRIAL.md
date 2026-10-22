# Provider trial

Phase 5 adds a live bank connection. `PLAN.md` puts an evaluation gate before
any code: the provider is chosen by a trial, not by an assumption, and the
findings go into `DECISIONS.md`.

This file is the trial: what to check, what is known today, and where to write
the answer down.

Nothing in the app depends on the choice. Every source is a `DataSourceAdapter`
(`packages/core/src/types.ts`), so a provider is one new file in
`packages/adapters/src/` and nothing else changes.

## What the app needs from a provider

```ts
export interface DataSourceAdapter {
  id: string;
  fetchAccounts(): Promise<NormalizedAccount[]>;
  fetchTransactions(accountId: string, since?: Date): Promise<NormalizedTransaction[]>;
  fetchBalances?(): Promise<NormalizedBalance[]>;
}
```

- Amounts arrive as **integer minor units**, negative means money out. The
  adapter normalizes the sign; the app never does.
- `postedAt` is UTC; `pending` is true while the transaction has not posted.
- Every row needs a stable `externalId`, or one is derived from the account,
  date, amount, description and occurrence. Imports must be idempotent.
- Full account numbers never leave the adapter. Only the last four digits are
  stored.
- The provider's own category is a *hint*: it is mapped and capped at 0.7
  confidence, never trusted blindly.

## What is known today (checked 2026-10-22)

| Option | Price | Coverage | What it takes | Verdict |
|---|---|---|---|---|
| **SimpleFIN Bridge** | $1.50 + tax a month or $15 + tax a year, up to 25 institutions and 25 apps | US and Canada; the list changes, so check before paying | The user creates a setup token and pastes it into the app. Read-only: the app never sees the bank password | **Best fit so far** |
| **Plaid** | Free Trial plan for new signups since 2026-04-15 (up to 10 items, real data, Transactions and Balances, OAuth for Chase, BofA and Wells Fargo). Pay-as-you-go after that, the price is shown when Production access is requested | Thousands of institutions; SoFi is covered | Full Production asks for a business description and an 11-point security questionnaire | The backup plan |
| **Teller** | — | — | — | **Out**: the API product was withdrawn in July 2026 |
| **SoFi CSV export** | Free | SoFi only, web only, 2 years per export | A file you download and import | The path that works today |

SimpleFIN fits this app because it is built for it: one token pasted into a
self-hosted app, read-only access, $15 a year, and no security questionnaire.
Its limits are known and the app is designed around them: 90 days of history
per request, refreshed about once a day, and no pending transactions.

## The questions the trial has to answer

Only the first one needs a real account; the rest follow from it.

1. **Does SimpleFIN cover the accounts to connect?** Check the institution
   directory: <https://beta-bridge.simplefin.org/search-institutions>. Look
   for the exact institution *and* the account type. An international bank's
   US version does not mean its accounts in other countries work.
2. **How far back does it reach for that institution?** The limit is 90 days
   per request, and some institutions have less. The app backfills in slices
   and keeps what the file import already brought, so a short window is not a
   blocker.
3. **How fresh is it?** About once every 24 hours, and the time of day
   depends on the bank. The app shows when the last sync happened.
4. **Does it report pending transactions?** SimpleFIN does not. The app
   handles that: a source that never reports pending is a normal source, and
   a pending row from another source is updated in place when it posts.
5. **What does it cost?** $1.50 a month or $15 a year, plus tax, for up to 25
   institutions. One connection covers every account of one institution.
6. **Is the fallback still there?** The CSV import keeps working whatever the
   provider does, and the two agree because both go through the same rules,
   the same merchant memory and the same transfer detection.

## Recording the outcome

When the questions are answered, add a row to `DECISIONS.md` with the date,
the provider, the price and the coverage. Then write the adapter:

- `packages/adapters/src/<provider>/index.ts` — the adapter.
- `packages/adapters/src/registry.ts` — register it.
- A contract test against the shared adapter suite, like every other source.

The connection itself is already in place: `connections` and
`connection_accounts` hold one row per provider account, the credential is
encrypted with `ENCRYPTION_KEY` before it is stored, and one failing
connection never blocks another.
