# Story 1.2: Ensure Stripe Customer

## Overview
Create or retrieve Stripe customer for an organization during sign-up flow. This endpoint is idempotent - multiple calls with the same orgId will return the same customer.

---

## Design Specification

### route
POST /api/stripe/customer/ensure

### scope
api

### dependencies
- 1.1 (Create Org)

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
  orgId: string,     // Organization ID (from 1.1)
  email: string      // Customer email address
}
```

Schema reference: `schema://EnsureStripeCustomerRequest@1`

---

## Responses

### 200 - Success
```yaml
description: "Stripe customer created or retrieved successfully"
body:
  stripeCustomerId: string     // Stripe customer ID (cus_xxx)
  created: boolean             // true if newly created, false if existing
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

### 500 - Internal Server Error
```yaml
description: "Stripe API error or internal error"
body:
  code: "INTERNAL"
  message: string
  detail:
    stripeCode: string  # Stripe error code if applicable
```

---

## Side Effects

- Creates Stripe customer via Stripe API (if not exists)
- Updates User record in database with stripeCustomerId
- Stores orgId in Stripe customer metadata as `externalId`
- Logs incoming request to DebugLog table
- Logs operation to structured logger

---

## Implementation Notes

### Database Schema
Uses existing Prisma schema:
```prisma
model User {
  id               String   @id @default(cuid())
  clerkId          String   @unique
  email            String   @unique
  stripeCustomerId String?  @unique
  // ...
}

model Organization {
  id          String   @id @default(cuid())
  clerkOrgId  String   @unique
  name        String   @unique
  ownerId     String   @unique
  // ...
}
```

### Process Flow
1. Extract correlation IDs from headers using `ensureIds()`
2. Initialize logger with `getLogger()`
3. Log incoming request with `logIncomingRequest()`
4. Validate request body (orgId, email required)
5. Query Organization by id to verify it exists
6. Get Organization owner (User) via `ownerId`
7. **Check if User already has stripeCustomerId:**
   - If yes: Return existing customerId with `created: false`
   - If no: Continue to create customer
8. Call Stripe API to create customer:
   - Use `clients.stripe.customers.createOrAttach({ externalId: orgId, email })`
   - Store orgId in Stripe metadata as `externalId`
9. Update User record with `stripeCustomerId`
10. Return success with `stripeCustomerId` and `created: true`
11. Wrap response with `wrapSuccess()`
12. Handle errors with `wrapError()`

### Idempotency Logic
- **Key**: User's stripeCustomerId field
- If stripeCustomerId exists on User → return immediately (idempotent)
- If not exists → create in Stripe and update DB
- This prevents duplicate Stripe customers for the same organization owner

### Scaffold Usage
- `ensureIds()` from correlation.js - Extract/generate correlation IDs
- `getLogger()` from logging.js - Create contextual logger
- `logIncomingRequest()` from log-request.js - Log API request
- `db` from db.js - Prisma client for database operations
- `clients.stripe` from di.js - Stripe client for API calls
- `createContainer()` from di.js - Dependency injection container
- `wrapSuccess()` / `wrapError()` from envelope.js - Response envelopes
- `ApiError` / `ErrorCode` from envelope.js - Error handling

### Stripe API Details
- Uses existing `stripe.customers.createOrAttach()` method
- Stores `externalId: orgId` in Stripe customer metadata
- Associates customer with email address
- Returns Stripe customer object with ID

### Error Handling
- **Stripe API failures**: Catch and wrap with `mapStripeError()`
- **Organization not found**: Return 404
- **Database errors**: Return 500
- **Invalid input**: Return 400

---

## Tests

### unit
- **description**: "Happy path creates Stripe customer and returns 200"
  **expect**: "Response contains stripeCustomerId and created=true"

- **description**: "Idempotent - returns existing customer without creating new one"
  **expect**: "Response contains stripeCustomerId and created=false, no new Stripe API call"

- **description**: "Missing orgId field returns 400"
  **expect**: "Error code BAD_REQUEST with message indicating missing field"

- **description**: "Missing email field returns 400"
  **expect**: "Error code BAD_REQUEST with message indicating missing field"

- **description**: "Invalid orgId (not found) returns 404"
  **expect**: "Error code NOT_FOUND with message 'Organization not found'"

- **description**: "Stripe API failure returns 500"
  **expect**: "Error code INTERNAL with Stripe error details"

- **description**: "Correlation IDs are propagated in response"
  **expect**: "Response envelope contains correlationId from request headers"

- **description**: "Updates User record with stripeCustomerId"
  **expect**: "User.stripeCustomerId is set after successful creation"

- **description**: "Stores orgId in Stripe metadata"
  **expect**: "Stripe customer metadata.externalId equals orgId"

---

## Documentation

### onCompletion
- Update /lib/scaffold/story_features.md
  - Add: `POST /api/stripe/customer/ensure` - Ensure Stripe customer (idempotent)

- If final story in group: Update /docs/api_global.md
  - Add: `POST /api/stripe/customer/ensure` - Stripe customer creation endpoint

---

## Files Allowed

```
/lib/scaffold/**                           # Read-only: utility functions
/lib/scaffold/story_features.md            # Update on completion
/app/api/stripe/customer/ensure/route.js   # Create: API route handler
/prisma/schema.prisma                      # Read-only: use existing User/Organization models
/.env                                      # Read-only: environment variables (STRIPE_SECRET_KEY)
/docs/story_1.2_design.md                  # This file
/docs/story_1.1_design.md                           # previous signatures (read-only)
/docs/api_global.md                        # Update if final story
```

---

## Notes

- This is the second story in the Sign-Up → Trial flow
- Depends on Story 1.1 (Create Org) being complete
- **Idempotency is critical** - multiple calls should not create duplicate Stripe customers
- Stripe customer ID is stored on the User record (organization owner)
- The orgId is stored in Stripe's metadata for reference and lookup
- Story 1.3 (Create Trial Subscription) will depend on this customer ID
- Environment variable `STRIPE_SECRET_KEY` must be configured
- Uses existing Stripe client from `/lib/scaffold/clients/stripe.js`
- No changes to Prisma schema required - uses existing `User.stripeCustomerId` field
