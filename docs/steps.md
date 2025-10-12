Understood. Here are the **bigger stories**, each decomposed into **small stories**, with one **function = one REST endpoint (or background job)**. Each item has a one-line goal and acceptance.

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
