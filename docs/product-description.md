# Product: **Metered Subscriptions Platform (Lean v1)**

**Stack:** Next.js 14 (App Router) + **JavaScript** + Tailwind + shadcn/ui + Clerk + **Stripe Billing/Payments** + Redis (quota cache) + Postgres (Prisma) + Better Stack/Axiom logs

---

## 1) One-liner
A SaaS billing stack that sells **monthly subscriptions with included usage**, meters every API call, and **hard-stops at quota**—with trials, upgrades/downgrades, invoices, and a self-service portal.

## 2) Target users
- API/SaaS vendors needing **allowances** with **hard stop** (overage later).
- Teams prioritizing **Stripe** for checkout, invoices, dunning, taxes.

## 3) Core value props
- **True metered plans** (allowance now; optional overage next).
- **Proration & scheduled changes** via Stripe.
- **Self-service portal** (invoices, payment methods, plan changes).
- **Low-latency quota checks** via app middleware + Redis.
- **Auditable**: append-only usage log; full audit journal; idempotent webhooks.

## 4) Key features (v1)
- **Auth & Accounts:** Clerk orgs/users/roles; optional MFA.
- **Plans & Trials:** Stripe products/prices, trials, coupons, scheduled changes.
- **Invoices & Payments:** Stripe Billing/Payments; hosted Customer Portal.
- **Usage Metering:** `UsageEvent` log (idempotent) → Redis counters → nightly Stripe usage sync (for overage in v1.1).
- **Quota Enforcement:** middleware `checkQuota(orgId)` → allow or **429/402** at 0.
- **Webhooks:** Stripe events (subs, invoices, payments).
- **Analytics (starter):** MRR, churn, per-tenant usage, unit economics.
- **Compliance:** Stripe PCI, signed webhooks, least-privilege keys, minimal PII.

## 5) Architecture (high level)
- **Frontend:** Next.js (App Router), Tailwind, shadcn/ui (**JavaScript**).
- **Auth:** Clerk (JWT, org roles).
- **Billing:** Stripe Billing/Payments (Checkout, Portal, proration, invoices).
- **Quota:** App middleware + Redis cache; reconciliation in Postgres.
- **DB/ORM:** Postgres + Prisma (orgs, entitlements, usage, invoices, audit).
- **Workers/Jobs:** Stripe webhook processor (idempotent), nightly usage summary.
- **Observability:** Better Stack/Axiom logs & alerts.

## 6) Data model (DB highlights)
- **User** {id, clerkUserId, email}  
- **Organization** {id, ownerUserId, name, status}  
- **Entitlement** {orgId, planCode, includedUnits, overagePolicy: 'HARD_STOP'|'METERED', effectiveAt, scheduledChange?}  
- **UsageEvent** {id, orgId, ts, units, idempotencyKey, source='api'} *(append-only)*  
- **UsageCounter** {orgId, periodKey(YYYY-MM), usedUnits, remainingUnits} *(cached from Redis; recomputable)*  
- **InvoiceRef** {orgId, stripeInvoiceId, amount, status, url}  
- **AuditJournal** {ts, actor, action, entity, before, after, corrId}

## 7) Plans & pricing (examples)
- **Starter:** 10k calls/mo, $49, **hard-stop**.  
- **Growth (v1.1):** 100k calls/mo, $399, **overage** $3/1k calls.  
- **Scale:** custom quota, SLA, dedicated support.

## 8) User flows
- **Sign-up → Trial:** Stripe Checkout → webhook creates Organization + Entitlement + UsageCounter (period init).  
- **API call:** middleware `checkQuota(orgId)` (Redis read) → allow/deny; on allow, append `UsageEvent` + Redis `INCR` + update `UsageCounter`.  
- **Upgrade/downgrade:** Stripe proration/scheduling → webhook updates `Entitlement`.  
- **Billing close:** v1 (hard-stop) invoices fixed plan; v1.1 adds metered overage via `usageRecords`.  
- **Cancellation:** immediate or end-of-term via Portal; webhook updates status.

## 9) API surface
- `POST /v1/usage` → record usage (server-to-server; requires org JWT).  
- `GET /v1/entitlements/:orgId` → plan + remaining units.  
- **Internal helper:** `checkQuota(orgId)` with Redis cache and DB fallback.

## 10) Webhooks (Next.js routes)
- `/api/webhooks/stripe`: subscription lifecycle, invoices, payment success/failure.  
- `/api/admin/webhooks/replay` (protected): idempotent replay by `event.id`.

## 11) Activation & Token Lifecycle
- **Activation Code** (one-time, short expiry) used in the client plugin/setup.  
- On activation, backend issues **short-lived access token** + refresh bound to site domain.  
- Auto-refresh before expiry; refresh failure → prompt re-activation.  
- No long-lived static tokens stored client-side.

## 12) Admin console
- Tenant list with usage bars + MRR.  
- Coupons/credits, refunds, plan overrides.  
- Incident tiles: failed payment, quota block.  
- Audit trail + webhook replay.

## 13) Security & compliance
- Stripe PCI out of scope (hosted pages).  
- Short-lived JWTs scoped per org; least-privilege API keys.  
- Verify webhook signatures; idempotency on all writes.  
- Minimal PII in logs; correlation IDs; RBAC enforced.

## 14) Observability & SLOs
- **KPIs:** MRR, NRR, churn, $/1k calls, active tenants, p95 quota latency.  
- **SLOs:** auth ≤250 ms; **quota check ≤50 ms** (Redis ≤10 ms typical); ingest ≤150 ms; webhooks ≤5 s.  
- **Alerts:** failed payments, webhook backlog, quota drift (>0.5%), 5xx spikes.

## 15) Roadmap
- **v1.0 (MVP):** trials, subs, invoices, portal, **hard-stop** quotas (Stripe + Redis).  
- **v1.1:** overage billing (Stripe metered prices), coupons, annual plans.  
- **v1.2:** seats, multi-bucket usage, VAT/GST.

## 16) Acceptance criteria (v1)
- Trial → upgrade → invoices visible in Portal.  
- Real-time **block at 0** (middleware returns 429/402).  
- Prorated upgrades and scheduled downgrades via Stripe.  
- Webhooks are idempotent; state converges within **≤5 s**.  
- Full **AuditJournal** for all changes; `UsageCounter` matches recomputed `UsageEvent` within **≤0.5%**.

## 17) Tech stack (final)
- **Frontend:** Next.js 14 (App Router), **JavaScript**, Tailwind, shadcn/ui.  
- **Auth:** Clerk.  
- **Billing/Payments:** **Stripe Billing + Payments**.  
- **Quota & Usage:** Redis (counters), Postgres (events & snapshots).  
- **DB/ORM:** Postgres + Prisma.  
- **Observability:** Better Stack / Axiom.