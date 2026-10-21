# Testing and quality rules

## Principle

Money and categorization logic must be provably correct before UI is built on top of it.

## Required tests (write alongside the code)

**Money**
- No floats: property test that splitting an amount across N parts always sums to the original.
- Sign convention: credit card purchase is negative; refund is positive.

**Categorization**
- Priority order: user rule beats merchant memory beats bank category beats AI beats fallback.
- Locked (manual) assignments are never overwritten by re-categorization.
- Rule conflicts resolve deterministically.
- Merchant normalization: 30+ messy real-looking strings map to the expected merchant.

**Import and sync**
- Importing the same data twice creates zero duplicates.
- Pending to posted transition updates the row, not inserts.
- Adapters conform to the interface: run one shared contract test suite against every adapter (mock, csv, live).

**Transfers and splits**
- Transfer pairs are linked and excluded from spending and income.
- Unmatched suspected transfers go to review.
- Split children always sum to the parent.

**Recurring**
- Mock data's subscriptions are detected; one-off purchases are not; dismissed items are not re-detected.

**Dashboards**
- Fixture-based tests: a small, hand-calculated dataset produces exact expected totals for each dashboard query.

**End-to-end (Playwright, keep few and stable)**
- Fix a miscategorized transaction, create a rule, see other transactions update.
- Clear the review inbox.
- Import a CSV.

## Quality gates (before every commit)

```
pnpm test && pnpm lint && pnpm typecheck
```

## Code style

- TypeScript strict, no `any` without a comment explaining why.
- Small functions, explicit names, no dead code.
- Domain terms are consistent: `transaction`, `merchant`, `category`, `rule`, `assignment`, `transfer`, `recurring_item`.
- Comments explain why, not what.
- Public functions in `core` have a short doc comment with an example.
