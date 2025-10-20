# API Documentation

## Overview

This document describes the REST API endpoints for the metered subscription platform.

All endpoints follow standard conventions:
- **Authentication**: Bearer token (Clerk session) via `Authorization` header
- **Request ID**: `x-request-id` header (auto-generated if missing)
- **Correlation ID**: `x-correlation-id` header (auto-generated if missing)
- **Response Format**: JSON with standard envelope structure

### Standard Response Envelope

#### Success Response
```json
{
  "data": { ... },
  "correlationId": "uuid-v4"
}
```

#### Error Response
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  },
  "correlationId": "uuid-v4"
}
```

### Standard Error Codes

- `UNAUTHORIZED` (401): Missing or invalid authentication
- `FORBIDDEN` (403): Authenticated but lacks required permissions/context
- `VALIDATION_ERROR` (400): Invalid request payload
- `NOT_FOUND` (404): Resource not found
- `CONFLICT` (409): Resource conflict (e.g., duplicate)
- `INTERNAL_SERVER_ERROR` (500): Server error
- `ORG_CREATION_ERROR` (500): Organization creation failed

---

## Organizations

### Create Organization

Creates or retrieves an organization/tenant record keyed by Clerk organization ID.

**Endpoint**: `POST /api/orgs/create`

**Authentication**: Required (Clerk session with organization context)

**Headers**:
- `Authorization`: Bearer token (Clerk session)
- `x-request-id`: Request ID (auto-generated if missing)
- `x-correlation-id`: Correlation ID (auto-generated if missing)

**Request Body**: Empty object `{}` (clerkOrgId extracted from session)

**Response**: `200 OK`

```json
{
  "data": {
    "orgId": "clxy1234567890abcdef"
  },
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error Responses**:

- `401 UNAUTHORIZED`: Missing authentication
  ```json
  {
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Authentication required"
    },
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```

- `403 FORBIDDEN`: No organization context in session
  ```json
  {
    "error": {
      "code": "FORBIDDEN",
      "message": "Organization context required"
    },
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```

- `400 VALIDATION_ERROR`: Invalid Clerk org ID format
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid Clerk organization ID format: invalid_format. Expected format: org_[alphanumeric]"
    },
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```

- `500 ORG_CREATION_ERROR`: Database or creation failure
  ```json
  {
    "error": {
      "code": "ORG_CREATION_ERROR",
      "message": "Failed to create or retrieve organization for Clerk org ID: org_test123",
      "details": {
        "originalError": "Database connection failed"
      }
    },
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```

**Idempotency**:
- Multiple calls with the same `clerkOrgId` return the same `orgId`
- Database-level idempotency via upsert operation
- Request-level idempotency can be achieved via `x-request-id` (requires caching layer)

**Example Request**:

```bash
curl -X POST https://api.example.com/api/orgs/create \
  -H "Authorization: Bearer <clerk_session_token>" \
  -H "x-request-id: req_1234567890" \
  -H "x-correlation-id: corr_0987654321" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Example Response**:

```json
{
  "data": {
    "orgId": "clxy1234567890abcdef"
  },
  "correlationId": "corr_0987654321"
}
```

**Notes**:
- The `clerkOrgId` is extracted from the authenticated Clerk session, not from the request body
- Organization name defaults to `"Organization {clerkOrgId}"` and can be updated later
- Timestamps (`createdAt`, `updatedAt`) are stored in UTC
- PII is redacted from logs (email, name, tokens)
- No external API calls are made (no Stripe/Stigg/Clerk API calls)

---

## Future Endpoints

Additional endpoints will be documented as they are implemented:
- `POST /api/subscriptions/create` - Create Stripe subscription
- `POST /api/usage/record` - Record usage event
- `GET /api/quota/check` - Check quota availability
- `POST /api/webhooks/stripe` - Stripe webhook handler
- `POST /api/webhooks/clerk` - Clerk webhook handler

