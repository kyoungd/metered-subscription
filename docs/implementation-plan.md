# Project Assessment & Implementation Plan

## Current Status Overview

The project is in the **early foundational stage**.
- **Database Schema**: Well-defined in Prisma, covering Organizations, Users, Subscriptions, Usage Counters, and Webhooks. This is the strongest part of the current codebase.
- **API Layer**: Minimal. Only `POST /api/orgs/create` (Story 1.1) is implemented.
- **Core Libraries**: Stripe and Stigg clients are initialized, and plan configuration is defined in code.
- **Frontend**: Basic structure exists (`components/ui`, `layout`), but no feature-specific UI is visible yet.

## Gap Analysis by Story

| Story | Status | Notes |
|-------|--------|-------|
| **1) Sign-Up → Trial** | 🟡 Partial | `1.1 Create Org` is done. `1.2` (Stripe Customer), `1.3` (Subscription), `1.4` (Stigg), `1.5` (Seed Usage) are **MISSING**. |
| **2) Trial → Paid** | 🔴 Missing | Setup Intents, Payment Methods, Webhook Ingestion/Processing are all missing. |
| **3) Entitlements** | 🔴 Missing | No endpoint to read entitlements (`/api/me/entitlements.read`). |
| **4) Usage & Quota** | 🔴 Missing | The core value prop. Real-time quota checks and usage recording are missing. |
| **5) Plan Changes** | 🔴 Missing | Upgrade/Downgrade logic and proration previews are missing. |
| **6) Billing Portal** | 🔴 Missing | Invoice listing and Portal session creation are missing. |
| **7) Period Rollover** | 🔴 Missing | Admin tools for quota reset are missing. |
| **8) Webhook Ops** | 🔴 Missing | Replay mechanism is missing. |
| **9) Observability** | 🔴 Missing | Smoke diagnostics are missing. |

## Detailed Findings

### ✅ Implemented
- **Data Model**: `Organization`, `User`, `Subscription`, `UsageCounter`, `UsageRecord`, `WebhookQueue`.
- **Org Creation**: `src/app/api/orgs/create/route.ts` correctly implements the idempotent creation of organizations linked to Clerk.
- **Configuration**: `src/lib/stripe.ts` contains the `PLANS_CONFIG` mapping internal plan codes to Stripe Price IDs.

### ❌ Missing / To Be Developed
- **Stripe Integration**: Customer creation, subscription management, webhook handling.
- **Stigg Integration**: Provisioning logic to mirror state to Stigg.
- **Usage Logic**: The `UsageCounter` logic (increment, check quota) needs to be implemented in a service layer.
- **API Endpoints**: ~18 endpoints defined in the product doc are missing.

## Proposed Roadmap

We should follow the "Big Stories" order as they build upon each other.

### Phase 1: Onboarding & Trials (Story 1)
Complete the remaining parts of Story 1 to get a user from "Sign Up" to "Active Trial".
- [ ] Implement `1.2 Ensure Stripe Customer`
- [ ] Implement `1.3 Create Trial Subscription`
- [ ] Implement `1.4 Provision in Stigg`
- [ ] Implement `1.5 Seed Usage Counter`

### Phase 2: Usage & Entitlements (Stories 3 & 4)
Enable the actual product usage limits.
- [ ] Implement `3.1 Get Entitlements`
- [ ] Implement `4.1 Real-Time Quota Check`
- [ ] Implement `4.2 Record Usage`

### Phase 3: Billing & Webhooks (Stories 2, 6, 8)
Handle payments and state synchronization.
- [ ] Implement Webhook Receiver & Processor
- [ ] Implement Payment Method collection
- [ ] Implement Billing Portal

### Phase 4: Lifecycle Management (Stories 5, 7, 9)
Handle upgrades, renewals, and ops.
- [ ] Implement Plan Changes
- [ ] Implement Period Rollover
- [ ] Implement Observability

## Immediate Next Step
I recommend we start with **Phase 1**, specifically **Story 1.2: Ensure Stripe Customer**.
