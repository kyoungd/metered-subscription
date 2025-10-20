Yes. I understand. Below is the **Plan template file** with **all `<@ … @>` placeholders replaced**. I left every other character unchanged, and I did **not** touch any `<$ … $>` (Cursor Plan) fields.

---

# pre-plan-template.md **Pre-Plan** Template (Lean V2.2 · **TS-first**) — **v1.1**

**Legend:** `<@ … @>` = Architect AI fills · `<$ … $>` = Cursor Plan fills

Designer → Cursor AI handoff. You fill the `<@…@>` fields; Cursor Plan proposes `touch_set` and `reuse_first` (both `"proposed"`). DRY updates: single SoT for invariants (§2), allowed paths (Appx A), and review/CI (Appx B). Tests use tiered policy (§5).

---

## 1) Prompt Envelope

```
Task: Draft docs/UC-01.1.1.context.json for Sign-Up → Trial Activation Step 1.1 “Create Org”.
Goal: Create an org/tenant record keyed by Clerk org ID (`org_...`); idempotent on `request_id`; return `{orgId}`.
Inputs: Use docs/core.md invariants and docs/library.md (reuse-first).
Output: Return a single JSON object only (no prose). Populate conservatively; infer from open docs; do not invent new goals.
Schema:
{
  "schema_version": "1.0",
  "story_id": "UC-01",
  "step_id": "1.1",
  "endpoint": "POST /api/orgs.create",

  "goal": "Create org/tenant record keyed by Clerk org ID; idempotent on request_id; return {orgId}.",
  "acceptance": ["Baseline 5 + situational: owner-only creation, no external I/O, redact PII in logs."],
  "invariants": ["No deviations from §2 for this step."],

  "touch_set": [],
  "touch_set_mode": "proposed",
  "touch_set_rationale": "",

  "reuse_first": [],
  "reuse_mode": "proposed",
  "reuse_rationale": "",

  "non_goals": [],
  "loc_budget": "≤120 LOC total (route + tests + doc touch).",
  "required_headers": ["x-request-id","x-correlation-id"],
  "extra_required_headers": ["authorization"],
  "security": "bearer",
  "side_effects": "db",
  "test_matrix": ["Baseline 5 + situational: authz (owner-only), logging.redaction, idempotency duplicate."],
  "rollback": "Delete org row created in this step; no external calls to revert.",
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

> Note on `<@endpoint@>` used in Appendix A: it refers to the **path segment** derived from `<@METHOD PATH@>` (e.g., for `POST /api/orgs.create`, the segment is `orgs.create`).

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
  *Note:* `this step is not hot-path; prohibit external provider I/O anyway`
* **Logging:** Redact PII; structured logs include `orgId`, `request_id`, `correlation_id`.
  *Deviations:* `none`
* **Testing hooks (optional):** `none`
* **Deviations summary:** `none`

---

## 3) Touch Set Policy — **AI-Authored, Human-Locked**

**Designer notes:**

* Provide `POST /api/orgs.create`.
* For any out-of-pattern file, add `exception_request: why unavoidable`.

**Authoring (Cursor Plan fills):**
<$>

1. Discover code context for `POST /api/orgs.create` and map to `src/app/api/orgs.create/route.ts`.
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

* `"returns 200 with {orgId} and correlationId on valid input"`
* `"requires x-request-id and x-correlation-id (auto-generate if missing per policy)"`
* `"rejects unauthenticated with 401"` *(or `403` per step)*
* `"validates payload (none required; empty body allowed); on violation returns 400 with wrapError format"`
* `"duplicate request_id returns identical body"` *(idempotency)*

### Acceptance — Situational (include only if relevant)

* **Hot path / no-IO:** `"POST /api/orgs.create performs no external I/O (assert no clients/* calls)"`
* **External I/O:** `"maps upstream errors from n/a to n/a"` *(not applicable)*
* **Authorization/Tenancy:** `"forbidden when session user cannot be resolved, returns 403"`
* **Boundary cases:** `"duplicate org for same Clerk orgId handled idempotently → 200 with original {orgId}"`
* **Logging/PII:** `"logs redact email/name; no raw tokens"`
* **Time/periodKey:** `"not applicable; no periodKey derivation in this step"`

### Test Matrix — Baseline 5 (always)

* `happy_path → POST /api/orgs.create with {} → 200 {orgId, correlationId}`
* `missing_headers → omit x-request-id/x-correlation-id → 200 with auto-generated IDs | 400 if policy differs`
* `unauthenticated → no bearer → 401`
* `invalid_payload.case → malformed JSON → 400 {error}`
* `idempotency.duplicate → same request_id within 24h → 200 identical body`

### Test Matrix — Situational (pick as needed)

* `hot_path.no_io → assert no calls to clients/*`
* `external_io.error_map → n/a → n/a`
* `authz.denied → session missing/invalid → 403`
* `boundary.duplicate_org → same Clerk orgId → 200 original {orgId}`
* `logging.redaction → send PII {email,name,ip} → logs hide raw values`
* `time.utc → assert createdAt timestamps are UTC (Z)`

---

## Appendix A — Allowed File Patterns (**TS-first**; JS only if that exact file already exists)

* `src/app/api/orgs.create/route.ts` | `route.js`
* `tests/integration/api.orgs.create.test.ts` | `.test.js`
* `docs/api.md` *(only to add the missing endpoint entry)*

No new top-level folders. If unavoidable, include `exception_request` in the rationale (see Appx B).

---

## Appendix B — Review & CI Rules

* `touch_set_mode` and `reuse_mode` **must be `"locked"` before merge**.
* CI rejects PRs with `"proposed"` modes.
* Any path **outside Appendix A** requires an explicit `exception_request` with justification.
* Every `reuse_first` symbol must **exist** in allowed sources; paths must be correct.
* Keep scope minimal and aligned to §5 acceptance.
