Here’s a minimally patched **v1.1** that fixes JSON validity, removes nesting, normalizes markers, and clarifies `endpoint` usage without changing your core structure.

---

# pre-plan-template.md **Pre-Plan** Template (Lean V2.2 · **TS-first**) — **v1.1**

**Legend:** `<@ … @>` = Architect AI fills · `<$ … $>` = Cursor Plan fills

Designer → Cursor AI handoff. You fill the `<@…@>` fields; Cursor Plan proposes `touch_set` and `reuse_first` (both `"proposed"`). DRY updates: single SoT for invariants (§2), allowed paths (Appx A), and review/CI (Appx B). Tests use tiered policy (§5).

---

## 1) Prompt Envelope

```
Task: Draft docs/<@story@>.<@step@>.context.json for <@Story Name@> Step <@Step Id@> “<@Step Title@>”.
Goal: <@…@>
Inputs: Use docs/core.md invariants and docs/library.md (reuse-first).
Output: Return a single JSON object only (no prose). Populate conservatively; infer from open docs; do not invent new goals.
Schema:
{
  "schema_version": "1.0",
  "story_id": "<@…@>",
  "step_id": "<@…@>",
  "endpoint": "<@METHOD PATH@>",

  "goal": "<@…@>",
  "acceptance": ["<@see §5: include Baseline 5 + situational items@>"],
  "invariants": ["<@use §2 Stable Invariants; list deviations only@>"],

  "touch_set": [],
  "touch_set_mode": "proposed",
  "touch_set_rationale": "",

  "reuse_first": [],
  "reuse_mode": "proposed",
  "reuse_rationale": "",

  "non_goals": [],
  "loc_budget": "<@…@>",
  "required_headers": ["x-request-id","x-correlation-id"],
  "extra_required_headers": ["<@any extra@>"],
  "security": "<@bearer|key|none@>",
  "side_effects": "<@none|db|external@>",
  "test_matrix": ["<@see §5: Baseline + situational@>"],
  "rollback": "<@what to revert if rolled back@>",
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
  *Deviations:* `<@add extra fields/variations if needed@>`
* **Headers:** Require `x-request-id`, `x-correlation-id`; auto-generate UUIDv4 via `requireHeaders`.
  *Deviations:* `<@extra headers or alternative names@>`
* **Security (default):** `"bearer"` (Clerk session).
  *Deviations:* `<@'key'|'none'@> + reason`
* **Source of Truth (SoT):** Stripe (billing/periods), DB `UsageCounter` (quota), Stigg (metadata/preview only).
  *Deviations:* `<@temporary step-specific changes@>`
* **Time:** Server authoritative; UTC (`Z`); `periodKey` derived server-side from Stripe billing cycle.
  *Deviations:* `<@non-standard derivation or fixed windows@>`
* **Idempotency:** App routes by `request_id`; Stripe via idempotency keys; webhooks by `event.id`.
  *Deviations:* `<@alternate keys/replay rules@>`
* **Hot Path:** `/api/quota/check` must never perform external I/O.
  *Note:* `<@if this step is hot-path, list prohibited I/O@>`
* **Logging:** Redact PII; structured logs include `orgId`, `request_id`, `correlation_id`.
  *Deviations:* `<@extra fields / stricter redactions@>`
* **Testing hooks (optional):** `<@test-only flags/mocks@>`
* **Deviations summary:** `<@one-liner if any deviations@>`

---

## 3) Touch Set Policy — **AI-Authored, Human-Locked**

**Designer notes:**

* Provide `<@METHOD PATH@>`.
* For any out-of-pattern file, add `<@exception_request: <@why unavoidable@>@>`.

**Authoring (Cursor Plan fills):**
<$>

1. Discover code context for `<@METHOD PATH@>` and map to `src/app/api/<@endpoint@>/route.ts`.
2. Propose **minimal** `touch_set` (see Appendix A).
3. Emit with `"touch_set_mode":"proposed"` and per-path rationale:

```
- path — existing|new.
  Reason: why needed to satisfy acceptance #refs.
  Notes: TS-first; JS only if pre-existing.
  exception_request: <@why outside allowed patterns@>  # only if applicable
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

* `<@do_not_reuse: [<@symbol@>,…]@>`, `<@preferred_symbols_first: [<@symbol@>,…]@>`, `<@additional_source: <@path@> + justification@>`.

**Review (Human):** verify existence & paths; trim to minimal; flip to `"locked"` (see Appx B).

---

## 5) Acceptance & Test Matrix (Tiered)

Use **Baseline 5** for every endpoint; add **Situational** only when applicable.

### Acceptance — Baseline 5 (always)

* `"returns 200 with <@success body shape@> and correlationId on valid input"`
* `"requires x-request-id and x-correlation-id (auto-generate if missing per policy)"`
* `"rejects unauthenticated with 401"` *(or `403` per step)*
* `"validates payload (<@list required fields@>); on violation returns 400 with <@error format@>"`
* `"duplicate request_id returns identical body"` *(idempotency)*

### Acceptance — Situational (include only if relevant)

* **Hot path / no-IO:** `"<@METHOD PATH@> performs no external I/O (assert no clients/* calls)"`
* **External I/O:** `"maps upstream errors from <@provider@> to <@status/body@>"`
* **Authorization/Tenancy:** `"forbidden when <@rule@>, returns 403"`
* **Boundary cases:** `"<@edge case@> handled → <@status/body@>"`
* **Logging/PII:** `"logs redact <@PII fields@>"`
* **Time/periodKey:** `"derives UTC Z timestamps / periodKey correctly"`

### Test Matrix — Baseline 5 (always)

* `happy_path → <@METHOD PATH@> with <@minimal valid payload@> → 200 {<@success body incl. correlationId@>}`
* `missing_headers → omit x-request-id/x-correlation-id → 200 with auto-generated IDs | 400 if policy differs`
* `unauthenticated → no <@bearer|key@> → 401`
* `invalid_payload.<@case@> → <@describe@> → 400 {<@error shape/key@>}`
* `idempotency.duplicate → same request_id within <@window@> → 200 identical body`

### Test Matrix — Situational (pick as needed)

* `hot_path.no_io → assert no calls to <@clients/*@>`
* `external_io.error_map → <@provider error@> → <@expected status/body@>`
* `authz.denied → <@role/tenant mismatch@> → 403`
* `boundary.<@edge_case@> → <@e.g., max length, future date@> → <@expected@>`
* `logging.redaction → send PII <@list@> → logs hide raw values`
* `time.utc → assert Z-timestamps / correct periodKey derivation`

---

## Appendix A — Allowed File Patterns (**TS-first**; JS only if that exact file already exists)

* `src/app/api/<@endpoint@>/route.ts` | `route.js`
* `tests/integration/api.<@endpoint@>.test.ts` | `.test.js`
* `docs/api.md` *(only to add the missing endpoint entry)*

No new top-level folders. If unavoidable, include `exception_request` in the rationale (see Appx B).

---

## Appendix B — Review & CI Rules

* `touch_set_mode` and `reuse_mode` **must be `"locked"` before merge**.
* CI rejects PRs with `"proposed"` modes.
* Any path **outside Appendix A** requires an explicit `exception_request` with justification.
* Every `reuse_first` symbol must **exist** in allowed sources; paths must be correct.
* Keep scope minimal and aligned to §5 acceptance.
