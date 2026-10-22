# Categorization rules

Categorization is the core feature. Treat it with the most care.

## Pipeline (strict priority order)

1. **User rules**: explicit rules the user created (merchant, description pattern, amount range, account). Highest priority. Among rules, lower `priority` number wins; ties broken by most specific match.
2. **Merchant memory**: the category the user previously chose for this normalized merchant.
3. **Transfer detection**: money moving between the user's own accounts is never spending. A confirmed transfer is confident; a suspected one stays below the threshold and waits in the review inbox.
4. **Bank-provided category**: mapped through a mapping table. Never trusted blindly; confidence is capped at 0.7.
5. **ML/LLM suggestion** (optional): always lower confidence than 1-3.
6. **Fallback**: `Uncategorized`, confidence 0, goes to review inbox.

Stop at the first step that produces a result.

## Every assignment stores

```ts
{
  transactionId, categoryId,
  source: "user_manual" | "user_rule" | "merchant_memory" | "bank" | "ai" | "fallback",
  confidence: number,        // 0..1
  reason: string,            // human-readable, e.g. "Matched your rule: Shell → Gas"
  locked: boolean            // true for manual edits
}
```

## Hard guarantees

- **Manual edits are locked.** Re-categorization never overwrites a `locked` assignment.
- **User rules always beat everything automatic.** Add a test for this.
- **Deterministic.** Same input and same rules give the same output.
- **Re-run on rule change.** Creating or editing a rule re-categorizes affected unlocked transactions, and the UI shows how many changed.

## Review inbox

- A transaction enters the inbox when confidence is below the threshold (default 0.8, configurable) or it is `Uncategorized`.
- Clearing an item: user confirms or changes the category. That sets `locked = true` and offers "Apply to all from this merchant?".
- Inbox must be fast to clear: bulk select, keyboard shortcuts on desktop, swipe or tap on mobile, and group by merchant so one decision clears many.
- Never silently auto-confirm low-confidence items.

## Merchant normalization

- Build a `normalizeMerchant(descriptionRaw)` function: strip store numbers, location suffixes, payment-processor prefixes (e.g. `SQ *`, `TST*`, `PAYPAL *`), and case.
- Keep the mapping `descriptionRaw → merchantId` so corrections apply to all variants.
- Unit test with at least 30 real-looking messy strings.

## Rule creation UX

- After a manual correction, prompt: "Apply to all transactions from {merchant}?" with options: this one only, all from this merchant, all from this merchant matching an amount range.
- Show a preview of how many existing transactions the rule will affect before saving.

## Transfers are special

Transfers and card payments are not categories of spending. See `data-and-money.md`.

- A transfer needs two of the user's own accounts, opposite amounts of the same size, postings no more than three days apart, and a description on one side that reads like a payment.
- A confirmed transfer gets the transfer category at 0.95 confidence and a shared group id.
- A suspected transfer (it reads like a payment, but no other side was found) keeps the transfer category so it is never counted as spending, and stays below the threshold so the review inbox asks about it.
- Changing a category by hand takes a transaction out of its transfer group: deciding what something is means deciding it is not a transfer. Choosing the `Transfer` category keeps it in the group, and confirms a suspected transfer.
