Here is the manual test plan formatted as a Markdown file. You can save this as MANUAL_TESTING.md in your repository.

code
Markdown
download
content_copy
expand_less
# Manual Test Plan

This document outlines manual verification steps for the Usage-Based Billing System. While AI-generated unit and integration tests cover code logic, these tests verify real-world integration with Stripe, Stigg, and the local Database.

---

## Prerequisites
- [ ] **Tools:** Postman or Insomnia (for API requests), Prisma Studio (to view DB state), Stripe Dashboard (Test Mode).
- [ ] **Environment:** Local development server running (`npm run dev`).
- [ ] **Database:** Postgres running and migrations applied.

---

## 1) Sign-Up → Trial
*Goal: Verify the "Happy Path" of onboarding: creating an org, linking Stripe, and starting a trial.*

### Test 1.1: Create & Link
- [ ] **Action:** `POST /api/orgs.create` (Body: `{ name: "Test Org 1" }`).
- [ ] **Action:** `POST /api/stripe/customer.ensure` with the returned `orgId`.
- [ ] **Verify (DB):** `Organization` table has a new row with `clerkOrgId` and a populated `stripeCustomerId`.
- [ ] **Verify (Stripe):** Search the Customer ID in Stripe Dashboard; it should exist with the correct email.

### Test 1.2: Start Trial & Mirror
- [ ] **Action:** `POST /api/stripe/subscription.create` (Body: `{ orgId: "...", priceLookup: "plan_starter_m" }`).
- [ ] **Verify (Stripe):** Subscription status is `trialing` in Dashboard.
- [ ] **Verify (Stigg):** Stigg Dashboard shows the customer provisioned on the correct plan.
- [ ] **Verify (DB):** `UsageCounter` table has a row for the current `periodKey` (e.g., `2025-11`) with `count: 0`.

### Test 1.3: Idempotency
- [ ] **Action:** Call `/api/stripe/customer.ensure` again for the *same* Org.
- [ ] **Verify (API):** Returns the **same** `stripeCustomerId`.
- [ ] **Verify (Stripe):** No duplicate customer is created in the Dashboard.

---

## 2) Trial → Paid Conversion
*Goal: Verify payment collection and webhook data ingestion.*

### Test 2.1: Payment Method Attachment
- [ ] **Action:** `POST /api/payments/setup-intent.create`.
- [ ] **Action:** Use the returned `clientSecret` with a Stripe testing frontend (or CLI) to attach a test card (`4242...`).
- [ ] **Verify (Stripe):** Customer has a default payment method attached in the Dashboard.

### Test 2.2: Webhook Sync (The "Real" Integration)
- [ ] **Action:** Use Stripe CLI to trigger a subscription update:
  ```bash
  stripe trigger customer.subscription.updated

Verify (API): /api/webhooks/stripe.receive endpoint returns 202 Accepted.

Verify (DB): StripeEvent table contains the new event row.

Verify (DB): Organization.subscriptionStatus updates to reflect the payload (e.g., active or past_due).

3) Entitlements

Goal: Verify the user UI sees data matching the DB reality.

Test 3.1: Read State

Action: Manually update DB UsageCounter count to 50 for the current org (using Prisma Studio/SQL).

Action: GET /api/me/entitlements.read.

Verify (Response): JSON shows used: 50.

Verify (Calculation): remaining equals (PlanLimit - 50).

4) Usage & Quota (Hot Path)

Goal: Verify real-time limits are enforced and counting is accurate.

Test 4.1: Basic Increment

Action: POST /api/usage/record (Body: { metric: "api_call", value: 1 }).

Verify (DB): UsageCounter for current period increments by 1.

Test 4.2: Request Idempotency

Action: POST /api/usage/record with request_id: "test-uuid-1" and value: 5.

Action: Repeat the exact same request immediately.

Verify (DB): Counter increased by 5 total, not 10.

Verify (API): Both requests return 200 OK.

Test 4.3: Hard Limit Enforcement

Action: In DB, set count to equal the plan_limit (e.g., 1000).

Action: POST /api/quota/check.

Verify (Response): Returns 429 Too Many Requests (Deny).

Verify (Body): { allow: false, remaining: 0 }.

5) Plan Changes

Goal: Verify upgrades/downgrades handle money and state correctly.

Test 5.1: Immediate Upgrade

Action: POST /api/plans/upgrade.now (Body: { newPlanCode: "growth" }).

Verify (Stripe): Subscription changed to Growth Price ID. Proration invoice item created.

Verify (DB): Organization.planCode is now growth.

Verify (Stigg): Plan updated in Stigg dashboard.

Test 5.2: Downgrade Scheduling

Action: POST /api/plans/downgrade.schedule (Body: { newPlanCode: "starter" }).

Verify (Stripe): Subscription has "Pending Update" scheduled for end of period.

Verify (DB): Organization.planCode remains growth (until webhook hits at period end).

6) Billing Self-Service

Goal: Verify user can access the Stripe-hosted portal.

Test 6.1: Portal Link

Action: POST /api/payments/portal.create.

Verify (Browser): Open the returned URL. It should load the Stripe hosted portal.

Check: Verify "Update payment method" and "Invoice history" options are visible.

7) Period Rollover

Goal: Verify counters reset when the month changes.

Test 7.1: Forced Reset (Simulation)

Action: Identify current periodKey in DB (e.g., 2025-11).

Action: POST /api/admin/quotas.reset (Body: { periodKey: "2025-12" }).

Verify (DB): A new UsageCounter row is created for 2025-12 with count: 0.

Verify (DB): The old row (2025-11) remains untouched for history.

8) Webhook Operations

Goal: Verify disaster recovery tools.

Test 8.1: Replay

Action: Find a StripeEvent ID in DB that was previously processed.

Action: POST /api/admin/webhooks.replay (Body: { eventIds: ["evt_..."] }).

Verify (Logs/DB): System attempts to re-process logic.

Verify (State): DB state does not change (logic must be idempotent).

9) Observability

Goal: Verify the system is monitoring itself.

Test 9.1: Smoke Test

Action: GET /api/diag/smoke.

Verify (Response): 200 OK.

Verify (Logs): Server console shows a structured JSON log entry containing DB latency/status.
