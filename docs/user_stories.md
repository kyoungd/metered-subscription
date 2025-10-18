## UC-01 · Sign-Up → Trial Activation (Lago: customer+subscription)

**Goal:** create org + trial entitlement; set initial quota.
**Actors:** Anonymous → Authenticated user (Clerk), System (Lago).
**Preconditions:** S0 scaffold loaded; S0.5 clients present; user authenticated.
**Trigger:** `POST /api/signup`
**Happy Path:**

1. Validate payload `{ orgName, email }`.
2. Create Organization in DB (later step; for now return stub `orgId`).
3. `clients.lago.customers.upsert({ externalId: orgId, email })`.
4. `clients.lago.subscriptions.activate({ externalId: orgId, planCode:"starter", startAt: utcNow() })`.
5. Return `wrapSuccess({ orgId, planCode:"starter", trialEndsAt })`.
   **Edge Cases:** duplicate email/org; Lago transient failure → throw `ApiError(INTERNAL)`.
   **Headers:** requires `x-request-id`, `x-correlation-id` (auto if missing).
   **Acceptance:** returns 200; envelope has `correlationId`; no real network (dry-run).
   **Files:** `app/api/signup/route.js` (≤200 LOC), tests.

---

## UC-02 · Get My Entitlements (read-only)

**Goal:** show current plan & counters.
**Trigger:** `GET /api/me/entitlements`
**Path:**

1. `requireAuth()`; read `orgId` from token.
2. Summarize from DB (stubbed) + `clients.openMeter.usage.getCounter({ subject: orgId, metric:'api_call', periodKey })`.
3. Return `{ planCode, includedUnits, used, remaining }`.
   **Acceptance:** 200; no DB writes; envelope present.

---

## UC-03 · Record Usage (single event, idempotent)

**Goal:** ingest one API call.
**Trigger:** `POST /api/v1/usage` with `{ orgId, metric:'api_call', value:1, occurredAt, request_id? }`
**Path:**

1. `requireAuth()`; validate; `assertIdempotent(request_id, 'usage', effectFn)`.
2. `clients.openMeter.usage.record({ subject: orgId, metric, value, occurredAt })`.
3. Update snapshot (stub) and return `{ periodKey, used, remaining }`.
   **Acceptance:** duplicate `request_id` returns same content; 400 on invalid body.

---

## UC-04 · Real-Time Quota Check (edge pre-check)

**Goal:** confirm a request can proceed.
**Trigger:** `POST /api/quota/check` with `{ orgId, metric:'api_call' }`
**Path:**

1. `clients.kong.quota.check({ subject: orgId, metric })`.
2. If `allow`, return `{ allow:true, remaining }`, else `{ allow:false, remaining:0 }` and HTTP 402/429.
   **Acceptance:** deterministic dry-run; proper status code mapping.

---

## UC-05 · Hard Stop at 0 (enforcement response)

**Goal:** standardized denial payload & headers when over quota.
**Trigger:** invoked by Kong or middleware after UC-04 denial.
**Path:**

1. Return `wrapError(ApiError('RATE_LIMITED', 'Quota exceeded', 429))` with `Retry-After` header = start of next period.
   **Acceptance:** envelope present; `correlationId` echoed; headers set.

---

## UC-06 · Plan Preview (price & trial calc)

**Goal:** preview cost before change.
**Trigger:** `POST /api/plans/preview` `{ orgId, planCode, startAt?, proration:true }`
**Path:**

1. `clients.lago.plans.preview({ planCode, from:utcNow(), to:endOfPeriod })`.
2. Return `{ preview.amount, currency, proration }`.
   **Acceptance:** stable shape; no state mutations.

---

## UC-07 · Upgrade Now (prorated)

**Goal:** switch plan immediately with proration.
**Trigger:** `POST /api/plans/upgrade` `{ orgId, newPlanCode }`
**Path:**

1. Validate; `clients.lago.subscriptions.activate({ externalId: orgId, planCode:newPlanCode, startAt: utcNow() })`.
2. Optionally `clients.kong.quota.set({ subject: orgId, metric:'api_call', limit: includedUnits })`.
3. Return `{ planCode:newPlanCode }`.
   **Acceptance:** 200; idempotent if repeated (same outcome).

---

## UC-08 · List Invoices (Lago → Stripe)

**Goal:** show invoices & payment status in portal.
**Trigger:** `GET /api/invoices`
**Path:**

1. `clients.lago.invoices.list({ externalId: orgId, limit, cursor })`.
2. Map to `{ id, amount, status, url }` and return.
   **Acceptance:** pagination cursor passthrough; stable envelope.

---

## UC-09 · Attach Payment Method (Stripe)

**Goal:** store a card for a customer.
**Trigger:** `POST /api/payments/setup` `{ orgId }`
**Path:**

1. `clients.stripe.customers.createOrAttach({ externalId: orgId })`.
2. `clients.stripe.payments.createSetupIntent({ externalId: orgId })`.
3. Return `{ clientSecret }` (fake in dry-run).
   **Acceptance:** no secrets logged; redaction verified in test.

---

## UC-10 · Webhook Intake (Skeletons only)

**Goal:** receive provider webhooks (idempotent, verified later).
**Trigger:** `POST /api/webhooks/{lago|stripe|openmeter}`
**Path:**

1. Accept JSON, push to `enqueue({ type, payload, receivedAt, correlationId })`.
2. Return `202` immediately.
   **Acceptance:** job object enqueued; no processing yet.

---

## UC-11 · Admin: Quota Reset (period rollover)

**Goal:** admin tool to recompute & set Kong quota counters.
**Trigger:** `POST /api/admin/quotas/reset` `{ periodKey? }`
**Path:**

1. For each active org (stub list), compute next period limit.
2. `clients.kong.quota.set({ subject: orgId, metric:'api_call', limit })`.
3. Return a small report `{ updated: n }`.
   **Acceptance:** dry-run only; no network.

---

## UC-12 · Observability Sanity (log & metrics smoke)

**Goal:** emit a structured log and timer around a trivial operation.
**Trigger:** `GET /api/diag/smoke`
**Path:**

1. `const stop = timer.start('diag_smoke')`; log `{ event:'smoke_start' }`.
2. Do a tiny calc; stop timer; `counter('diag_smoke.count', 1)`.
3. Return `{ ok:true }`.
   **Acceptance:** JSON log includes `service,version,request_id,correlation_id,tenant_id`; no PII.

---

## Shared Contract Bits (use in all UCs)

**Request headers (read by DI):**

- `x-request-id` (UUIDv4 if missing)
- `x-correlation-id` (UUIDv4 if missing)
- `<tenant header>` from `env.tenantHeader` (e.g., `x-tenant-id`)

**Envelope:**

```js
wrapSuccess({ ... }, { ...meta });
wrapError(new ApiError('BAD_REQUEST','message',400));
```

**Per-request context (from DI):**

```js
const { env, logger, call_state, clients } = container.ctx(request.headers);
```

---

## Testing Pointers (per UC)

- **No network** in S0.5: assert `clients.http` returns **dry-run echoes**.
- Snapshot test **envelope shapes** (stable JSON).
- Assert **redaction**: logs don’t contain `email`, `password`, `token`, etc.
- For idempotency UCs, call twice with same `request_id` and deep-equal the responses.

---

## Turn any UC into a 1-shot AI prompt

Use this minimal template:

```
You are ChatGPT-Coder. Implement **UC-0X <name>** in Next.js (JS only).

Read-first: use `/lib/scaffold/*` utils & `clients/*`. Do NOT rewrite utilities.
Constraints: ≤300 LOC total across new/changed files. No network I/O; clients run in dry-run.

Goal:
<copy the “Goal” lines>

Route:
<HTTP method + path>

Inputs:
<body schema / params / headers>

Behavior:
<numbered steps from Happy Path>

Errors:
<list ApiError codes + status>

Acceptance:
<numbered, testable points>

Files:
<list 1–3 files max, with exact paths>
```
