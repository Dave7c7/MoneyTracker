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
| Live SoFi data via aggregator | Build, verify provider terms first | 5 |
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
- CSV import adapter with column mapping UI and saved profiles per institution (start with SoFi's export format)
- Idempotent import with dedupe (see `rules/data-and-money.md`)

**Done when:** importing the same CSV twice creates no duplicates; spending totals exclude transfers; splits reconcile exactly.

## Phase 4: Subscriptions, bills, budgets, net worth

- Recurring charge detection: same merchant, similar amount, regular cadence (weekly, monthly, annual); confidence + manual confirm/dismiss
- Subscriptions page: monthly/annual cost total, next expected date, price-change flag
- Upcoming bills: next 30 days from detected recurring items plus manually added bills; reminders
- Budgets per category (monthly), budget vs. actual dashboard, rollover optional
- Net worth: account balance snapshots over time, assets vs. liabilities
- Savings goals: target, deadline, manual or account-linked progress (tracking only, no money movement)

**Done when:** detection correctly flags the recurring items in the mock data and ignores one-offs; budget totals and net worth reconcile with fixtures.

## Phase 5: Live bank connection

- Before coding, research current options for SoFi access (Plaid, Teller, MX, SimpleFIN Bridge, or official API if one exists). Record findings, costs, and limits in `docs/DECISIONS.md`
- Implement as a new `DataSourceAdapter`; the rest of the app must not change
- Encrypted token storage, scheduled sync, manual "sync now", sync status and error display
- Handle pending vs. posted transactions without duplicating

**Done when:** a real account syncs on a schedule, pending-to-posted transitions do not create duplicates, and credentials are encrypted at rest.

## Phase 6: Hardening and extras

- Auth (passkey or password + TOTP), session security, rate limiting
- Alerts: unusually large charge, new subscription, price increase, low balance (push or email)
- Backups (documented `pg_dump` routine), data export (CSV/JSON), full data delete
- Optional: household sharing with per-user visibility
- Accessibility pass and performance pass on large datasets (50k+ transactions)

**Done when:** security checklist in `rules/security.md` passes; a fresh deploy from README works on a clean VPS.
