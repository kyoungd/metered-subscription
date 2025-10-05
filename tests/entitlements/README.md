# UC-02: Get My Entitlements - Tests

## Overview

This directory contains comprehensive unit and integration tests for UC-02: Get My Entitlements endpoint.

**Endpoint:** `GET /api/me/entitlements`

**Purpose:** Returns the current user's subscription plan and usage information.

## Test Coverage

### Unit Tests (`entitlements.test.js`)

**18 tests covering:**

1. **Plan Configuration (3 tests)**
   - Loading plans by code
   - Invalid plan handling
   - Plan field validation

2. **Data Model (3 tests)**
   - User queries with subscriptions
   - Subscription creation linked to users
   - Usage counter creation for organizations

3. **Business Logic (6 tests)**
   - Fetching users with active subscriptions
   - Fetching usage counters for organizations
   - Calculating remaining usage
   - Handling missing usage counters
   - Response formatting
   - Multiple metrics handling

4. **Edge Cases (3 tests)**
   - Users without subscriptions
   - Multiple metrics from plan config
   - Preventing negative remaining values

5. **Acceptance Criteria (3 tests)**
   - HTTP 200 response
   - No external API calls
   - Stable envelope format

### Integration Tests (`../integration/entitlements-api.test.js`)

**12 tests covering:**

1. **Response Format (2 tests)**
   - Standard envelope structure
   - Error envelope structure

2. **Business Logic (3 tests)**
   - Metrics calculation from DB
   - No active subscription handling
   - Active/trialing subscription filtering

3. **Error Scenarios (2 tests)**
   - Missing plan configuration
   - Database errors

4. **UC-02 Acceptance Criteria (5 tests)**
   - 200 status with valid data
   - DB-only queries (no external calls)
   - Stable envelope format
   - Required fields present
   - Works without external dependencies

### API Endpoint Tests (`api-endpoint.test.js`)

**11 tests covering the ACTUAL route handler:**

1. **Authentication & Authorization (2 tests)**
   - Returns 401 when not authenticated
   - Returns 404 when user not found in DB

2. **Success Cases (5 tests)**
   - Returns entitlements with subscription
   - Returns hasSubscription=false for users without subscription
   - Calculates usage correctly
   - Handles missing usage counter (defaults to 0 used)
   - Only returns active/trialing subscriptions

3. **Error Cases (1 test)**
   - Returns 500 when plan config is missing

4. **UC-02 Acceptance Criteria (3 tests)**
   - Returns 200 with correct data structure
   - No external API calls - DB only
   - Returns stable envelope format

## Running Tests

```bash
# Run all entitlements tests
npm test tests/entitlements/

# Run specific test file
npm test tests/entitlements/entitlements.test.js

# Run integration tests
npm test tests/integration/entitlements-api.test.js

# Run in watch mode (development)
npm test -- --watch tests/entitlements/

# Run with coverage
npm test -- --coverage tests/entitlements/
```

## Test Data

Tests create and clean up their own data:

- **Test Users:** `test_entitlements_user`, `test_api_entitlements_user`, etc.
- **Test Subscriptions:** Linked to test users with `planCode: 'starter'`
- **Test Usage Counters:** Set to 150-350 used out of 1000 limit

All test data is automatically cleaned up after each test using `afterEach` and `afterAll` hooks.

## What's Tested

### ✅ Core Functionality
- Plan configuration loading
- Database queries (users, subscriptions, usage counters)
- Usage calculations (used, remaining, limits)
- Response formatting

### ✅ Edge Cases
- No subscription
- No usage data
- Multiple subscriptions (only active/trialing returned)
- Over-limit usage (remaining = 0, not negative)

### ✅ UC-02 Requirements
- Returns 200 for authenticated users
- No external API calls (DB only)
- Stable envelope format
- Returns: planCode, includedUnits, used, remaining, periodKey

## Test Results

```
✓ Unit Tests: 18/18 passed
✓ Integration Tests: 12/12 passed
✓ API Endpoint Tests: 11/11 passed (tests actual route handler)
✓ Total: 41/41 passed
```

## Architecture Notes

The tests validate that:

1. **No Organization table** - Uses `clerkOrgId` string references
2. **User-based billing** - Subscriptions belong to users, not orgs
3. **Plan configs from env** - Loads from `PLANS_CONFIG` environment variable
4. **DB-only queries** - No Stripe or Clerk API calls in data path
5. **Standard envelope** - All responses use `wrapSuccess`/`wrapError`

## Future Improvements

- [ ] Add E2E tests with actual HTTP requests
- [ ] Add performance tests for large datasets
- [ ] Add tests for multiple organizations per user
- [ ] Add tests for expired subscriptions
- [ ] Add tests for trial period handling
