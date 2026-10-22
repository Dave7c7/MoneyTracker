# Data and Money Rules

## Core Principles

**Money is integers.** Store amounts in minor units (cents) as integers. Floats never touch money. Formatting happens once, at the edge, with `Intl.NumberFormat`.

**Transfers and card payments are not spending.** Money that moves between your own accounts or from checking to credit card stays out of spending totals.

## Data Structure

### Amount Handling

1. **Minor Units**
   - All amounts stored as integers
   - USD cents, JPY yen, other currencies as minor units
   - Examples:
     - $1.99 = 199
     - €2.50 = 250
     - ¥123 = 123

2. **Conversion Functions**
   ```typescript
   // Convert to minor units
   function toMinorUnits(amount: number, currency: string): number {
     return Math.round(amount * getMinorUnitMultiplier(currency));
   }
   
   // Convert from minor units
   function fromMinorUnits(minor: number, currency: string): number {
     return minor / getMinorUnitMultiplier(currency);
   }
   ```

3. **Formatting**
   - All formatting at API boundary
   - `Intl.NumberFormat` for locale-aware display
   - Consistent formatting across all outputs

### Transfer Detection

1. **Definition**
   - Money moving between own accounts
   - Credit card to checking payments
   - Two transactions with opposite signs

2. **Detection Criteria**
   - Same amount, opposite signs
   - Close dates (within 3 days)
   - Matching accounts
   - Description patterns ("transfer", "payment", "thank you")

3. **Exclusion Rules**
   - Never counted as spending
   - Always have "Transfer" category
   - Appear in separate transfer view
   - Don't affect net worth calculations

### Card Payment Detection

1. **Definition**
   - Checking → Credit card movement
   - Usually monthly automatic payments
   - Often have specific merchant patterns

2. **Detection**
   - Opposite amounts between accounts
   - Same merchant/description
   - Close timing
   - Specific card payment indicators

## Data Integrity

### Idempotent Imports

1. **Duplicate Prevention**
   - `(account_id, external_id)` is unique
   - Importing same data twice creates no duplicates
   - Pending transactions become posted, not duplicated

2. **Import Process**
   ```
   Step 1: Read file into browser
   Step 2: Show preview and mapping UI
   Step 3: Validate and normalize data
   Step 4: Deduplicate existing rows
   Step 5: Insert new rows
   Step 6: Update matched rows
   ```

3. **Conflict Resolution**
   - Manual edits lock rows
   - Import matches existing rows by id
   - Never overwrite user changes

### Transaction Categorization

1. **Categorization Rules**
   - User rules always win
   - Manual edits never overwritten
   - Transfer/category detection takes precedence

2. **Category Assignment**
   - All transactions must have a category
   - Transfers use special "Transfer" category
   - Card payments use payment category

## Money Flow

### Budget Calculation

1. **Budget Limits**
   - Per-category, per-month limits
   - Can rollover unspent amounts
   - Alerts when limits exceeded

2. **Budget vs. Actual**
   - Compare budgeted amount vs. actual spending
   - Visual indicators (green/yellow/red)
   - Month-over-month comparisons

### Net Worth Calculation

1. **Assets and Liabilities**
   - Asset accounts: checking, savings, investments
   - Liability accounts: credit cards, loans
   - Net worth = Assets - Liabilities

2. **Balance Snapshots**
   - Daily balance updates
   - Historical tracking
   - Month-end calculations

## Testing Requirements

### Unit Tests

1. **Money Operations**
   - Currency conversion
   - Rounding behavior
   - Negative vs. positive amounts

2. **Transfer Detection**
   - Matching algorithms
   - Edge cases (multiple transfers)
   - Card payment identification

3. **Import Deduplication**
   - Duplicate detection
   - Conflict resolution
   - Rollback on failure

### Integration Tests

1. **Full Import Cycle**
   - CSV file through entire pipeline
   - Database interaction
   - API endpoint testing

2. **Multi-source Consistency**
   - Bank vs. CSV vs. manual data
   - Duplicate prevention across sources
   - Transfer detection across sources

### End-to-End Tests

1. **User Workflows**
   - Import a bank file
   - Create and apply rules
   - Review and approve transactions
   - Create budgets and goals

2. **Cross-device Testing**
   - Phone: 360px width
   - Tablet: 768px width
   - Desktop: Full width

## Migration Considerations

### Version Updates

1. **Data Format Changes**
   - Always maintain backward compatibility
   - Migrate data incrementally
   - Provide clear upgrade instructions

2. **Schema Changes**
   ```sql
   -- Example migration for new fields
   ALTER TABLE accounts ADD COLUMN mask VARCHAR(4);
   ALTER TABLE accounts ADD COLUMN is_savings BOOLEAN DEFAULT FALSE;
   ```

### Rollback Procedures

1. **Data Protection**
   - Daily backups before migrations
   - Point-in-time recovery
   - Migration testing in staging

2. **Rollback Process**
   - Database rollback scripts
   - Application version management
   - Data validation after rollback

## Performance Considerations

### Large Datasets

1. **Optimization**
   - Index frequently queried columns
   - Use efficient query patterns
   - Implement pagination

2. **Testing with Large Data**
   - Simulate 50k+ transactions
   - Test dashboard loading times
   - Validate memory usage

### Mobile Performance

1. **Network Considerations**
   - Lazy load data
   - Compress API responses
   - Cache frequently accessed data

2. **Battery and Data**
   - Minimize background operations
   - Optimize for mobile networks
   - Reduce data usage