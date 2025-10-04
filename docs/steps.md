
# Use Cases — Metered Subscriptions Platform (Lean v1 · JS · Stripe-only)

### UC-01 · Sign-Up → Trial Activation

* **Goal:** create org + trial entitlement; set initial quota.
* **Trigger/Route:** `POST /api/signup`
* **Steps:** validate `{orgName,email}` → mint `orgId` (stub for now) → Stripe **upsert customer** (by `orgId`) → **create subscription** on `starter` price with trial (or return **Checkout Session URL**); seed `UsageCounter(0)`.
* **Acceptance:** 200 + `wrapSuccess({ orgId, planCode:'starter', trialEndsAt, checkoutUrl? })`; S0.5: dry-run.

---

### UC-02 · Get My Entitlements (read-only)

* **Goal:** show current plan & counters.
* **Trigger/Route:** `GET /api/me/entitlements`
* **Steps:** `requireAuth()` → read `Entitlement` + `UsageCounter` (DB) → return `{ planCode, includedUnits, used, remaining, periodKey }`.
* **Acceptance:** 200; no external calls; stable envelope.

---

### UC-03 · Record Usage (single event, idempotent)

* **Goal:** ingest one API call.
* **Trigger/Route:** `POST /api/v1/usage`
* **Steps:** auth → validate `{ orgId, metric:'api_call', value, occurredAt, request_id }` → `assertIdempotent` → append `UsageEvent` → `INCRBY` Redis → refresh `UsageCounter`.
* **Acceptance:** duplicate `request_id` returns identical body; 400 on invalid; 200 includes `{ periodKey, used, remaining }`.

---

### UC-04 · Real-Time Quota Check

* **Goal:** fast allow/deny.
* **Trigger/Route:** `POST /api/quota/check`
* **Steps:** validate `{ orgId, metric:'api_call' }` → `checkQuota(orgId)` (Redis fast path → DB fallback) → allow/deny.
* **Acceptance:** `200 { allow:true, remaining }` or `402/429 { allow:false, remaining:0 }`; p95 quota ≤50 ms (stubbed timer OK in S0.5).

---

### UC-05 · Hard Stop at 0 (standard denial)

* **Goal:** consistent error payload/headers when over quota.
* **Trigger:** invoked by middleware after UC-04 denial.
* **Steps:** `wrapError(ApiError('RATE_LIMITED','Quota exceeded',429))` + `Retry-After: <start-of-next-period>` + echo `correlationId`.
* **Acceptance:** envelope present; headers set.

---

### UC-06 · Plan Preview (proration)

* **Goal:** preview cost before change.
* **Trigger/Route:** `POST /api/plans/preview`
* **Steps:** validate `{ orgId, planCode, proration? }` → **S0.5:** deterministic stub → **Later:** Stripe “upcoming invoice” preview.
* **Acceptance:** 200 `{ amount, currency, proration, items[] }`; no state writes.

---

### UC-07 · Upgrade Now (immediate + proration)

* **Goal:** switch plan right away.
* **Trigger/Route:** `POST /api/plans/upgrade`
* **Steps:** validate `{ orgId, newPlanCode }` → Stripe **update subscription** (prorate now) → update `Entitlement` (planCode/includedUnits) → keep counters.
* **Acceptance:** idempotent; 200 `{ planCode:newPlanCode }`.

---

### UC-08 · Downgrade (schedule EoP)

* **Goal:** schedule downgrade at period end.
* **Trigger/Route:** `POST /api/plans/downgrade`
* **Steps:** validate → Stripe **schedule** plan change at current period end → set `Entitlement.scheduledChange`.
* **Acceptance:** 200 `{ effectiveAt, newPlanCode }`; cancel/rewrite safe if re-called.

---

### UC-09 · List Invoices

* **Goal:** show invoices & payment status.
* **Trigger/Route:** `GET /api/invoices?cursor=&limit=`
* **Steps:** Stripe list by `customer` (mapped from `orgId`) → map to `{ id, amount, currency, status, url, created }`.
* **Acceptance:** 200; cursor passthrough; S0.5: dry-run.

---

### UC-10 · Attach Payment Method (SetupIntent)

* **Goal:** store a card.
* **Trigger/Route:** `POST /api/payments/setup`
* **Steps:** ensure Stripe customer → create **SetupIntent** → return `{ clientSecret }`.
* **Acceptance:** 200; secrets not logged (redaction test); S0.5: fake secret.

---

### UC-11 · Create Portal Session

* **Goal:** send user to Stripe Customer Portal.
* **Trigger/Route:** `POST /api/payments/portal`
* **Steps:** Stripe **billing portal session** for `customer` → return `{ url }`.
* **Acceptance:** 200; S0.5: dry-run URL.

---

### UC-12 · Webhook Intake (Stripe)

* **Goal:** receive provider events.
* **Trigger/Route:** `POST /api/webhooks/stripe`
* **Steps:** accept JSON (no verify in S0.5) → `enqueue({ type:'stripe', id, receivedAt, payload, correlationId })` → `202`.
* **Acceptance:** 202; captured job object; no processing yet.

---

### UC-13 · Webhook Processor (idempotent converge)

* **Goal:** mutate state from events safely.
* **Trigger:** worker/job run.
* **Steps:** verify signature (later) → idempotency on `event.id` → handle `checkout.session.completed`, `customer.updated`, `invoice.{paid,finalized}`, `customer.subscription.{created,updated,deleted}` → upsert `Entitlement`, `InvoiceRef`, audit.
* **Acceptance:** re-processing same event no-ops; state converges ≤5 s.

---

### UC-14 · Admin: Quota Reset (period rollover)

* **Goal:** recompute counters at new period.
* **Trigger/Route:** `POST /api/admin/quotas/reset`
* **Steps:** for active orgs → compute next `includedUnits` from `Entitlement` → write `UsageCounter(used=0, remaining=included)` → seed Redis.
* **Acceptance:** 200 `{ updated:n, periodKey }`; S0.5: dry-run OK.

---

### UC-15 · Observability Sanity (smoke)

* **Goal:** prove logs/metrics wiring.
* **Trigger/Route:** `GET /api/diag/smoke`
* **Steps:** start timer → tiny calc → stop timer → increment counter → return `{ ok:true }`.
* **Acceptance:** JSON log includes `service,version,request_id,correlation_id,tenant_id`; no PII.

---

### UC-16 · Admin: Webhook Replay

* **Goal:** deterministic replay of stuck events.
* **Trigger/Route:** `POST /api/admin/webhooks/replay` `{ eventIds:[] }`
* **Steps:** RBAC guard → enqueue each idempotently with new `correlationId`.
* **Acceptance:** 200 `{ enqueued:n }`; safe to call repeatedly.

---

### UC-17 · Token Activation Lifecycle (client plugin)

* **Goal:** secure short-lived tokens, no static keys.
* **Trigger/Routes:**

  * `POST /api/tokens/activate` `{ activationCode }` → issues short-lived org-scoped access + refresh (domain-bound).
  * `POST /api/tokens/refresh` → rotate access; fail → re-activation.
* **Steps:** validate code → mint JWT (scopes: `usage:write entitlements:read`) → store hashed refresh ref; audit.
* **Acceptance:** activation expires quickly; refresh before expiry; logs redact tokens.

---

## Shared Contract Bits (apply to all UCs)

* **Headers (auto if missing):** `x-request-id`, `x-correlation-id`, `<tenant header>` from `env.tenantHeader` (e.g., `x-tenant-id`).
* **Envelope:** `wrapSuccess(data, meta?)` · `wrapError(new ApiError(code, message, status))`.
* **Per-request context:**

  ```js
  const { env, logger, call_state, clients } = container.ctx(request.headers);
  ```
* **S0.5 testing pointers:** no network; client stubs echo; snapshot envelope shapes; redaction tests; idempotency (`request_id`) returns identical bodies.

