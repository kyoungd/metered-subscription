# Story 1.4: Provision in Stigg

## Overview
Provision a customer and subscription in Stigg after trial subscription is created in Stripe.

---

## Design Specification

### route
POST /api/stigg/provision

### scope
api

### dependencies
- 1.1 (Create Org)
- 1.2 (Ensure Stripe Customer)
- 1.3 (Create Trial Subscription)

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
  orgId: string,                 // Organization ID
  stripeCustomerId: string,      // Stripe customer ID (cus_xxx)
  stripeSubscriptionId: string,  // Stripe subscription ID (sub_xxx)
  planCode: string               // Plan code (e.g., 'plan_starter_m')
}
```

Schema reference: `schema://ProvisionStiggRequest@1`

---

## Responses

### 200 - Success
```yaml
description: "Successfully provisioned in Stigg"
body:
  provisioned: boolean           // true
  stiggCustomerId: string        // Stigg customer ID (if applicable)
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
description: "Organization or subscription not found"
body:
  code: "NOT_FOUND"
  message: string
```

### 500 - Internal Server Error
```yaml
description: "Stigg API error or internal error"
body:
  code: "INTERNAL"
  message: string
```

---

## Side Effects

- Provisions customer in Stigg via Stigg API
- Provisions subscription in Stigg via Stigg API
- Logs incoming request to DebugLog table
- Logs operation to structured logger

---

## Implementation Notes

### Process Flow
1. Validate request body (orgId, stripeCustomerId, stripeSubscriptionId, planCode required)
2. Query Organization to verify it exists
3. Query Subscription to verify it exists and belongs to organization
4. Call Stigg API to provision customer (if needed)
5. Call Stigg API to provision subscription
6. Return success with provisioned status

### Stigg Integration
- Use Stigg SDK or HTTP client for API calls
- Store Stigg API key in environment variable `STIGG_API_KEY`
- Map plan codes to Stigg plan IDs
- Handle Stigg-specific errors appropriately

### Scaffold Usage
- `getEnv()` - Environment configuration
- `createContainer()` - DI container
- `db` - Prisma client for database operations
- `wrapSuccess()` / `wrapError()` - Response envelopes
- Structured logging for all operations

---

## Tests

### unit
- **description**: "Happy path provisions in Stigg and returns 200"
  **expect**: "Response contains provisioned=true"

- **description**: "Missing required fields returns 400"
  **expect**: "Error code BAD_REQUEST"

- **description**: "Invalid orgId returns 404"
  **expect**: "Error code NOT_FOUND"

- **description**: "Invalid subscriptionId returns 404"
  **expect**: "Error code NOT_FOUND"

- **description**: "Stigg API failure returns 500"
  **expect**: "Error code INTERNAL"

- **description**: "Correlation IDs are propagated"
  **expect**: "Response contains correlationId from headers"

---

## Documentation

### onCompletion
- Update /lib/scaffold/story_features.md
  - Add: `POST /api/stigg/provision` - Provision customer and subscription in Stigg

- If final story in group: Update /docs/api_global.md
  - Add: `POST /api/stigg/provision` - Stigg provisioning endpoint

---

## Files Allowed

```
/lib/scaffold/**                           # Read-only: utility functions
/lib/scaffold/story_features.md            # Update on completion
/app/api/stigg/provision/route.js          # Create: API route handler
/lib/scaffold/clients/stigg.js             # Create: Stigg API client (if needed)
/prisma/schema.prisma                      # Read-only: use existing models
/.env                                      # Read-only: STIGG_API_KEY
/docs/story_1.4_design.md                  # This file
/docs/story_1.3_design.md                  # Previous story (read-only)
/docs/story_1.2_design.md                  # Previous story (read-only)
/docs/story_1.1_design.md                  # Previous story (read-only)
/docs/api_global.md                        # Update if final story
```

---

## Notes

- Depends on Stories 1.1 (Create Org), 1.2 (Ensure Stripe Customer), and 1.3 (Create Trial Subscription)
- Stigg API key must be configured in environment
- This story focuses on provisioning only (not usage tracking)
- Story 1.5 (Seed Usage Counter) will depend on this provisioning
- Stigg client implementation details left to implementer
- Handle Stigg API errors gracefully with appropriate status codes
