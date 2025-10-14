# Story 1 Integration Test Documentation

## Overview

The Story 1 integration test validates the complete **Sign-Up → Trial** flow end-to-end. Unlike unit tests that verify individual endpoints in isolation, this integration test ensures all 5 stories work together as a cohesive user journey.

## Why Story-Level Integration Tests?

### 1. **Real-World Flow Validation**
Individual unit tests verify each endpoint works correctly, but integration tests verify the entire user journey works as designed when data flows from one step to the next.

### 2. **Catch Integration Issues**
You might have all 5 endpoints working perfectly in isolation, but fail when:
- Data format changes between steps
- Required fields are missing in responses
- IDs don't match up across systems (Clerk vs database)
- External API calls have unexpected side effects

### 3. **Living Documentation**
The test serves as executable documentation showing exactly how the sign-up flow should work, with real code examples.

### 4. **Regression Protection**
When refactoring any part of the flow, this test immediately catches if you break the chain of dependencies.

### 5. **Realistic Scenarios**
Tests real user behavior patterns, including:
- Happy path (complete flow)
- Idempotency (repeating steps)
- Error cases (wrong order)
- Conflict detection (duplicate actions)

## Test File

**Location**: `/tests/integration/story-1-complete-flow.test.js`

**Test Count**: 4 comprehensive scenarios

## Test Scenarios

### 1. Complete Sign-Up to Trial Flow (Happy Path)

**Description**: Verifies the entire 5-step flow executes successfully in sequence.

**Steps Verified**:
1. **Story 1.1 - Create Organization**
   - Creates Clerk organization
   - Creates database User and Organization records
   - Returns Clerk organization ID

2. **Story 1.2 - Ensure Stripe Customer**
   - Creates Stripe customer for organization owner
   - Stores `stripeCustomerId` in User record
   - Idempotent operation (can be called multiple times)

3. **Story 1.3 - Create Trial Subscription**
   - Creates Stripe subscription with trial period
   - Creates Subscription record in database
   - Links to organization and user
   - Returns subscription status='trialing'

4. **Story 1.4 - Provision in Stigg**
   - Provisions customer in Stigg with organization metadata
   - Provisions subscription in Stigg with trial dates
   - Verifies correct parameters passed to Stigg API

5. **Story 1.5 - Seed Usage Counter**
   - Creates usage counters for all metrics in plan
   - Initializes with used=0, remaining=limit
   - Parses period key into date ranges

**Assertions**:
- All API responses return 200 status
- Database records created correctly at each step
- Data flows between steps (orgId, userId, stripeCustomerId, etc.)
- External API mocks called with correct parameters
- Final state is consistent across all systems
- Correlation IDs propagated through entire flow

### 2. Partial Completion and Idempotency

**Description**: Verifies that if the flow is interrupted and restarted, the system handles it gracefully.

**Key Test**: Story 1.2 (Ensure Stripe Customer) is idempotent
- First call creates customer
- Second call returns existing customer without error
- No duplicate customers created

**Why Important**: In production, API calls may fail, time out, or be retried. Idempotent operations prevent data corruption and duplicate resources.

### 3. Out-of-Order Execution Handling

**Description**: Verifies proper error handling when steps are done in wrong order.

**Scenario**: Try to create subscription (Step 1.3) before ensuring customer (Step 1.2)

**Expected Result**:
- Returns 404 error
- Error message: "Stripe customer not found"
- No subscription created in database
- System remains in consistent state

**Why Important**: Validates that the API properly enforces dependencies between steps and provides clear error messages for incorrect usage.

### 4. Duplicate Prevention

**Description**: Verifies that usage counters cannot be duplicated for the same period.

**Scenario**:
- Complete entire flow through Step 1.5
- Try to seed usage counters again for same period

**Expected Result**:
- First seed: Returns 200, creates counters
- Second seed: Returns 409 Conflict
- Error includes details of existing counters
- No duplicate counters in database

**Why Important**: Prevents data corruption and ensures billing accuracy by enforcing unique constraints.

## Test Coverage Summary

| Story | Individual Unit Tests | Story Integration Test | What Integration Adds |
|-------|----------------------|------------------------|----------------------|
| 1.1 Create Org | 27 tests | ✓ | Verifies Clerk org creation works with DB storage |
| 1.2 Ensure Customer | 26 tests | ✓ | Verifies idempotency across restarts |
| 1.3 Create Subscription | 29 tests | ✓ | Verifies subscription uses correct customer |
| 1.4 Provision Stigg | 29 tests | ✓ | Verifies Stigg receives correct org metadata |
| 1.5 Seed Usage | 24 tests | ✓ | Verifies counters use correct plan from subscription |
| **Total** | **135 unit tests** | **4 integration tests** | **End-to-end flow validation** |

## Key Integration Points Validated

### 1. Organization ID Flow
```
Story 1.1 creates orgId (Clerk) →
Story 1.2 uses orgId to find user →
Story 1.3 uses orgId for subscription →
Story 1.4 uses orgId for Stigg metadata →
Story 1.5 uses orgId for usage counters
```

### 2. Customer ID Flow
```
Story 1.2 creates stripeCustomerId →
Story 1.3 uses stripeCustomerId for subscription →
Story 1.4 sends stripeCustomerId to Stigg
```

### 3. Subscription Data Flow
```
Story 1.3 creates subscription with planCode →
Story 1.4 sends planCode to Stigg →
Story 1.5 uses planCode to get limits
```

### 4. Plan Configuration Flow
```
Story 1.3 uses getPlanByCode() for trial days →
Story 1.4 uses getPlanByCode() for Stigg planId →
Story 1.5 uses getPlanByCode() for usage limits
```

## Running the Tests

```bash
# Run Story 1 integration test only
npm test -- tests/integration/story-1-complete-flow.test.js

# Run all integration tests (including unit tests for each story)
npm test -- tests/integration/

# Run with coverage
npm test -- --coverage tests/integration/story-1-complete-flow.test.js
```

## Test Results

```
✓ tests/integration/story-1-complete-flow.test.js (4 tests) 231ms
  ✓ Story 1 Integration: Complete Sign-Up → Trial Flow
    ✓ should complete entire sign-up to trial flow successfully (206ms)
    ✓ should handle partial completion and idempotency correctly (9ms)
    ✓ should fail gracefully if subscription creation happens before customer (8ms)
    ✓ should prevent duplicate usage counters for same period (8ms)

Test Files  1 passed (1)
     Tests  4 passed (4)
```

## Mocking Strategy

### External Services Mocked
- **Clerk API**: Organization and user creation
- **Stripe API**: Customer and subscription creation
- **Stigg API**: Customer and subscription provisioning

### Real Database Operations
- All PostgreSQL operations use real database
- No mocking of Prisma client
- Proper cleanup in `afterEach` hooks

### Why This Approach?
- **Mocking external APIs**: Prevents test flakiness from network issues, API rate limits, and costs
- **Real database**: Catches actual SQL errors, constraint violations, and relationship issues
- **Best of both worlds**: Fast, reliable tests that still catch real database problems

## Common Integration Issues Caught

1. **Missing Foreign Keys**: Database constraints catch invalid IDs
2. **Wrong Data Types**: Type mismatches between systems
3. **Missing Required Fields**: API expects fields not returned by previous step
4. **Incorrect Status Values**: Subscription status doesn't match expected enum
5. **Date Format Issues**: Different date formats between systems
6. **Metadata Mismatch**: External APIs receive wrong metadata structure

## Maintenance Notes

### When to Update This Test

1. **API Contract Changes**: If any endpoint's request/response format changes
2. **New Required Fields**: If new required fields are added to any story
3. **External API Changes**: If Stripe, Clerk, or Stigg API contracts change
4. **Business Logic Changes**: If the sign-up flow order or requirements change

### How to Extend

To add new scenarios:
```javascript
it('should handle [new scenario]', async () => {
  // 1. Create org
  // 2. Ensure customer
  // 3. Create subscription
  // 4. Provision Stigg
  // 5. Seed usage
  // 6. Assert expected behavior
})
```

## Related Documentation

- Individual story designs: `/docs/story_1.X_design.md`
- Unit test files: `/tests/integration/[endpoint]-api.test.js`
- API documentation: `/docs/api_global.md`
- Feature tracking: `/lib/scaffold/story_features.md`

