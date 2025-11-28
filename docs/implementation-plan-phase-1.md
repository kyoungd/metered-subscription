# Implementation Plan - Phase 1: Onboarding & Trials

**Goal:** Enable a user to sign up, receive a Stripe Customer ID, start a trial subscription, and have their usage quotas initialized.

## Story 1.2: Ensure Stripe Customer

**Objective:** Link the internal Organization to a Stripe Customer. This enables all future billing operations.

### High-Level Design

**1. API Endpoint:** `POST /api/stripe/customer.ensure`
- **Inputs:** `orgId` (internal ID), `email` (admin email)
- **Outputs:** `stripeCustomerId`

**2. Service Logic (`StripeService.ensureCustomer`)**
- **Step 1: Check Local DB**
  - Query `Organization` table by `orgId`.
  - If `stripeCustomerId` is already present, return it immediately (Idempotency).
- **Step 2: Search Stripe**
  - If missing locally, query Stripe API for a Customer with `email`.
  - *Reasoning:* Prevents creating duplicate customers in Stripe if the local DB update failed previously.
- **Step 3: Create in Stripe (if needed)**
  - If no match in Stripe, call `stripe.customers.create({ email, metadata: { orgId } })`.
- **Step 4: Update Local DB**
  - Update `Organization` record with the returned `stripeCustomerId`.

### Verification Plan
- **Manual:** Call endpoint via cURL/Postman twice. First call creates customer; second call returns same ID without Stripe API write.
- **Automated:** Unit test mocking Stripe SDK to verify the "search before create" logic.

---

## Story 1.3: Create Trial Subscription

**Objective:** Start a subscription in "trialing" state so the user can access features immediately without payment.

### High-Level Design

**1. API Endpoint:** `POST /api/stripe/subscription.create`
- **Inputs:** `orgId`, `planCode` (e.g., 'starter', 'pro')
- **Outputs:** `subscriptionId`, `status`, `trialEndsAt`

**2. Service Logic (`StripeService.createSubscription`)**
- **Step 1: Validation**
  - Validate `planCode` against `PLANS_CONFIG`.
  - Ensure Organization has a `stripeCustomerId` (dependency on Story 1.2).
- **Step 2: Create Subscription in Stripe**
  - Call `stripe.subscriptions.create`.
  - **Parameters:**
    - `customer`: `org.stripeCustomerId`
    - `items`: `[{ price: PLANS_CONFIG[planCode].stripePriceId }]`
    - `trial_period_days`: `PLANS_CONFIG[planCode].trialDays`
    - `metadata`: ` { orgId, planCode }`
- **Step 3: Persist to DB**
  - Create `Subscription` record in Prisma.
  - Map Stripe status (e.g., `trialing`) to local status.
  - Store `currentPeriodStart`, `currentPeriodEnd`, `trialEndsAt`.

### Verification Plan
- **Manual:** Verify in Stripe Dashboard that a subscription exists and is in "Trialing" state.
- **Automated:** Integration test checking that the local DB `Subscription` record mirrors the Stripe response.

---

## Story 1.4: Provision in Stigg

**Objective:** Sync the new subscription state to Stigg for feature flagging and plan management visibility.

### High-Level Design

**1. API Endpoint:** `POST /api/stigg/provision`
- **Inputs:** `orgId`, `subscriptionId` (internal)
- **Outputs:** `provisioned: true`

**2. Service Logic (`StiggService.provision`)**
- **Step 1: Data Gathering**
  - Fetch Organization and Subscription details from local DB.
- **Step 2: Stigg SDK Call**
  - Call `stigg.provisionSubscription()`.
  - Map internal `planCode` to Stigg Plan ID.
- **Step 3: Error Handling**
  - If Stigg fails, log error but **do not fail the transaction**. This is a "soft" dependency; billing (Stripe) and Access (DB) are critical, Stigg is for management.
  - *Design Choice:* We might want a background retry queue for this later, but for now, log-and-continue is sufficient for Phase 1.

### Verification Plan
- **Manual:** Check Stigg Dashboard to see the provisioned entity.

---

## Story 1.5: Seed Usage Counter

**Objective:** Initialize the usage quotas so the user can make API calls immediately.

### High-Level Design

**1. API Endpoint:** `POST /api/usage/seed`
- **Inputs:** `orgId`
- **Outputs:** `periodKey`, `remaining`

**2. Service Logic (`UsageService.seed`)**
- **Step 1: Determine Context**
  - Fetch active `Subscription` for `orgId`.
  - Derive `periodKey` (Format: `YYYY-MM`) from `subscription.currentPeriodStart` (or `now` if just starting).
- **Step 2: Calculate Quota**
  - Lookup `included` amount from `PLANS_CONFIG` based on `subscription.planCode`.
- **Step 3: Upsert Counter**
  - Upsert `UsageCounter` table.
  - **Key:** `{ clerkOrgId, periodKey, metric: 'api_call' }`
  - **Values:** `included: <config_value>`, `used: 0` (or keep existing if re-seeding).

### Verification Plan
- **Manual:** Check DB `UsageCounter` table to ensure a row exists with the correct `periodKey` and `included` amount.

---

## Execution Order
1.  **Story 1.2** (Stripe Customer) - *Blocker for Subscription*
2.  **Story 1.3** (Subscription) - *Blocker for Usage/Stigg*
3.  **Story 1.5** (Usage Seed) - *Critical for App Functionality*
4.  **Story 1.4** (Stigg) - *Parallel/Non-critical*
