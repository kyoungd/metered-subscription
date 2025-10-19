Great—here’s your doc augmented with concise **Overview** blurbs for every big story and each sub-story.

---

<!-- ## Architecture: Hybrid Usage Tracking Strategy -->

**Stigg Role:**

* Plan/subscription metadata sync
* Upgrade/downgrade logic and proration (Story 5)
* Complex entitlement rules (future)

**Our DB Role:**

* Real-time usage tracking (UsageCounter table)
* Fast quota enforcement (Story 4.1) - no external API latency
* Usage recording (Story 4.2)
* Entitlements display (Story 3.1)

**Rationale:**

* Stigg provisioning ensures subscription data is available for plan management
* Local DB usage tracking provides sub-millisecond quota checks on every API request
* Hybrid approach balances speed (critical for quota checks) with convenience (plan change logic)

---

# Design Conventions (lean)

* **orgId = Clerk org ID** (`org_...`) across APIs; backend maps to internal DB IDs.
* **Plan codes are canonical** (`trial|starter|growth|pro`) → map to **Stripe price IDs** via `PLANS_CONFIG` (single source of truth).
* **Trials owned by Stripe** (Checkout/Price); **Stigg mirrors** trial state from Stripe—no separate Stigg trial config.
* **Period key is server-derived** from Stripe billing period: `periodKey = YYYY-MM`; frontend never generates it.
* **Sync order on plan changes:** **Stripe → DB → Stigg** (Stripe is source of truth).
* **Usage/quota source of truth:** local DB (`UsageCounter`); Stigg not consulted on hot path.

---

## Use Case Stores

## 1) Sign-Up → Trial (Big Story)

**Overview:** Establish a new organization, connect it to Stripe, start a trial subscription, mirror state into Stigg, and seed usage counters so the tenant can immediately use the API under trial limits.

1.1) **Create Org**
*Overview:* Create a tenant identity anchored to Clerk; return `orgId` as the primary handle for all downstream operations.
**POST** `/api/orgs.create` → creates `{orgId,name,ownerUserId}`
**Acceptance:** 200 `{orgId}`

1.2) **Ensure Stripe Customer**
*Overview:* Look up or create the Stripe Customer for this org to enable billing, trials, invoices, and portal access.
**POST** `/api/stripe/customer.ensure` `{orgId,email}` → returns/creates `customerId`
**Acceptance:** 200 `{stripeCustomerId}` (idempotent)

1.3) **Create Trial Subscription**
*Overview:* Start a trialing subscription using the selected price; Stripe becomes the source of truth for status and period boundaries.
**POST** `/api/stripe/subscription.create` `{orgId, priceLookup:'plan_starter_m'}`
**Acceptance:** 200 `{subscriptionId,status:'trialing',trialEndsAt}`

1.4) **Provision in Stigg**
*Overview:* Mirror plan/subscription metadata into Stigg for plan logic and proration previews; no hot-path dependency.
**POST** `/api/stigg/provision` `{orgId, stripeCustomerId, stripeSubscriptionId, planCode}`
**Acceptance:** 200 `{provisioned:true}`

1.5) **Seed Usage Counter**
*Overview:* Initialize the `UsageCounter` for the current `periodKey` so quota checks answer instantly from DB.
**POST** `/api/usage/seed` `{orgId, periodKey}`
**Acceptance:** 200 `{used:0, remaining:included, periodKey}`

---

## 2) Trial → Paid Conversion (Big Story)

**Overview:** Collect and set a default payment method, then react to Stripe webhooks to converge internal state to the authoritative billing events.

2.1) **Create SetupIntent**
*Overview:* Generate a client secret to securely collect and attach a payment method on the client.
**POST** `/api/payments/setup-intent.create` `{orgId}`
**Acceptance:** 200 `{clientSecret}`

2.2) **Attach & Set Default PM**
*Overview:* Attach the collected payment method to the customer and make it the default for invoices/renewals.
**POST** `/api/payments/default-method.set` `{orgId, paymentMethodId}`
**Acceptance:** 200 `{ok:true}`

2.3) **Stripe Webhook Intake** *(background trigger)*
*Overview:* Authentically ingest Stripe events exactly once and enqueue them for processing.
**POST** `/api/webhooks/stripe.receive` raw body
**Acceptance:** 202 `{queued:true,eventId}` (idempotent on `event.id`)

2.4) **Stripe Webhook Processor** *(background job)*
*Overview:* Apply event effects to DB (status, periods, cancellations) to keep local truth aligned with Stripe.
**POST** `/api/jobs/stripe.process` `{eventId}`
**Acceptance:** 200 `{converged:true}` (DB mirrors Stripe `active|canceled`)

---

## 3) Entitlements (Big Story)

**Overview:** Present the tenant’s current plan, quota, and consumption from local DB for dashboards and gating.

3.1) **Get My Entitlements**
*Overview:* Return plan code, included units, used, remaining, and current `periodKey` from DB.
**GET** `/api/me/entitlements.read`
**Acceptance:** 200 `{planCode,included,used,remaining,periodKey}`

---

## 4) Usage & Quota (Big Story)

**Overview:** Enforce quotas in real time with sub-millisecond checks and idempotent usage recording.

4.1) **Real-Time Quota Check**
*Overview:* Hot-path read from `UsageCounter` to allow/deny a request without external calls.
**POST** `/api/quota/check` `{orgId, metric:'api_call'}`
**Acceptance:** 200 `{allow:true,remaining}` or 429 `{allow:false,remaining:0}`

4.2) **Record Usage (Idempotent)**
*Overview:* Persist usage with `request_id` idempotency; roll up into the active `periodKey`.
**POST** `/api/usage/record` `{orgId, metric, value, occurredAt, request_id}`
**Acceptance:** 200 `{periodKey,used,remaining}`; duplicate `request_id` → identical body

4.3) **Standard Denial Envelope**
*Overview:* Provide a consistent 429 response with retry guidance for clients and middleware.
**POST** `/api/quota/deny-envelope.example`
**Acceptance:** 429 with standard JSON + `Retry-After`

---

## 5) Plan Changes (Big Story)

**Overview:** Preview costs and switch plans with Stripe as the authority; mirror to DB and Stigg in order.

5.1) **Preview Plan Change (Proration)**
*Overview:* Ask Stripe/Stigg for a cost preview so the UI can show exact upgrade/downgrade impact.
**POST** `/api/plans/preview` `{orgId,newPlanCode}`
**Acceptance:** 200 `{amount,currency,proration,items[]}`

5.2) **Upgrade Now (Immediate)**
*Overview:* Execute an immediate plan change; update local plan code and re-seed counters if needed.
**POST** `/api/plans/upgrade.now` `{orgId,newPlanCode}`
**Acceptance:** 200 `{planCode:newPlanCode,effective:'immediate'}`

5.3) **Downgrade at Period End**
*Overview:* Schedule a change at renewal; store pending plan to apply on next cycle.
**POST** `/api/plans/downgrade.schedule` `{orgId,newPlanCode}`
**Acceptance:** 200 `{effectiveAt, pendingPlanCode:newPlanCode}`

---

## 6) Billing Self-Service (Big Story)

**Overview:** Let tenants manage billing artifacts (invoices, payment methods, subscriptions) via Stripe-hosted flows.

6.1) **List Invoices**
*Overview:* Surface recent invoices for transparency and one-click viewing in Stripe.
**GET** `/api/invoices.list?cursor=&limit=`
**Acceptance:** 200 `[{id,total,currency,status,url,created}]`

6.2) **Create Customer Portal Session**
*Overview:* Hand off to Stripe’s portal with a short-lived session URL scoped to the customer.
**POST** `/api/payments/portal.create` `{orgId}`
**Acceptance:** 200 `{url}`

---

## 7) Period Rollover (Big Story)

**Overview:** Reset per-period counters on schedule and during admin recovery scenarios.

7.1) **Quota Reset (Admin/Auto)**
*Overview:* Rotate `periodKey`, reset counters, and ensure new period baselines are consistent.
**POST** `/api/admin/quotas.reset` `{periodKey}`
**Acceptance:** 200 `{updated:n, periodKey}`

---

## 8) Webhook Operations (Big Story)

**Overview:** Operate a safe replay path for missed/failed webhooks without duplication.

8.1) **Webhook Replay (Admin)**
*Overview:* Requeue specific `eventIds` for deterministic reprocessing with idempotency.
**POST** `/api/admin/webhooks.replay` `{eventIds:[]}`
**Acceptance:** 200 `{enqueued:n}`

---

## 9) Observability (Big Story)

**Overview:** Provide a minimal but reliable health endpoint and structured diagnostic logging.

9.1) **Smoke Diagnostics**
*Overview:* Validate core dependencies (DB/Redis/env) and emit a standardized diagnostic log.
**GET** `/api/diag/smoke`
**Acceptance:** 200 `{ok:true}` and emits structured log

---

### Notes (scope guards)

* Each function above is a **separate endpoint or background job**.
* Bigger stories (1, 2, 4, 5) are broken into **independent, callable units** to align with your AI-coding workflow.

---

## Stack

**Next.js, TypeScript, Tailwind, shadcn/ui, Clerk, Prisma, PostgreSQL, Stripe, Redis, Node 22.13.1, Sentry, Stigg**
