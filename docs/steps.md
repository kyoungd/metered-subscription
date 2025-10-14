## Architecture: Hybrid Usage Tracking Strategy

**Stigg Role:**
- Plan/subscription metadata sync
- Upgrade/downgrade logic and proration (Story 5)
- Complex entitlement rules (future)

**Our DB Role:**
- Real-time usage tracking (UsageCounter table)
- Fast quota enforcement (Story 4.1) - no external API latency
- Usage recording (Story 4.2)
- Entitlements display (Story 3.1)

**Rationale:**
- Stigg provisioning ensures subscription data is available for plan management
- Local DB usage tracking provides sub-millisecond quota checks on every API request
- Hybrid approach balances speed (critical for quota checks) with convenience (plan change logic)

---

## Design Conventions

### 1. ID Types & Usage

**orgId (in API parameters):**
- **Type:** Clerk organization ID (format: `org_xxxxx`)
- **Source:** Returned by Story 1.1 `/api/orgs/create`
- **Usage:** Used across all Stories 1.2-1.5, 2.x, 4.x, 5.x as primary org identifier
- **Rationale:** Clerk org ID is stable across both Clerk and our DB

**Database IDs (internal):**
- `Organization.id` - Database cuid (internal use only)
- `Organization.clerkOrgId` - Clerk org ID (indexed, used for lookups)
- `User.id` - Database cuid (internal use only)
- `User.clerkId` - Clerk user ID (indexed, used for auth)
- `Subscription.id` - Database cuid (internal use only)
- `Subscription.clerkOrgId` - Foreign key to organization (indexed)

**Convention:** API endpoints accept/return `clerkOrgId` as `orgId` for external consistency

---

### 2. Plan Code Mapping & Trial Management

**Plan Codes (in PLANS_CONFIG):**
```
trial    → Stripe price: price_1SF55833pr8E7tWLycMY8XKB   (30 api_calls, 14 day trial)
starter  → Stripe price: price_1SF55w33pr8E7tWLQJNWOvxd   (60 api_calls/month)
growth   → Stripe price: price_1SF56S33pr8E7tWLslF4FKKW   (300 api_calls/month)
pro      → Stripe price: price_1SF56w33pr8E7tWLzL6eOFPW   (1500 api_calls/month)
```

**Story 1.3 `priceLookup` parameter:**
- **Accepts:** Plan code (e.g., `'starter'`, `'growth'`, `'pro'`)
- **Backend:** Looks up corresponding Stripe price ID from PLANS_CONFIG
- **Default:** `'trial'` for initial sign-up (hardcoded in onboarding flow)
- **Future:** User selects plan during onboarding; trial is default

**Trial Management (IMPORTANT):**
- **Stripe owns trials:** Trial period configured in Stripe Checkout or on the Price object
- **Stigg trial = OFF:** Stigg plans do NOT have separate trial configuration
- **Sync mechanism:** Stigg reflects `trial_end` from Stripe via Stripe sync integration
- **Source of truth:** Stripe subscription status (`trialing` → `active`) controls trial state
- **Stigg Plan IDs:** Use same plan codes (`'trial'`, `'starter'`, etc.) for consistency

---

### 3. Period Key & Billing Cycles

**periodKey Format:** `YYYY-MM` (e.g., `'2025-01'`)

**Period Alignment:**
- **Usage periods** match Stripe subscription billing periods
- Story 1.5 seeds `periodKey` based on subscription's `currentPeriodStart`
- `UsageCounter.periodStart` = subscription's `currentPeriodStart`
- `UsageCounter.periodEnd` = subscription's `currentPeriodEnd`

**Period Generation:**
- Backend calculates from subscription billing period
- Frontend never generates periodKey
- Story 7.1 resets quota at period rollover (triggered by Stripe webhook or cron)

**Example:**
```
Subscription starts: 2025-01-15
periodKey: '2025-01'
periodStart: 2025-01-15T00:00:00Z
periodEnd: 2025-02-15T00:00:00Z
```

---

### 4. Webhook Architecture (Story 2.3 & 2.4)

**Story 2.3 - Webhook Intake:**
- **Endpoint:** `POST /api/webhooks/stripe.receive`
- **Action:** Validates webhook signature, logs to `DebugLog`, returns 202 immediately
- **Queue:** Writes event to database table `WebhookQueue` (not yet implemented in Story 1)
- **Idempotency:** Checks `event.id` to prevent duplicate processing

**Story 2.4 - Webhook Processor:**
- **Trigger:** Background job (cron every 1 minute) or manual admin call
- **Endpoint:** `POST /api/jobs/stripe.process` (admin-only)
- **Action:** Processes queued webhooks, syncs Stripe state to DB
- **Convergence:** Ensures DB status matches Stripe (`active`, `canceled`, `past_due`)

**Queue System:** Database-backed (simple polling), no Redis required for MVP

---

### 5. Plan Change Flow (Story 5) - Stripe ↔ Stigg ↔ DB Sync

**Story 5.1 - Preview Plan Change:**
- **Calls:** Stripe API `subscriptions.retrieveUpcomingInvoice()` for proration preview
- **Does NOT call:** Stigg (read-only operation)

**Story 5.2 - Upgrade Now (Immediate):**
1. **Stripe:** Call `subscriptions.update()` with new price, `proration_behavior: 'always_invoice'`
2. **DB:** Update `Subscription` record with new `planCode`, `stripePriceId`
3. **Stigg:** Call Stigg API to update subscription plan (sync metadata)
4. **UsageCounter:** Adjust limits based on new plan (Story 4.2 handles this)

**Story 5.3 - Downgrade at Period End:**
1. **Stripe:** Call `subscriptions.update()` with `proration_behavior: 'none'`, effective at period end
2. **DB:** Mark `Subscription.pendingPlanCode` (future field, not yet in schema)
3. **Stigg:** Schedule plan change via Stigg API
4. **Webhook:** Story 2.4 applies change when Stripe webhook fires at period end

**Sync Order:** Stripe → DB → Stigg (Stripe is source of truth)

---

### 6. Usage Recording Idempotency (Story 4.2)

**Idempotency Window:** 24 hours
- `request_id` stored in `UsageRecord.metadata` as `{"request_id": "..."}`
- Duplicate `request_id` within 24 hours returns cached response (no DB write)
- After 24 hours, same `request_id` creates new record (old window expired)

**Implementation:** Query `UsageRecord` for matching `request_id` + `timestamp > NOW() - 24 hours`

---

### 7. Customer Portal (Story 6.2)

**Portal Type:** Stripe Customer Portal (managed by Stripe)
- Endpoint calls `billingPortal.sessions.create()`
- Returns URL to Stripe-hosted portal
- Customers can view invoices, update payment methods, cancel subscription
- No custom portal implementation required

---

## 1) Sign-Up → Trial (Big Story)

1.1) **Create Org**
**POST** `/api/orgs.create` → creates `{orgId,name,ownerUserId}`
**Acceptance:** 200 `{orgId}`

1.2) **Ensure Stripe Customer**
**POST** `/api/stripe/customer.ensure` `{orgId,email}` → returns/creates `customerId`
**Acceptance:** 200 `{stripeCustomerId}` (idempotent)

1.3) **Create Trial Subscription**
**POST** `/api/stripe/subscription.create` `{orgId, priceLookup:'plan_starter_m'}`
**Acceptance:** 200 `{subscriptionId,status:'trialing',trialEndsAt}`

1.4) **Provision in Stigg**
**POST** `/api/stigg/provision` `{orgId, stripeCustomerId, stripeSubscriptionId, planCode}`
**Acceptance:** 200 `{provisioned:true}`

1.5) **Seed Usage Counter**
**POST** `/api/usage/seed` `{orgId, periodKey}`
**Acceptance:** 200 `{used:0, remaining:included, periodKey}`

---

## 2) Trial → Paid Conversion (Big Story)

2.1) **Create SetupIntent**
**POST** `/api/payments/setup-intent.create` `{orgId}`
**Acceptance:** 200 `{clientSecret}`

2.2) **Attach & Set Default PM**
**POST** `/api/payments/default-method.set` `{orgId, paymentMethodId}`
**Acceptance:** 200 `{ok:true}`

2.3) **Stripe Webhook Intake** *(background trigger)*
**POST** `/api/webhooks/stripe.receive` raw body
**Acceptance:** 202 `{queued:true,eventId}` (idempotent on `event.id`)

2.4) **Stripe Webhook Processor** *(background job)*
**POST** `/api/jobs/stripe.process` `{eventId}`
**Acceptance:** 200 `{converged:true}` (DB mirrors Stripe `active|canceled`)

---

## 3) Entitlements (Big Story)

3.1) **Get My Entitlements**
**GET** `/api/me/entitlements.read`
**Acceptance:** 200 `{planCode,included,used,remaining,periodKey}`

---

## 4) Usage & Quota (Big Story)

4.1) **Real-Time Quota Check**
**POST** `/api/quota/check` `{orgId, metric:'api_call'}`
**Acceptance:** 200 `{allow:true,remaining}` or 429 `{allow:false,remaining:0}`

4.2) **Record Usage (Idempotent)**
**POST** `/api/usage/record` `{orgId, metric, value, occurredAt, request_id}`
**Acceptance:** 200 `{periodKey,used,remaining}`; duplicate `request_id` → identical body

4.3) **Standard Denial Envelope**
**POST** `/api/quota/deny-envelope.example`
**Acceptance:** 429 with standard JSON + `Retry-After`

---

## 5) Plan Changes (Big Story)

5.1) **Preview Plan Change (Proration)**
**POST** `/api/plans/preview` `{orgId,newPlanCode}`
**Acceptance:** 200 `{amount,currency,proration,items[]}`

5.2) **Upgrade Now (Immediate)**
**POST** `/api/plans/upgrade.now` `{orgId,newPlanCode}`
**Acceptance:** 200 `{planCode:newPlanCode,effective:'immediate'}`

5.3) **Downgrade at Period End**
**POST** `/api/plans/downgrade.schedule` `{orgId,newPlanCode}`
**Acceptance:** 200 `{effectiveAt, pendingPlanCode:newPlanCode}`

---

## 6) Billing Self-Service (Big Story)

6.1) **List Invoices**
**GET** `/api/invoices.list?cursor=&limit=`
**Acceptance:** 200 `[{id,total,currency,status,url,created}]`

6.2) **Create Customer Portal Session**
**POST** `/api/payments/portal.create` `{orgId}`
**Acceptance:** 200 `{url}`

---

## 7) Period Rollover (Big Story)

7.1) **Quota Reset (Admin/Auto)**
**POST** `/api/admin/quotas.reset` `{periodKey}`
**Acceptance:** 200 `{updated:n, periodKey}`

---

## 8) Webhook Operations (Big Story)

8.1) **Webhook Replay (Admin)**
**POST** `/api/admin/webhooks.replay` `{eventIds:[]}`
**Acceptance:** 200 `{enqueued:n}`

---

## 9) Observability (Big Story)

9.1) **Smoke Diagnostics**
**GET** `/api/diag/smoke`
**Acceptance:** 200 `{ok:true}` and emits structured log

---

### Notes (scope guards)

* Each function above is a **separate endpoint or background job**.
* Bigger stories (1, 2, 4, 5) are broken into **independent, callable units** to align with your AI-coding workflow.



### Code Boundaries
src/
├── app/                     # Next.js app router (API routes, pages)
├── lib/                     # Shared logic & clients (scaffolded core)
│   ├── scaffold/            # Global utility clients (Stripe, Stigg, Redis, etc.)
│   ├── db/                  # Prisma client, migrations, repository functions
│   ├── services/            # Core domain logic per story/use-case
│   ├── jobs/                # Background jobs (cron or API-triggered)
│   ├── webhooks/            # Signature verification + queue intake
│   ├── billing/             # Stripe + Stigg orchestration logic
│   ├── quota/               # Real-time usage & quota enforcement
│   ├── entitlements/        # Read API + computation of plan allowances
│   ├── api/                 # Shared API request/response schema (Zod)
│   ├── test/                # Reusable test helpers & mocks
│   └── utils/               # Pure utility functions (no side effects)
├── prisma/                  # Schema + migrations
├── tests/                   # Story-level Jest tests (integration)
│   ├── unit/                # unit testing
│   ├── integration/         # integration testing
│   ├── e2e/                 # e2e testing
└── types/                   # Global TS interfaces & enums



## Stack
Next.js, JS, Tailwind, shadcn/ui, Clerk, Prisma, PostgreSQL, Stripe, Redis, Node 22.13.1, Axiom, Stigg
