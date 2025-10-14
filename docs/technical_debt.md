# Technical Debt

This document tracks known technical debt, limitations, and future improvements for the metered subscription system.

## High Priority

### 1. Idempotency Key Pattern for Organization Creation

**Current State:**
- Organization creation uses "Check-Before-Create" pattern
- Searches Clerk for existing organizations before creating new ones
- Prevents duplicate organizations for the same user

**Limitation:**
- Race conditions still possible with concurrent requests
- No guaranteed idempotency across network retries
- Cannot safely retry failed requests with certainty

**Recommended Improvement:**
Implement industry-standard idempotency key pattern:

```javascript
POST /api/orgs/create
Headers:
  Idempotency-Key: <client-generated-uuid>

Body:
  { name, ownerUserId, email }
```

**Implementation:**
1. Add `IdempotencyKey` table:
   ```sql
   CREATE TABLE idempotency_keys (
     key VARCHAR(255) PRIMARY KEY,
     endpoint VARCHAR(255) NOT NULL,
     request_hash TEXT NOT NULL,
     response_status INT NOT NULL,
     response_body JSONB NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     expires_at TIMESTAMP NOT NULL
   );
   CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
   ```

2. On request with idempotency key:
   - Check if key exists
   - If exists, return cached response
   - If not, proceed with operation and store result

3. Benefits:
   - ✅ Guarantees exactly-once semantics
   - ✅ Prevents duplicate resources from network retries
   - ✅ Handles concurrent requests safely
   - ✅ Industry standard pattern (Stripe, Square, etc.)
   - ✅ Safe for mobile apps with unreliable networks

**Estimated Effort:** 2-3 days

**References:**
- [Stripe Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)
- [API Idempotency Patterns](https://brandur.org/idempotency-keys)

---

## Medium Priority

### 2. Rollback Mechanism for Partial Failures

**Current State:**
- If Clerk organization is created but database insert fails, Clerk org remains orphaned
- No cleanup or compensating transactions

**Recommended Improvement:**
Implement cleanup handlers:

```javascript
try {
  const clerkOrg = await clerk.organizations.createOrganization({...})

  try {
    const dbOrg = await db.organization.create({...})
    return success(dbOrg)
  } catch (dbError) {
    // Rollback: Delete Clerk org
    await clerk.organizations.deleteOrganization(clerkOrg.id)
    throw dbError
  }
} catch (error) {
  return error(...)
}
```

**Complexity:** Medium - need to handle various failure scenarios and ensure cleanup doesn't fail

**Estimated Effort:** 1-2 days

---

### 3. Distributed Transaction Pattern

**Future Consideration:**
For multi-step operations involving multiple external services (Clerk, Stripe, Stigg), consider implementing:
- Saga pattern for distributed transactions
- Event sourcing for audit trail
- Compensation logic for each step

**Estimated Effort:** 1-2 weeks (major architectural change)

---

## Low Priority

### 4. Rate Limiting per User/Organization

**Current State:**
- No rate limiting implemented
- Vulnerable to abuse from malicious actors or buggy clients

**Recommended Improvement:**
- Add rate limiting middleware
- Track requests per IP, user, or organization
- Return 429 Too Many Requests when exceeded

**Estimated Effort:** 1-2 days

---

### 5. Request Deduplication Cache

**Current State:**
- Each request fully executes even if identical to recent request
- No caching of responses

**Recommended Improvement:**
- Cache responses with short TTL (1-5 minutes)
- Use request hash (method + path + body + headers) as key
- Return cached response for duplicate requests within TTL

**Estimated Effort:** 1-2 days

---

## Completed Items

None yet.

---

## Notes

- Items marked "High Priority" should be addressed before production launch
- Items marked "Medium Priority" should be addressed within first 6 months of production
- Items marked "Low Priority" can be addressed as needed based on usage patterns

Last updated: 2025-10-12
