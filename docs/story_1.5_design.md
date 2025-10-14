# Story 1.5: Seed Usage Counter

## Overview
Initialize usage counter for an organization's billing period after Stigg provisioning.

---

## Design Specification

### route
POST /api/usage/seed

### scope
api

### dependencies
- 1.1 (Create Org)
- 1.4 (Provision in Stigg)

---

## Request

### headers
```yaml
required:
  - x-request-id
  - x-correlation-id
optional:
  - x-tenant-id
```

### body
```typescript
{
  orgId: string,        // Organization ID
  periodKey: string     // Billing period key (e.g., '2025-10')
}
```

Schema reference: `schema://SeedUsageRequest@1`

---

## Responses

### 200 - Success
```yaml
description: "Usage counter initialized"
body:
  used: number              // Current usage (should be 0)
  remaining: number         // Remaining allowance from plan
  periodKey: string         // Billing period key
  limit: number             // Total limit for period
```

### 400 - Bad Request
```yaml
description: "Validation error - missing or invalid fields"
body:
  code: "BAD_REQUEST"
  message: string
```

### 404 - Not Found
```yaml
description: "Organization not found"
body:
  code: "NOT_FOUND"
  message: string
```

### 409 - Conflict
```yaml
description: "Usage counter already exists for this period"
body:
  code: "CONFLICT"
  message: string
  detail:
    existingCounter:
      used: number
      remaining: number
```

### 500 - Internal Server Error
```yaml
description: "Database error or internal error"
body:
  code: "INTERNAL"
  message: string
```

---

## Side Effects

- Creates UsageCounter record in database
- Logs incoming request to DebugLog table
- Logs operation to structured logger

---

## Implementation Notes

### Process Flow
1. Validate request body (orgId and periodKey required)
2. Query Organization to verify it exists
3. Query Subscription to get current plan and limits
4. Check if UsageCounter already exists for orgId + periodKey → 409 if exists
5. Get plan configuration to determine usage limits
6. Create UsageCounter record with used=0, remaining=limit
7. Return counter details

### Usage Counter Schema
- Store per-organization, per-period counters
- Fields: orgId, periodKey, used, remaining, limit, planCode
- Unique constraint on (orgId, periodKey)

### Scaffold Usage
- `getEnv()` - Environment configuration
- `createContainer()` - DI container
- `db` - Prisma client for database operations
- `getPlanByCode()` - Get plan limits
- `wrapSuccess()` / `wrapError()` - Response envelopes
- Structured logging for all operations

---

## Tests

### unit
- **description**: "Happy path seeds counter and returns 200"
  **expect**: "Response contains used=0, remaining=limit, periodKey"

- **description**: "Missing required fields returns 400"
  **expect**: "Error code BAD_REQUEST"

- **description**: "Invalid orgId returns 404"
  **expect**: "Error code NOT_FOUND"

- **description**: "Duplicate counter for same period returns 409"
  **expect**: "Error code CONFLICT with existing counter details"

- **description**: "Counter uses plan limits from subscription"
  **expect**: "Remaining matches plan's included usage"

- **description**: "Correlation IDs are propagated"
  **expect**: "Response contains correlationId from headers"

---

## Documentation

### onCompletion
- Update /lib/scaffold/story_features.md
  - Add: `POST /api/usage/seed` - Initialize usage counter for billing period

- If final story in group: Update /docs/api_global.md
  - Add: `POST /api/usage/seed` - Usage counter initialization endpoint

---

## Files Allowed

```
/lib/scaffold/**                           # Read-only: utility functions
/lib/scaffold/story_features.md            # Update on completion
/app/api/usage/seed/route.js               # Create: API route handler
/prisma/schema.prisma                      # Read existing models, may need to add UsageCounter model
/.env                                      # Read-only
/docs/story_1.5_design.md                  # This file
/docs/story_1.4_design.md                  # Previous story (read-only)
/docs/story_1.3_design.md                  # Previous story (read-only)
/docs/story_1.2_design.md                  # Previous story (read-only)
/docs/story_1.1_design.md                  # Previous story (read-only)
/docs/api_global.md                        # Update if final story
```

---

## Notes

- Depends on Stories 1.1 (Create Org) and 1.4 (Provision in Stigg)
- Usage counter is idempotent check - only one per orgId + periodKey
- Period key format should be consistent (e.g., 'YYYY-MM' for monthly billing)
- Plan limits come from plan configuration (via getPlanByCode)
- This is the initialization step - actual usage tracking happens in other stories
- May need to add UsageCounter model to Prisma schema if it doesn't exist
