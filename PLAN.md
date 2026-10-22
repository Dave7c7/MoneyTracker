# PLAN.md

Build in phases. Each phase ends with a "Done when" checklist. Do not start the next phase until it passes.

## What is possible to build (and what is not)

| Feature | Verdict | Phase |
|---|---|---|
| Multi-account transaction aggregation | Build | 1, 3, 5 |
| Spending dashboards (category, trends, cash flow) | Build | 1 |
| Rule-based + learning categorization with review inbox | Build (core differentiator) | 2 |
| Transfer and card-payment detection | Build | 3 |
| Split transactions | Build | 3 |
| CSV import | Build | 3 |
| Subscription / recurring charge detection | Build | 4 |
| Upcoming bills and reminders | Build | 4 |
| Budgets (budget vs. actual) | Build | 4 |
| Net worth over time | Build | 4 |
| Savings goals (tracking only) | Build | 4 |
| Live bank data via a provider (chosen after evaluation) | Build, verify provider terms first | 5 |
| Several bank connections at once, across providers | Build | 5 |
| Alerts (unusual charge, price increase, low balance) | Build | 6 |
| Multi-user / household sharing | Later, only if needed | 6 |
| Bill negotiation | Do not build (human service) | n/a |
| Subscription cancellation concierge | Do not build (human service) | n/a |
| Credit score | Do not build (needs bureau partner) | n/a |
| Automated money movement for savings | Do not build (regulatory and risk) | n/a |

---

## Phase 0: Foundations

- Monorepo, TypeScript strict, lint, format, typecheck, test runner
- Docker Compose with `app` and `db`, env config via `.env.example`
- DB schema + migrations for: accounts, transactions, categories, merchants, rules, category_assignments
- Core types: `Account`, `NormalizedTransaction`, `DataSourceAdapter` (see `rules/architecture.md`)

**Done when:** `docker compose up` starts an empty app; migrations run; CI-equivalent script (`test`, `lint`, `typecheck`) passes.

## Phase 1: Mock data and dashboards

- Mock adapter generating 12+ months of realistic data across 3+ accounts (checking, savings, credit card), including transfers, card payments, refunds, recurring charges, and messy merchant names
- Seed command
- Responsive PWA shell (installable, mobile-first navigation)
- Dashboards: spending by category over time, month-over-month, cash flow (in vs. out), top merchants, account list with balances
- Transaction list with search, filters (account, category, date, amount)

**Done when:** seeded app shows all dashboards correctly on phone and desktop widths; numbers match a hand-checked fixture in tests.

## Phase 2: Categorization, rules, and review inbox (the differentiator)

- Categorization pipeline in priority order: user rules, merchant memory, bank-provided category, optional ML/LLM guess, fallback "Uncategorized"
- Every assignment stores: `category_id`, `source`, `confidence`, `reason`
- Rules engine: match on merchant, description pattern, amount range, account; priority ordering
- "Needs review" inbox: low-confidence and uncategorized items, keyboard and swipe friendly
- Correction flow: fix one transaction, then prompt "Apply to all from this merchant?" and create a rule
- Re-run categorization on existing data when a rule changes, without overwriting manual edits
- Explanation shown on each transaction ("Matched your rule: Shell → Gas")

**Done when:** corrections create rules that stick; manual edits are never overwritten; unit tests cover priority order, rule conflicts, and re-categorization.

## Phase 3: Transfers, splits, and CSV import

- Transfer detection between own accounts (opposite amounts, close dates, matching accounts) and credit card payment detection
- Transfers excluded from spending and income totals, still visible in lists
- Split a transaction across categories (amounts must sum to the original)
- CSV import adapter with a generic column-mapping UI: the user maps the columns of an export, saves
  the mapping as a named profile for that institution, and the profile is reused on the next import.
  Ship one SoFi profile as an example, not SoFi-specific code: any bank's export must be importable
  without new code, because the format is not known yet.
- Mapping profiles live in the database and cover the date and number formats, the sign convention
  (debit negative or positive), the account the rows belong to, and the duplicate key.
- Import preview before anything is written: row count, date range, duplicates that will be skipped,
  unmapped columns, and the accounts that will be created.
- Idempotent import with dedupe (see `rules/data-and-money.md`)
- The first import is a CSV, so that the history no provider can backfill is not lost

**Done so far:** transfer detection, the whole CSV import path (the generic
adapter, the mapping profiles, the preview and the idempotent import), and
splitting a transaction across categories.

**Done when:** importing the same CSV twice creates no duplicates; an export from an institution with
no built-in profile can be imported by creating a mapping profile; spending totals exclude transfers;
splits reconcile exactly.

## Phase 4: Subscriptions, bills, budgets, net worth

- Recurring charge detection: same merchant, similar amount, regular cadence (weekly, monthly, annual); confidence + manual confirm/dismiss
- Subscriptions page: monthly/annual cost total, next expected date, price-change flag
- Upcoming bills: next 30 days from detected recurring items plus manually added bills; reminders
- Budgets per category (monthly), budget vs. actual dashboard, rollover optional
- Net worth: account balance snapshots over time, assets vs. liabilities
- Savings goals: target, deadline, manual or account-linked progress (tracking only, no money movement)

**Done so far:** the detector (same merchant, three or more charges, amounts
within ten percent, a regular cadence), the subscriptions screen with the
monthly and yearly cost, the next 30 days, a price-change flag and the
confirm/dismiss decision, bills added by hand, budgets per category with
rollover, net worth over time from the balance snapshots, and savings goals.

**Done when:** detection correctly flags the recurring items in the mock data and ignores one-offs; budget totals and net worth reconcile with fixtures.

## Phase 5: Live bank connection

- Evaluation gate before any code: trial the options below, confirm the current terms, the price and
  the institution coverage, and record the findings in `DECISIONS.md`. No provider is assumed to win.
- Implement the chosen provider as a new `DataSourceAdapter`; the rest of the app must not change.
- One provider per account, many providers per install: each connection is a row with its own
  credentials, refresh cadence, history window and status.
- Encrypted token storage per connection, scheduled sync, manual "sync now", sync status and error
  display that never leaks credentials.
- Coverage-aware backfill: a source declares how far back it can reach and the sync fills the history
  in slices, so a 90-day window and a 2-year CSV export both end up in the same place.
- Handle pending vs. posted transactions without duplicating, including sources that never report
  pending (CSV) next to sources that do (aggregators).
- When a provider covers an account that was already imported by CSV, the provider becomes
  authoritative for that account and the imported rows are relinked instead of duplicated.

**Done so far:** the evaluation, with what is known today and the questions
still to answer, in `PROVIDER-TRIAL.md`; the provider chosen: SimpleFIN, at
$1.50 a month or $15 a year, read-only, with a setup token the user pastes
into the app; the adapter, behind the same interface as every other source
and proven by the shared contract suite; the connection itself, as one row per
provider account with its own credential, refresh rhythm, history window and
status; the credential encrypted with AES-256-GCM before it is stored; an
account belonging to exactly one connection; a per-connection status and error
that never contains the credential; the screen that connects a bank, picks the
accounts and syncs them; and the history fetched in slices, because one
request covers at most 90 days.

**Still to do:** a scheduled sync, and the backfill of the history a CSV
export brought before a provider took the account over.

| Option | Cost and fit | Caveats to verify |
|---|---|---|
| SimpleFIN Bridge | Up to 25 institutions for $1.50/month or $15/year. Good self-hosting fit. | Refreshes about once a day; some accounts have less than 90 days of history. SoFi coverage unconfirmed. |
| Teller | Developer tier includes 100 free live connections. | The access method can break per bank; SoFi coverage unconfirmed; needs mTLS certificates. |
| Plaid | Confirmed SoFi coverage. | Production access may require security attestation; a 2023 comment calls the pricing too high for individuals. Check the current terms. |
| SoFi CSV export | Free and works today. | Web-only, not in the app; each export is limited to a 2-year range; the credit card export is unconfirmed. Relay has its own export. |

**Done when:** two accounts from two different sources sync on a schedule; a pending-to-posted
transition creates no duplicates; one failing source shows an error without blocking the others; and
credentials are encrypted at rest.

## Phase 6: Hardening and extras

- Auth (passkey or password + TOTP), session security, rate limiting
- Alerts: unusually large charge, new subscription, price increase, low balance (push or email)
- Backups (documented `pg_dump` routine), data export (CSV/JSON), full data delete
- Optional: household sharing with per-user visibility
- Accessibility pass and performance pass on large datasets (50k+ transactions)

**Done when:** security checklist in `rules/security.md` passes; a fresh deploy from README works on a clean VPS.
