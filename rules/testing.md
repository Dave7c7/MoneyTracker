# Testing Rules

## Core Principle

**Tests ship with features.** Every feature must have comprehensive test coverage before merging.

## Test Strategy

### Unit Tests

1. **Coverage Requirements**
   - All business logic in `packages/core` must have >90% coverage
   - All pure functions tested
   - Edge cases and error conditions covered

2. **Test Structure**
   - Descriptive test names
   - Isolated test functions
   - Mock external dependencies
   - Clear arrange/act/assert pattern

3. **Test Examples**
   ```typescript
   describe('Rule evaluation', () => {
     test('user rule overrides bank category', () => {
       const rule = createUserRule('Starbucks', 'Food', 50);
       const transaction = createTransaction('Starbucks', 'Coffee', 45);
       const result = evaluateCategorization(transaction, [rule]);
       expect(result.category).toBe('Food');
       expect(result.source).toBe('user_rule');
     });
   });
   ```

### Integration Tests

1. **Database Tests**
   - Test CRUD operations
   - Test data consistency
   - Test transaction isolation
   - Use scratch database for isolation

2. **Adapter Tests**
   - Test each adapter independently
   - Mock external APIs
   - Test error handling
   - Test data transformation

### End-to-End Tests

1. **Playwright Tests**
   - Test complete user workflows
   - Test across device widths (360px, 448px, desktop)
   - Test mobile installation scenarios
   - Test offline capabilities

2. **Test Structure**
   - Page object models
   - Reusable fixtures
   - Cross-browser testing
   - Accessibility testing

## Test Organization

### Directory Structure

```
packages/
  core/
    test/                    # Core logic tests
    src/
  adapters/
    test/                    # Adapter tests
    src/
  db/
    test/                    # Database tests
    src/
apps/web/
  test/                     # Component and API tests
  src/
```

### Test Files

1. **Unit Test Files**
   - `*.test.ts` for component testing
   - `*-test.ts` for domain testing
   - `*.spec.ts` for integration testing

2. **Configuration**
   ```json
   {
     "preset": "vitest/node",
     "globals": true,
     "coverage": {
       "exclude": [
         "node_modules/",
         "dist/",
         "*.d.ts"
       ]
     }
   }
   ```

## Test Execution

### Command Line

1. **Development**
   ```bash
   pnpm test                    # Run all tests
   pnpm test packages/core      # Run specific package tests
   ```

2. **CI/CD Pipeline**
   ```bash
   # In GitHub Actions
   - name: Run tests
     run: pnpm test
     env:
       TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
   ```

### Test Environment

1. **Database Setup**
   ```bash
   # Scratch database for testing
   TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test
   
   # Create database
   createdb moneytracker_test
   ```

2. **Test Isolation**
   - Each test run gets fresh database
   - No data persists between tests
   - Rollback transactions where possible

## Test Categories

### Unit Tests

1. **Core Logic**
   - Categorization algorithms
   - Rule evaluation
   - Date calculations
   - Budget calculations

2. **Data Structures**
   - Account operations
   - Transaction handling
   - Category management
   - Merchant tracking

### Integration Tests

1. **Database**
   - Schema validation
   - Data integrity
   - Migration testing
   - Backup/restore

2. **Adapters**
   - Mock adapter
   - CSV adapter
   - SimpleFIN adapter (if implemented)
   - Error handling

### E2E Tests

1. **User Journeys**
   - Import bank data
   - Create and apply rules
   - Review transactions
   - Set budgets

2. **Device Testing**
   - Phone: 360px, mobile view
   - Tablet: 768px, responsive
   - Desktop: Full width

## Test Quality

### Test Naming

1. **Descriptive**
   - `should flag unusually large charge`
   - `should allow splitting transaction across categories`
   - `should detect transfer between checking and savings`

2. **Arrange-Act-Assert**
   ```typescript
   describe('Feature behavior', () => {
     let setup;
     
     beforeEach(() => {
       setup = arrangeTestData();
     });
     
     test('should handle edge case correctly', () => {
       const act = () => executeFeature(setup.input);
       const assert = () => expect(act()).toEqual(setup.expected);
       assert();
     });
   });
   ```

### Error Testing

1. **Invalid Inputs**
   - Test with malformed data
   - Test boundary conditions
   - Test missing required fields

2. **Error Handling**
   - Test error messages
   - Test error recovery
   - Test partial failures

## Test Maintenance

### Test Updates

1. **When to Update**
   - Business logic changes
   - API changes
   - Database schema changes
   - Bug fixes

2. **Update Process**
   ```
   Step 1: Update production logic
   Step 2: Add/update tests
   Step 3: Run tests to verify
   Step 4: Commit changes with test updates
   ```

### Test Cleanup

1. **Remove Unused Tests**
   - Delete tests for deleted features
   - Remove flaky tests
   - Consolidate overlapping tests

2. **Update Test Data**
   - Refresh test fixtures
   - Update expected results
   - Remove test pollution

## CI/CD Integration

### GitHub Actions

1. **Workflow File**
   ```yaml
   name: CI
   on: [push, pull_request]
   
   jobs:
     test:
       runs-on: ubuntu-latest
       services:
         postgres:
           image: postgres:16
           env:
             POSTGRES_USER: moneytracker
             POSTGRES_PASSWORD: moneytracker
             POSTGRES_DB: moneytracker
           options: >
             --health-cmd pg_isready
             --health-interval 10s
             --health-timeout 5s
             --health-retries 5
       
       steps:
         - uses: actions/checkout@v3
         
         - name: Setup Node.js
           uses: actions/setup-node@v3
           with:
             node-version: '22'
             cache: 'pnpm'
         
         - name: Install dependencies
           run: pnpm install --frozen-lockfile
         
         - name: Run typecheck
           run: pnpm typecheck
         
         - name: Run lint
           run: pnpm lint
         
         - name: Run unit tests
           run: pnpm test
           env:
             TEST_DATABASE_URL: postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test
         
         - name: Run e2e tests
           run: pnpm e2e
           env:
             E2E_DATABASE_URL: postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_e2e
   ```

2. **Test Status Checks**
   - Typecheck success/failure
   - Lint success/failure
   - Unit test coverage
   - E2E test results
   - Code quality metrics

## Test Reporting

### Coverage Reports

1. **HTML Reports**
   - Generate coverage HTML
   - Upload as artifact
   - Link in pull requests

2. **Codecov Integration**
   ```yaml
   coverage:
     status:
       project:
         threshold: 80%
       patch:
         default: auto
   ```

### Playwright Reports

1. **Test Results**
   - Upload screenshots on failure
   - Generate accessibility reports
   - Track test metrics

2. **Video Recordings**
   - Record failing tests
   - Include for debugging
   - Upload to artifacts

## Test Performance

### Performance Testing

1. **Large Dataset Testing**
   - Test with 50k+ transactions
   - Measure load times
   - Validate memory usage

2. **Mobile Performance**
   - Test on slower networks
   - Measure battery impact
   - Validate responsive design

### Test Optimization

1. **Parallel Testing**
   - Use multiple test workers
   - Parallel integration tests
   - Concurrent e2e tests

2. **Caching**
   - Cache database fixtures
   - Reuse test data
   - Mock external services

## Test Best Practices

### Test Quality

1. **Atomic Tests**
   - Each test has a single purpose
   - Tests are independent
   - No shared state between tests

2. **Descriptive Failures**
   - Clear error messages
   - Helpful stack traces
   - Context in test names

### Test Avoidance

1. **Don't Test Frameworks**
   - Focus on application logic
   - Mock external dependencies
   - Test business rules, not implementation

2. **Don't Test UI Details**
   - Test user workflows, not pixels
   - Focus on functionality
   - Test responsive behavior, not exact layout

## Test Documentation

### Test Coverage Report

1. **Generate Documentation**
   - Automatic test coverage report
   - List of tested features
   - Identified gaps

2. **Update When**
   - New features added
   - Business logic changes
   - Test coverage drops

### Test Design Documentation

1. **Test Design Notes**
   - Why test exists
   - What it tests
   - How it's implemented

2. **Maintenance Plans**
   - When tests need updating
   - Who owns the tests
   - Test retirement schedule

## Conclusion

Testing is essential for:

1. **Code Quality**
   - Prevent regressions
   - Document expected behavior
   - Catch edge cases

2. **User Experience**
   - Ensure features work correctly
   - Test across devices
   - Validate performance

3. **Maintenance**
   - Enable safe refactoring
   - Track feature completeness
   - Identify test gaps

Every feature must have comprehensive test coverage before merging to main.

---

*This document is part of the rules/ directory and should be referenced by all test implementations.*

---

**Last Updated:** 2026-10-22
**Next Review:** After Phase 6 implementation