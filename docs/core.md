# core.md — System Reference (Lean v1 · Stripe + Stigg)

> **Purpose:** Canonical system reference for the Metered Subscriptions Platform. Read alongside **api.md**, **db.md**, and **library.md**. Optimized for a small, high‑leverage stack with hard‑stop quotas and clean upgrade paths.

---

## 0) System Snapshot

* **Product:** Monthly subscriptions with included usage; every API call metered; **hard‑stop at quota**; trials, upgrades/downgrades, invoices, portal.
* **Stack:** Next.js (App Router) · **TypeScript** · Tailwind · shadcn/ui · Clerk (auth/orgs) · Prisma · PostgreSQL · Redis · **Stripe** (billing/payments) · **Stigg** (plan metadata/proration) · Sentry · Node **22.13.1**.
* **Sources of Truth:**

  * **Billing/periods/trials:** Stripe
  * **Plan metadata/proration previews:** Stigg
  * **Usage/quota enforcement:** Local DB (`UsageCounter`) + Redis cache (optional)
* **Sync Order:** **Stripe → DB → Stigg**

---

## 1) Architecture Overview

### 1.1 Services/Modules (v1)

* **Web App (Next.js):** UI + API routes. Minimal SSR, strict typed DTOs, Zod validation.
* **Message Orchestrator (API Layer):** Owns routes in **api.md**; enforces idempotency; emits structured logs.
* **Usage Engine:** Hot‑path quota check + idempotent usage record; reads **DB only** (no Stigg on hot path).
* **Stripe Edge:** Checkout/portal/session helpers; secure webhook intake → queue → processor.
* **Stigg Adapter:** Provision + plan preview. Never blocks hot path.
* **Jobs:** Stripe webhook processing, period rollover, admin replays.

### 1.2 Trust/Data Boundaries

* **External:** Stripe, Stigg, Clerk.
* **Internal:** API layer, DB, Redis, jobs. No PII leaks to logs.

---

## 2) Design Conventions (Lean)

* **IDs:** `orgId = Clerk org ID (org_...)` across APIs; backend maps to internal IDs.
* **Plan Codes:** `trial|starter|growth|pro` → mapped via `PLANS_CONFIG` to Stripe **price IDs** (single source of truth).
* **Trials:** Owned by Stripe (Price/Checkout). Stigg mirrors—no separate trial config.
* **Period Key:** Server‑derived from Stripe cycle: `YYYY-MM`.
* **Usage Truth:** `UsageCounter` (DB). Redis is a read‑through cache; cache miss must be tolerable.
* **Idempotency:** Client supplies `request_id` for usage; we supply idempotency keys for Stripe calls.
* **Schema Changes:** Forward‑only migrations; no destructive changes without data migration plan.

---

## 3) Environments & Configuration

* **Envs:** `local`, `dev`, `prod` (no staging unless required).
* **Secrets:** Managed via platform Secret Manager + `.env.local` for dev; never in Git.
* **Required ENV (subset):**

  * `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
  * `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  * `STIGG_API_KEY`
  * `DATABASE_URL` (PostgreSQL)
  * `REDIS_URL` (optional in v1)
  * `SENTRY_DSN` (optional but recommended)
  * `APP_BASE_URL`
* **Feature Flags (optional):** JSON map in DB for toggling previews, strict quota, etc.

---

## 4) Data & Time

* **Timezones:** Store as UTC (RFC3339 `Z`); UI formats via org/business tz (DB field on Business).
* **Period Derivation:** Align to Stripe’s subscription current period (start/end). `periodKey = YYYY-MM` from server.
* **Clock Drift:** Do not trust client clocks. Server authoritative.

---

## 5) Usage & Quota Mechanics

* **Metric:** `api_call` (extendable via `metric` enum later).
* **Quota Check (4.1):** DB lookup by `(orgId, periodKey)`; return `{allow, remaining}`; never calls Stripe/Stigg.
* **Record Usage (4.2):** Mutate **once** per unique `request_id`; duplicate returns identical body.
* **Hard Stop:** When `remaining <= 0`, deny with standard envelope (see api.md) and `Retry-After` guidance.
* **Rollover:** Job computes new `periodKey` on billing cycle rollover; seeds counters.

---

## 6) Billing & Plan Changes

* **Stripe as Authority:** Customer, subscription, prices, invoices, trials.
* **Plan Preview (5.1):** Query Stigg/Stripe for proration preview; do not mutate state.
* **Upgrade Now (5.2):** Immediate change; verify new included units; optionally re‑seed `UsageCounter`.
* **Downgrade Scheduled (5.3):** Store `pendingPlanCode`; apply on next cycle via job.
* **Webhook Intake:** Verify signature, enqueue by `event.id` (idempotent); processor converges DB to Stripe state.

---

## 7) Security & Compliance (Minimums)

* **Auth:** Clerk session on all app/API calls; org scoping enforced at the handler boundary.
* **Authorization:** Ownership rule—org can only access its own resources; admin endpoints gated by role claims.
* **Secrets Handling:** Short‑lived tokens to clients; never expose Stripe secret keys.
* **PII:** Store minimum necessary; Stripe handles PCI; redact logs.
* **Webhooks:** Verify signatures; 2xx only after enqueue; dead‑letter queue for failures.

---

## 8) Observability & SLOs

* **Structured Logging:** JSON; include `orgId`, `request_id`, `corr_id`.
* **Health:** `/api/diag/smoke` checks DB/Redis/env and logs a canonical diagnostic frame.
* **Key SLOs:**

  * **Quota check p95 ≤ 50 ms** (DB hot path; Redis optional)
  * **Webhook converge p95 ≤ 5 s** (eventual consistency)
  * **Usage drift ≤ 0.5%** per period (monitor alert if exceeded)

---

## 9) Error Handling & Idempotency

* **Standard Envelope:** Success uses `wrapSuccess(data)`; errors use `wrapError(code, message, details)`.
* **Idempotent Paths:** Usage record (`request_id`), Stripe webhook (`event.id`), Stripe calls (idempotency keys).
* **Retry Strategy:** Clients backoff on 429/5xx; server retries jobs with jitter, max attempts N.

---

## 10) Testing & QA Flow (AI‑Assisted)

1. **Spec Ready:** Story/sub‑story block with Overview + Acceptance.
2. **AI Review (GPT‑5):** Static analysis against checklists (drift, naming, error contracts, idempotency, security).
3. **Human Review:** Dev sign‑off prior to commit.
4. **Tests:** AI writes unit/integration tests; run locally and in CI.
5. **Docs Sync:** `npm run doc:all` regenerates **api.md**, **db.md**, **library.md** snapshots.

**Checklists (excerpt):**

* Inputs validated (Zod), auth guard, org scoping, idempotency where applicable.
* No hot‑path network calls in quota check.
* Stripe/Stigg adapters do not leak secrets; timeouts with sane defaults.
* Logs redact PII; include `orgId` + `request_id`.

---

## 11) Interfaces to Other Docs

* **api.md:** Route signatures, request/response DTOs, status codes, envelopes, examples.
* **db.md:** Prisma schema, migrations, indexes, retention; tables: `Business`, `UsageCounter`, `Entitlement`, etc.
* **library.md:** Client adapters (Stripe/Stigg), helpers (`wrapSuccess`, `wrapError`, `idempotency`), middlewares.

---

## 12) Deployment & Ops (Lean)

* **Runtime:** Node 22.13.1; edge not required.
* **DB:** PostgreSQL; daily backups; migration gating in CI.
* **Redis:** Optional in v1; enable when QPS warrants.
* **Rollouts:** Blue/green or zero‑downtime deploys; run migrations before app start.

---

## 13) Roadmap Notes (Guardrails)

* v1: Single org owner model (Clerk Organizations used, owners only); multi‑user later.
* v1: Single metric `api_call`; add more metrics once revenue impact justifies.
* v1: Stripe‑owned trials; no coupons/discounts unless demanded.
* v1.1: Consider overage pricing; keep hot path unchanged.

---

## 14) Glossary

* **Org:** Tenant represented by Clerk Organization (`org_...`).
* **Period Key:** `YYYY-MM` derived from Stripe current cycle.
* **Included Units:** Quota units per plan (from `PLANS_CONFIG`).
* **Usage Drift:** `abs(recorded - billed)/billed` over a period.
