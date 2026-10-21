# UI and dashboard rules

## Principles

- Mobile-first, responsive, installable PWA. Every screen must be usable at 360px width.
- Dashboards are the product's first impression: clear, fast, uncluttered.
- Accessibility: keyboard navigable, sufficient contrast, labels on charts, no color-only meaning. Support light and dark mode.
- Loading, empty, and error states for every data view. Empty states explain what to do next.

## Core screens

1. **Overview**: this month spending vs. last month, cash flow, budget status, top categories, needs-review count, upcoming bills.
2. **Spending**: by category over time (stacked bars), category drill-down to transactions, month-over-month comparison.
3. **Cash flow**: income vs. expenses per month, net savings, rolling average.
4. **Transactions**: search, filters, bulk edit, inline category change, explanation on tap.
5. **Review inbox**: the fast path to clean data. Show count badge in navigation.
6. **Rules**: list, edit, reorder, see how many transactions each rule affects.
7. **Subscriptions and bills** (Phase 4): monthly and annual totals, next dates, price-change flags, confirm/dismiss.
8. **Budgets** (Phase 4): budget vs. actual with progress bars.
9. **Net worth** (Phase 4): line chart, assets vs. liabilities, per-account breakdown.
10. **Accounts and sync**: connection status, last sync, errors, manual sync.

## Chart rules

- All aggregation happens on the server or in `core`, never ad hoc in components.
- Totals must exclude transfers (see `data-and-money.md`) and say so in a tooltip or footnote.
- Show the date range and currency on every chart.
- Charts must handle 12+ categories gracefully (group small ones into "Other", expandable).

## Interaction rules

- Changing a category is at most two taps/clicks.
- Optimistic updates for edits, with rollback and a visible error on failure.
- Show category source on each transaction (rule, memory, bank, AI, manual) with a small badge.
- Undo for rule creation and bulk edits.

## Performance

- Paginate or virtualize lists over 100 rows.
- Dashboard queries must return in under 500 ms on 50k transactions (add indexes on `account_id`, `posted_date`, `category_id`).
