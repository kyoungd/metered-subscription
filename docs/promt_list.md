D8WLDh5y5G!78VN

INSTRUCTION
For each story, I need you to create the design for it. I need the output in the OUTPUT FORMAT defined below.

STORY

@File /docs/steps.md
@story 1.1

## OUTPUT FORMAT

route: <HTTP VERB> <PATH> # e.g., POST /api/signup
scope: api|fn|migration # one only
dependencies: # other chips this relies on (IDs only)

- 1.1
- 1.2

request:
headers:
required: [x-request-id, x-tenant-id]
body: # schema $id references only
$ref: "schema://<Body>@1"

responses:
200:
description: "Success case"
body: {orgId: string}
400:
description: "Validation error"
409:
description: "Conflict (e.g., duplicate)"

sideEffects:

- Creates Organization record in DB
- Updates Stripe customer

tests:
unit: - description: "Happy path returns 200"
expect: "Response contains expected data" - description: "Missing required field returns 400"
expect: "Error message indicates missing field" - description: "Duplicate resource returns 409"
expect: "Conflict error returned"

documentation:
onCompletion: - Update /features/1_signup_trial/story_features.md # Format: filename + method name + short description - If final story in group: Update /features/story_global.md # Format: /api/route at highest level only

filesAllowed: # strict whitelist for this story

- /features/1_signup_trial/1.1_org_create/\*\*
- /features/1_signup_trial/story_features.md # Read for references, update on completion
- /features/scaffold/story_global.md # Read for cross-story references
- /lib/scaffold/\*\*
- /prisma/schema.prisma # Use existing structure. If not possible, APPEND ONLY - no deletions or modifications
- /.env

notes:

- Additional context or constraints
- Dependencies on external services

Write unit tests that genuinely verify the code’s logic, not just assertions designed to pass or fake cases to appear successful. I’d rather the tests fail honestly so I can identify the real problems.

Let's create a short text file called story_feature.md. scaffold is the untility functions that the application cna use. So each story has an API and each API is independent and it can use the scaffold utility. So read the files until the /lib/scaffold folder and create a tiny \_class_map.md file which lists function name and what it does in short description. Remember that I only want a reference so that AI can look it up for detail. I do not want details in the map file. It will be too large for AI. So
remember to keep it short. filename, method name and what it does.

---

## Story Code Verification Prompt

**Purpose:** Verify the implementation of Story X.Y is correct before moving forward.

**Instructions:** Analyze ALL code generated for this story and verify compliance:

### 1. Duplicate API Check

- Check `/docs/api_lookup.md` for existing similar routes
- Verify new route doesn't duplicate existing functionality
- If overlap exists, use existing route or justify new one
- **Report:** Any duplicate or redundant routes

### 2. Third-Party SDK Verification

For each third-party service used:

- Search official 2025 documentation online
- Verify correct official package installed in package.json
- Check implementation uses official SDK (NOT custom REST/HTTP clients)
- Verify environment variable names match official conventions
- Compare initialization pattern against official examples
- **Report:** ✅ Correct | ⚠️ Non-standard | ❌ Wrong approach

### 2. Database & Prisma Compliance

- Uses existing Prisma models only (no unauthorized schema changes)
- Multi-step DB operations wrapped in `withTx(async (tx) => {...})`
- Queries use proper indexes and field names
- **Report:** Any schema changes or transaction issues

### 3. Scaffold Pattern Compliance

- Responses use `wrapSuccess(data, undefined, correlationId)` / `wrapError(error, correlationId)`
- Uses `getEnv()` → `createContainer(env)` → `createRequestContext(headers)` pattern
- Structured logging via `logger.info/warn/error({...})`
- Correlation IDs propagated in all responses
- **Report:** Any pattern violations

### 4. Error Handling

- Uses `ApiError(ErrorCode.XXX, message, httpStatus)` from scaffold
- HTTP status codes match design spec (200/400/404/409/500)
- Error messages match design spec descriptions
- **Report:** Incorrect error codes or missing error cases

### 5. Security & Auth

- Auth checks present where required (`const { userId } = await auth()`)
- No API keys, secrets, or PII in log statements
- Input validation for all required fields
- **Report:** Security concerns or missing validation

### 6. Environment Variables

- All new env vars documented in story design spec
- Config accessed via `getEnv()` not direct `process.env`
- Proper defaults/fallbacks where specified
- **Report:** Undocumented or incorrectly accessed env vars

### 7. Test Quality

- Tests verify actual logic (not mocked-to-pass)
- Cover both happy path AND error cases
- Use real assertions with expected values
- Integration tests hit real API routes
- **Report:** Weak tests or missing coverage

### Output Format:

```
## Story X.Y Verification Results

✅ PASSED:
- [List correct implementations]

⚠️ WARNINGS:
- [List non-critical issues]

❌ CRITICAL ISSUES:
- [List must-fix problems with specific fixes]

## Recommended Actions:
1. [Specific fix with file:line references]
2. [...]
```

**Run this verification BEFORE considering story complete.**

---

## Test Quality Verification Prompt

**Purpose:** Verify tests for Story X.Y are meaningful and will catch real bugs.

**Instructions:** Analyze ALL tests and verify quality:

### 1. Test Coverage

- Happy path tested for main functionality
- Error cases tested (400, 404, 409, 500)
- Edge cases tested (empty strings, null, invalid formats)
- **Report:** Missing test scenarios

### 2. Real Assertions

- Tests use actual expected values (not just `expect(result).toBeDefined()`)
- Status codes verified explicitly
- Response body structure and values checked
- Error messages validated
- **Report:** Weak or meaningless assertions

### 3. No Mock-to-Pass

- Tests don't mock the function being tested
- External dependencies mocked appropriately (Stripe, Stigg, etc.)
- Database operations use real Prisma (or test transactions)
- **Report:** Over-mocked or fake tests

### 4. Integration Test Quality

- Actually calls API routes (not just handler functions)
- Uses proper HTTP methods and headers
- Tests full request/response cycle
- Database state verified after operations
- **Report:** Tests that bypass real integration

### 5. Test Independence

- Tests don't depend on execution order
- Each test sets up own data
- Cleanup after tests (or uses transactions)
- **Report:** Brittle or order-dependent tests

### 6. Error Case Coverage

For each error response in design spec:

- Test that triggers it exists
- Correct status code verified
- Error code/message validated
- **Report:** Missing error case tests

### 7. Data Realism

- Test data matches production constraints
- IDs use correct formats (cuid, Clerk IDs, Stripe IDs)
- Dates/timestamps handled correctly
- **Report:** Unrealistic test data

### Output Format:

```
## Story X.Y Test Verification Results

✅ GOOD TESTS:
- [List well-written tests]

⚠️ WEAK TESTS:
- [Tests that need improvement]

❌ BAD TESTS:
- [Tests that don't actually test anything]

## Missing Coverage:
- [Scenarios not tested]

## Recommended Fixes:
1. [Specific test improvement with file:line]
2. [...]
```

**Run this AFTER writing tests, before marking story complete.**

---

## Security & Performance Audit Prompt

**Purpose:** Final check before deploying Story X.Y to production.

**Instructions:** Analyze implementation for security and performance issues:

### 1. Authentication & Authorization

- Protected routes have `await auth()` check
- User can only access their own org data
- Admin-only operations properly gated
- **Report:** Missing auth checks or authorization bypasses

### 2. Secrets & Sensitive Data

- No API keys, tokens, or secrets in log statements
- No passwords or PII logged
- Env vars used for all sensitive config
- **Report:** Any leaked secrets in logs/responses

### 3. Input Validation

- All user inputs validated (type, format, length)
- SQL injection prevented (using Prisma parameterized queries)
- No eval() or unsafe dynamic code execution
- **Report:** Unvalidated inputs or injection risks

### 4. Database Performance

- N+1 query patterns identified
- Missing indexes for queries in route
- Unnecessary data fetched (select only needed fields)
- Large datasets paginated
- **Report:** Performance bottlenecks with specific queries

### 5. Rate Limiting & DoS

- Expensive operations identified
- Potential for resource exhaustion
- Infinite loops or unbounded recursion possible
- **Report:** DoS vectors

### 6. Error Information Disclosure

- Stack traces not exposed to clients
- Database errors sanitized
- Internal paths/structure not leaked
- **Report:** Information disclosure in errors

### Output Format:

```
## Story X.Y Security & Performance Audit

🔒 SECURITY ISSUES:
- [Critical security problems with file:line]

⚡ PERFORMANCE ISSUES:
- [Bottlenecks with specific fixes]

✅ PASSED:
- [Security/performance practices done correctly]

## Required Fixes:
1. [Priority fix with details]
2. [...]
```

**Run before marking story production-ready.**

---

**Prompt: Maintain Doc-Shards**

When a feature, route, or logic changes, update the relevant doc-shards before marking the story “Done.”
Keep each shard under 200 lines and optimized for `@` context injection.

1. `/docs/API_INDEX.md` – keep a one-screen list of all routes with 1-line purpose and link to its `/spec/api/*.yml`.
2. `/spec/api/*.yml` – one file per route, OpenAPI mini-spec defining request, response, and error schema.
3. `/docs/EVENTS.md` – document all webhooks and jobs (event source, idempotency, retries, handler path).
4. `/docs/ERRORS.md` – list standard error envelopes and JSON formats used by all endpoints.
5. `/docs/IDEMPOTENCY.md` – record dedupe keys, retention windows, and transactional guarantees for write paths and webhooks.
6. `/docs/SCHEMA_MAP.md` – short human ER sketch of tables, relations, and key fields (Prisma remains source of truth).
7. `/lib/config/plans.ts` (**`PLANS_CONFIG`**) – authoritative plan codes, Stripe price IDs, included quotas, and trial settings.
8. `/docs/QUOTA_RULES.md` – define real-time quota enforcement logic, inputs, return fields, and SLO (p95 ≤ 50 ms).
9. `/docs/CHANGELOG.md` – running summary; 1–3 lines per meaningful change noting date, story, and shard(s) updated.

Always touch the shards affected by a change:

- new or modified route → update API_INDEX + spec
- new webhook/job → update EVENTS
- new error or envelope → update ERRORS
- new dedupe rule → update IDEMPOTENCY
- schema change → update SCHEMA_MAP
- plan/pricing change → update PLANS_CONFIG
- quota or perf rule change → update QUOTA_RULES
- any behavior change → append CHANGELOG entry

Keep each shard concise, plain-text, and self-contained so Cursor’s `@` lookups remain fast and context-rot-resistant.
