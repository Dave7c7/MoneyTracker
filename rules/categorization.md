# Categorization Rules

## Core Principle

**User rules beat automatic guesses. Always.** Every categorization decision prioritizes the user's explicit rules over any automatic assignment.

## Categorization Pipeline Priority

1. **User-defined rules** (highest priority)
   - Exact matches on merchant, description pattern, amount range, account
   - Rules evaluated in order (first match wins)
   - Can be created, edited, or deleted by the user

2. **Merchant memory** (user-corrected patterns)
   - Past manual category corrections for specific merchants
   - Applied to similar transactions automatically

3. **Bank-provided categories** (medium priority, capped at 0.7 confidence)
   - Categories provided by bank/financial institution
   - Limited to low-confidence assignments
   - Falls to review inbox when below threshold

4. **Optional ML/LLM guess** (low priority)
   - AI-assisted categorization if enabled
   - Only when other methods fail

5. **Fallback "Uncategorized"** (lowest priority)
   - Default assignment when no other method applies
   - Goes to review inbox for manual categorization

## Assignment Tracking

Every category assignment includes:
- `category_id`: The assigned category
- `source`: How the assignment was determined
  - `user_rule`: User-created rule
  - `user_manual`: Direct manual edit
  - `merchant_memory`: Pattern from past corrections
  - `bank`: Bank-provided category
  - `ai`: AI/ML categorization
  - `fallback`: Default uncategorized
- `confidence`: How confident the assignment is (0.0-1.0)
- `reason`: Human-readable explanation of the assignment

## Review Inbox Management

- Low-confidence assignments (below `REVIEW_CONFIDENCE_THRESHOLD`)
- Uncategorized transactions
- New merchant memory patterns
- AI categorization results

**Keyboard shortcuts:**
- `j`/`k`: Move between items
- `Enter`: Confirm selection
- `x`: Select multiple items
- `u`: Undo last action

## Rule Conflicts and Resolution

When multiple rules could apply:
1. First matching rule in the list wins
2. Manual edits are never overwritten
3. Rule edits re-categorize matching transactions
4. Changes are reported with counts of affected transactions

## Testing Requirements

- Unit tests for rule priority order
- Tests for rule conflict resolution
- Tests for re-categorization behavior
- Tests for manual edit protection
- Integration tests for categorization pipeline