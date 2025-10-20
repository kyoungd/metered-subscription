# Story 1.1 Quick Reference

## Reusable Infrastructure Created

This guide provides quick reference for the foundational utilities created in Story 1.1 that can be reused in future stories.

---

## HTTP Utilities

### Envelope (`src/lib/utils/http/envelope.ts`)

```typescript
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";

// Success response
return NextResponse.json(
  wrapSuccess({ orgId: "123" }, correlationId),
  { status: 200 }
);

// Error response
return NextResponse.json(
  wrapError("VALIDATION_ERROR", "Invalid input", details, correlationId),
  { status: 400 }
);
```

### Headers (`src/lib/utils/http/headers.ts`)

```typescript
import { requireHeaders } from "@/lib/utils/http/headers";

// Auto-generates missing headers
const { requestId, correlationId } = requireHeaders(request);
```

---

## Authentication

### Auth Middleware (`src/lib/middleware/auth.ts`)

```typescript
import { requireAuth, requireAuthWithOrg } from "@/lib/middleware/auth";

// Requires auth (org optional)
const { userId, clerkOrgId } = await requireAuth();

// Requires auth + org context (throws 403 if no org)
const { userId, clerkOrgId } = await requireAuthWithOrg();
```

---

## Logging

### Logger (`src/lib/utils/logger.ts`)

```typescript
import { logger } from "@/lib/utils/logger";

// Basic logging
logger.info("Operation completed", { orgId, userId });
logger.error("Operation failed", { error: err.message });

// Child logger with context
const requestLogger = logger.child({
  request_id: requestId,
  correlation_id: correlationId,
  orgId,
});

requestLogger.info("Processing request");
```

---

## Validation

### Validation Utilities (`src/lib/utils/validation.ts`)

```typescript
import { safeParseResponse, validateOrThrow } from "@/lib/utils/validation";
import { z } from "zod";

const schema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Safe parse (returns result object)
const result = safeParseResponse(schema, data);
if (!result.success) {
  throw result.error; // ValidationError
}

// Validate or throw
const validated = validateOrThrow(schema, data);
```

---

## Error Handling

### Error Classes (`src/lib/utils/errors.ts`)

```typescript
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  toDomainError,
} from "@/lib/utils/errors";

// Throw specific errors
throw new ValidationError("Invalid input", { field: "email" });
throw new UnauthorizedError("Authentication required");
throw new ForbiddenError("Organization context required");

// Normalize any error
try {
  // ... operation
} catch (error) {
  const domainError = toDomainError(error);
  return NextResponse.json(
    wrapError(domainError.code, domainError.message, domainError.details, correlationId),
    { status: domainError.statusCode }
  );
}
```

---

## Security

### PII Redaction (`src/lib/utils/security/redaction.ts`)

```typescript
import { redactPII, redactHeaders } from "@/lib/utils/security/redaction";

// Redact PII from objects
const safeData = redactPII(userData);
logger.info("User data", safeData);

// Redact sensitive headers
const safeHeaders = redactHeaders(request.headers);
logger.debug("Request headers", { headers: safeHeaders });
```

---

## ID Generation

### ID Utilities (`src/lib/utils/ids.ts`)

```typescript
import { generateId, generateOrganizationId, isValidUuid } from "@/lib/utils/ids";

// Generate IDs
const id = generateId(); // UUID v4
const orgId = generateOrganizationId(); // UUID v4

// Validate
if (isValidUuid(id)) {
  // Valid UUID
}
```

---

## Database Patterns

### Repository Pattern

```typescript
// src/lib/db/repositories/[entity]-repository.ts
import { db } from "@/lib/db";
import { EntityCreationError } from "@/lib/errors/entity-errors";

export async function upsertEntityByKey(key: string) {
  try {
    return await db.entity.upsert({
      where: { key },
      update: {},
      create: { key, /* ... */ },
    });
  } catch (error) {
    throw new EntityCreationError(`Failed to create entity: ${key}`, {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### Service Pattern

```typescript
// src/lib/services/[domain]/[entity]-service.ts
import { upsertEntityByKey } from "@/lib/db/repositories/entity-repository";
import { EntityValidationError } from "@/lib/errors/entity-errors";
import { logger } from "@/lib/utils/logger";

export async function createEntity(key: string) {
  // Validate input
  if (!isValidKey(key)) {
    throw new EntityValidationError(`Invalid key format: ${key}`);
  }

  logger.info("Creating entity", { key });

  // Call repository
  const entity = await upsertEntityByKey(key);

  logger.info("Entity created", { entityId: entity.id, key });

  return { entityId: entity.id };
}
```

---

## API Route Pattern

```typescript
// src/app/api/[resource]/[action]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { createEntity } from "@/lib/services/[domain]/entity-service";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  let correlationId = "";
  let requestId = "";

  try {
    // 1. Headers
    const headers = requireHeaders(request);
    correlationId = headers.correlationId;
    requestId = headers.requestId;

    const requestLogger = logger.child({
      request_id: requestId,
      correlation_id: correlationId,
    });

    requestLogger.info("Processing request");

    // 2. Auth
    const { clerkOrgId } = await requireAuthWithOrg();

    // 3. Parse body (if needed)
    const body = await request.json();
    // const validated = validateOrThrow(schema, body);

    // 4. Business logic
    const result = await createEntity(clerkOrgId);

    requestLogger.info("Request completed", { result });

    // 5. Success response
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);
    
    logger.error("Request failed", {
      request_id: requestId,
      correlation_id: correlationId,
      error: domainError.message,
      code: domainError.code,
    });

    return NextResponse.json(
      wrapError(
        domainError.code,
        domainError.message,
        domainError.details,
        correlationId
      ),
      { status: domainError.statusCode }
    );
  }
}
```

---

## Testing Patterns

### Integration Test Pattern

```typescript
import { POST } from "@/app/api/[resource]/[action]/route";
import {
  mockAuthenticatedWithOrg,
  mockUnauthenticated,
} from "../../helpers/mock-clerk-auth";
import {
  mockEntityUpsert,
  createMockEntity,
  resetDbMocks,
} from "../../helpers/mock-db";
import {
  createTestRequestWithHeaders,
  extractJsonBody,
} from "../../helpers/test-request";

describe("POST /api/[resource]/[action]", () => {
  beforeEach(() => {
    resetClerkAuthMock();
    resetDbMocks();
  });

  test("happy_path - Returns 200 with expected data", async () => {
    // Arrange
    const mockEntity = createMockEntity();
    mockAuthenticatedWithOrg("user_test123", "org_test456");
    mockEntityUpsert(mockEntity);

    const request = createTestRequestWithHeaders({
      url: "http://localhost:3000/api/[resource]/[action]",
      method: "POST",
      body: {},
    });

    // Act
    const response = await POST(request);
    const body = await extractJsonBody(response);

    // Assert
    expect(response.status).toBe(200);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("correlationId");
  });

  test("unauthenticated - Returns 401", async () => {
    mockUnauthenticated();

    const request = createTestRequestWithHeaders({
      url: "http://localhost:3000/api/[resource]/[action]",
      method: "POST",
      body: {},
    });

    const response = await POST(request);
    const body = await extractJsonBody(response);

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });
});
```

### Unit Test Pattern

```typescript
import { createEntity } from "@/lib/services/[domain]/entity-service";
import { upsertEntityByKey } from "@/lib/db/repositories/entity-repository";
import { EntityValidationError } from "@/lib/errors/entity-errors";
import { createMockEntity } from "../../helpers/mock-db";

jest.mock("@/lib/db/repositories/entity-repository");

const mockUpsertEntityByKey = upsertEntityByKey as jest.MockedFunction<
  typeof upsertEntityByKey
>;

describe("Entity Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("creates entity successfully", async () => {
    const mockEntity = createMockEntity();
    mockUpsertEntityByKey.mockResolvedValue(mockEntity);

    const result = await createEntity("valid_key");

    expect(result).toEqual({ entityId: mockEntity.id });
    expect(mockUpsertEntityByKey).toHaveBeenCalledWith("valid_key");
  });

  test("throws validation error for invalid input", async () => {
    await expect(createEntity("invalid")).rejects.toThrow(EntityValidationError);
    expect(mockUpsertEntityByKey).not.toHaveBeenCalled();
  });
});
```

---

## Common Imports

```typescript
// HTTP
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireHeaders } from "@/lib/utils/http/headers";

// Auth
import { requireAuth, requireAuthWithOrg } from "@/lib/middleware/auth";

// Logging
import { logger } from "@/lib/utils/logger";

// Validation
import { validateOrThrow, safeParseResponse } from "@/lib/utils/validation";

// Errors
import { toDomainError, ValidationError, UnauthorizedError } from "@/lib/utils/errors";

// Security
import { redactPII } from "@/lib/utils/security/redaction";

// Database
import { db } from "@/lib/db";

// Config
import { env } from "@/lib/env";
import { config } from "@/lib/config";
```

---

## Best Practices

1. **Always use envelope format** for API responses
2. **Always validate headers** with `requireHeaders()`
3. **Always authenticate** with `requireAuth()` or `requireAuthWithOrg()`
4. **Always log with context** (request_id, correlation_id, orgId)
5. **Always redact PII** in logs
6. **Always use structured errors** (ApplicationError subclasses)
7. **Always normalize errors** with `toDomainError()` in catch blocks
8. **Always use repository pattern** for database access
9. **Always use service pattern** for business logic
10. **Always write tests** (unit + integration)

---

## File Structure Reference

```
src/
├── lib/
│   ├── utils/
│   │   ├── http/
│   │   │   ├── envelope.ts       # wrapSuccess, wrapError
│   │   │   └── headers.ts        # requireHeaders
│   │   ├── security/
│   │   │   └── redaction.ts      # redactPII
│   │   ├── logger.ts             # Structured logger
│   │   ├── validation.ts         # Zod wrappers
│   │   ├── ids.ts                # ID generation
│   │   └── errors.ts             # Error classes
│   ├── middleware/
│   │   └── auth.ts               # requireAuth
│   ├── db/
│   │   └── repositories/         # Data access layer
│   ├── services/
│   │   └── [domain]/             # Business logic
│   ├── api/
│   │   └── [resource]/           # DTOs
│   └── errors/
│       └── [domain]-errors.ts    # Domain errors
└── app/
    └── api/
        └── [resource]/
            └── [action]/
                └── route.ts      # API handlers

tests/
├── helpers/                      # Test utilities
├── unit/                         # Unit tests
└── integration/                  # Integration tests
```

