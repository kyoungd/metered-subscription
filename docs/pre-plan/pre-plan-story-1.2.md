**Legend:** `<@ … @>` = Architect AI fills · `<$ … $>` = Cursor Plan fills

---

## 1) Prompt Envelope

```
Task: Draft docs/UC-01.1.2.context.json for Sign-Up → Trial Activation Step 1.2 “Ensure Stripe Customer”.
Goal: Ensure a Stripe Customer exists for the org; create if absent; idempotent on request_id; return {stripeCustomerId}.
Inputs: Use docs/core.md invariants and docs/library.md (reuse-first).
Output: Return a single JSON object only (no prose). Populate conservatively; infer from open docs; do not invent new goals.
Schema:
{
  "schema_version": "1.0",
  "story_id": "UC-01",
  "step_id": "1.2",
  "endpoint": "POST /api/stripe/customer.ensure",

  "goal": "Ensure a Stripe Customer exists for the org; create if absent; idempotent on request_id; return {stripeCustomerId}.",
  "acceptance": ["Baseline 5 + situational: external I/O error mapping to wrapError, owner-only authorization, idempotent duplicate returns same stripeCustomerId."],
  "invariants": ["No deviations from §2 for this step."],

  "touch_set": [],
  "touch_set_mode": "proposed",
  "touch_set_rationale": "",

  "reuse_first": [],
  "reuse_mode": "proposed",
  "reuse_rationale": "",

  "non_goals": [],
  "loc_budget": "≤140 LOC total (route + tests + doc touch).",
  "required_headers": ["x-request-id","x-correlation-id"],
  "extra_required_headers": ["authorization"],
  "security": "bearer",
  "side_effects": "external",
  "test_matrix": ["Baseline 5 + situational: external_io.error_map (Stripe), authz (owner-only), idempotency duplicate."],
  "rollback": "If a DB link is created to the Stripe customer, delete that link; no external deletion of Stripe customer.",
  "sources": [{"path":"docs/core.md"},{"path":"docs/library.md"}]
}

Constraints:
- Scope: do NOT exceed step scope; prefer existing helpers.
- AI Touch Set: minimal; justify each path (see Appx B rules).
- AI Reuse: only existing symbols from allowed sources (see §4).
- Allowed file patterns: see **Appendix A**.
- Review & CI rules: see **Appendix B**.
- Tests: follow **§5 Tiered policy** (Baseline 5 + situational).
- Answer with JSON only.
```

> Note on `endpoint` used in Appendix A: it refers to the **path segment** derived from `POST /api/stripe/customer.ensure` (i.e., the segment is `stripe.customer.ensure`).

---

## 2) Stable Invariants (single SoT; deviate only when required)

* **Envelope:** `wrapSuccess` / `wrapError` with `correlationId`.
  *Deviations:* `none`
* **Headers:** Require `x-request-id`, `x-correlation-id`; auto-generate UUIDv4 via `requireHeaders`.
  *Deviations:* `none`
* **Security (default):** `"bearer"` (Clerk session).
  *Deviations:* `none`
* **Source of Truth (SoT):** Stripe (billing/periods), DB `UsageCounter` (quota), Stigg (metadata/preview only).
  *Deviations:* `none`
* **Time:** Server authoritative; UTC (`Z`); `periodKey` derived server-side from Stripe billing cycle.
  *Deviations:* `not applicable to this step`
* **Idempotency:** App routes by `request_id`; Stripe via idempotency keys; webhooks by `event.id`.
  *Deviations:* `none`
* **Hot Path:** `/api/quota/check` must never perform external I/O.
  *Note:* `this step is not hot-path; Stripe I/O allowed`
* **Logging:** Redact PII; structured logs include `orgId`, `request_id`, `correlation_id`.
  *Deviations:* `none`
* **Testing hooks (optional):** `none`
* **Deviations summary:** `none`

---

## 3) Touch Set Policy — **AI-Authored, Human-Locked**

**Designer notes:**

* Provide `POST /api/stripe/customer.ensure`.
* For any out-of-pattern file, add `exception_request: why unavoidable`.

**Authoring (Cursor Plan fills):**
<$>

1. Discover code context for `POST /api/stripe/customer.ensure` and map to `src/app/api/stripe.customer.ensure/route.ts`.
2. Propose **minimal** `touch_set` (see Appendix A).
3. Emit with `"touch_set_mode":"proposed"` and per-path rationale:

```
- path — existing|new.
  Reason: why needed to satisfy acceptance #refs.
  Notes: TS-first; JS only if pre-existing.
  exception_request: why outside allowed patterns  # only if applicable
```

</$>

**Review (Human):** prune to minimal; flip to `"locked"` (see Appx B).

---

## 4) Reuse Gate — **AI-Authored, Human-Locked**

**Allowed sources:** `docs/library.md`, `src/lib/**`, established utilities under `src/app/**`.

**Authoring (Cursor Plan fills):**
<$>

* Propose only **existing** symbols (utilities, schemas/types, auth/middleware, enums/constants, DB repos, env/config).
* Prefer no-IO helpers on hot paths and symbols already imported by files in the `touch_set`.
* Emit with `"reuse_mode":"proposed"` and rationale lines:

```
- symbol → file_path.
  Reason: how it satisfies acceptance #refs for METHOD PATH.
  Notes: no-IO/hot-path safe | already imported | type/schema reuse.
```

</$>

**Designer (optional):**

* `do_not_reuse: []`, `preferred_symbols_first: []`, `additional_source: none`.

**Review (Human):** verify existence & paths; trim to minimal; flip to `"locked"` (see Appx B).

---

## 5) Acceptance & Test Matrix (Tiered)

Use **Baseline 5** for every endpoint; add **Situational** only when applicable.

### Acceptance — Baseline 5 (always)

* `"returns 200 with {stripeCustomerId} and correlationId on valid input"`
* `"requires x-request-id and x-correlation-id (auto-generate if missing per policy)"`
* `"rejects unauthenticated with 401"` *(or `403` per step)*
* `"validates payload ({orgId, email?}); on violation returns 400 with wrapError format"`
* `"duplicate request_id returns identical body"` *(idempotency)*

### Acceptance — Situational (include only if relevant)

* **Hot path / no-IO:** `"POST /api/stripe/customer.ensure performs allowed external I/O to Stripe only"`
* **External I/O:** `"maps upstream errors from Stripe (e.g., 4xx/5xx) to appropriate status/body via wrapError"`
* **Authorization/Tenancy:** `"forbidden when session user is not owner/admin of org, returns 403"`
* **Boundary cases:** `"existing Stripe customer for org returns same {stripeCustomerId} (no duplicate)"`
* **Logging/PII:** `"logs redact email/name; no raw tokens"`
* **Time/periodKey:** `"not applicable; no periodKey derivation in this step"`

### Test Matrix — Baseline 5 (always)

* `happy_path → POST /api/stripe/customer.ensure with {orgId,email} → 200 {stripeCustomerId, correlationId}`
* `missing_headers → omit x-request-id/x-correlation-id → 200 with auto-generated IDs | 400 if policy differs`
* `unauthenticated → no bearer → 401`
* `invalid_payload.missing_orgId → {} → 400 {error}`
* `idempotency.duplicate → same request_id within 24h → 200 identical body`

### Test Matrix — Situational (pick as needed)

* `external_io.error_map → Stripe returns 402_request_failed → 502 {wrapError mapped}`
* `authz.denied → user lacks org ownership → 403`
* `boundary.existing_customer → prior link exists → 200 same {stripeCustomerId}`
* `logging.redaction → send PII {email,name,ip} → logs hide raw values`
* `time.utc → assert createdAt/updatedAt timestamps are UTC (Z) if persisted`

---

## Appendix A — Allowed File Patterns (**TS-first**; JS only if that exact file already exists)

* `src/app/api/stripe.customer.ensure/route.ts` | `route.js`
* `tests/integration/api.stripe.customer.ensure.test.ts` | `.test.js`
* `docs/api.md` *(only to add the missing endpoint entry)*

No new top-level folders. If unavoidable, include `exception_request` in the rationale (see Appx B).

---

## Appendix B — Review & CI Rules

* `touch_set_mode` and `reuse_mode` **must be `"locked"` before merge**.
* CI rejects PRs with `"proposed"` modes.
* Any path **outside Appendix A** requires an explicit `exception_request` with justification.
* Every `reuse_first` symbol must **exist** in allowed sources; paths must be correct.
* Keep scope minimal and aligned to §5 acceptance.
