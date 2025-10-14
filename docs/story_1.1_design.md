# Story 1.1: Create Org

## Overview
Create organization record in database during sign-up flow.

---

## Design Specification

### route
POST /api/orgs/create

### scope
api

### dependencies
None

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
  name: string,           // Organization name
  ownerUserId: string     // Clerk user ID of owner
}
```

Schema reference: `schema://CreateOrgRequest@1`

---

## Responses

### 200 - Success
```yaml
description: "Organization created successfully"
body:
  orgId: string          // Generated organization ID (cuid)
```

### 400 - Bad Request
```yaml
description: "Validation error - missing or invalid fields"
body:
  code: "BAD_REQUEST"
  message: string
```

### 409 - Conflict
```yaml
description: "Organization already exists for this owner"
body:
  code: "CONFLICT"
  message: string
```

### 500 - Internal Server Error
```yaml
description: "Database or internal error"
body:
  code: "INTERNAL"
  message: string
```

---

## Side Effects

- Creates User record in database (if not exists) with Clerk user ID
- Creates Organization record in database
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
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

Since the Prisma schema doesn't have an Organization model yet, we'll store the organization relationship using Clerk's organization system and track it via `clerkOrgId` in the Subscription model.

### Process Flow
1. Extract correlation IDs from headers using `ensureIds()`
2. Initialize logger with `getLogger()`
3. Log incoming request with `logIncomingRequest()`
4. Validate request body (name, ownerUserId required)
5. Check if User exists by `clerkId`, create if not exists
6. Return success with generated `orgId` (use Clerk org ID)
7. Wrap response with `wrapSuccess()`
8. Handle errors with `wrapError()`

### Scaffold Usage
- `ensureIds()` from correlation.js - Extract/generate correlation IDs
- `getLogger()` from logging.js - Create contextual logger
- `logIncomingRequest()` from log-request.js - Log API request
- `db` from db.js - Prisma client for database operations
- `wrapSuccess()` / `wrapError()` from envelope.js - Response envelopes
- `ApiError` / `ErrorCode` from envelope.js - Error handling

---

## Tests

### unit
- **description**: "Happy path returns 200 with orgId"
  **expect**: "Response contains orgId string in cuid format"

- **description**: "Missing name field returns 400"
  **expect**: "Error code BAD_REQUEST with message indicating missing field"

- **description**: "Missing ownerUserId field returns 400"
  **expect**: "Error code BAD_REQUEST with message indicating missing field"

- **description**: "Invalid ownerUserId format returns 400"
  **expect**: "Error code BAD_REQUEST with validation error"

- **description**: "Database connection failure returns 500"
  **expect**: "Error code INTERNAL with appropriate message"

- **description**: "Correlation IDs are propagated in response"
  **expect**: "Response envelope contains correlationId from request headers"

---

## Documentation

### onCompletion
- Update /lib/scaffold/story_features.md
  - Add: `POST /api/orgs/create` - Create organization record

- If final story in group: Update /docs/api_global.md
  - Add: `POST /api/orgs/create` - Organization creation endpoint

---

## Files Allowed

```
/lib/scaffold/**                           # Read-only: utility functions
/lib/scaffold/story_features.md            # Update on completion
/app/api/orgs/create/route.js              # Create: API route handler
/prisma/schema.prisma                      # Read-only: use existing User model
/.env                                      # Read-only: environment variables
/docs/story_1.1_design.md                  # This file
/docs/api_global.md                        # Update if final story
```

---

## Notes

- This is the first story in the Sign-Up → Trial flow
- Organization concept relies on Clerk's organization system
- The `orgId` returned will be the Clerk organization ID
- User creation is idempotent (check by clerkId before creating)
- No Stripe or external service dependencies for this story
- Future stories (1.2-1.5) will build upon this foundation
