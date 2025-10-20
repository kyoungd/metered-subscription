# plan_template.md — Cursor Plan Prompt Template (Lean V2)

> Use this template when asking **Cursor Plan** to generate a `docs/<story>.<step>.context.json`.
> In V2, **Cursor (AI) authors the `touch_set`** using codebase awareness; **human reviews and locks** it.

---

## 1) Prompt Envelope (copy/paste into Cursor Plan)

```
Task: Draft docs/<story>.<step>.context.json for <Story Name> Step <Step Id> “<Step Title>”.
Goal: <1 line, from the story block>
Inputs: Use docs/core.md invariants and docs/library.md (reuse-first).
Output: Return a single JSON object only (no prose), matching the schema below. Populate conservatively; infer from open docs; do not invent new goals.
Schema:
{
  "schema_version": "1.0",
  "story_id": "<UC-XX>",
  "step_id": "<X.Y>",
  "endpoint": "<METHOD PATH>",

  "goal": string,
  "acceptance": string[],
  "invariants": string[],

  "touch_set": string[],
  "touch_set_mode": "proposed" | "locked",
  "touch_set_rationale": string,

  "reuse_first": string[],
  "non_goals": string[],
  "loc_budget": number,
  "required_headers": string[],
  "security": "none" | "bearer" | "key",
  "side_effects": "none" | "db" | "external",
  "test_matrix": string[],
  "rollback": string,
  "sources": [{"path":"docs/core.md"},{"path":"docs/library.md"}]
}

Constraints:
- Scope: do NOT exceed the step scope; prefer existing helpers.
- AI Touch Set: YOU (AI) MUST propose a minimal `touch_set`, set "touch_set_mode":"proposed", and justify each path in `touch_set_rationale`.
- Prefer editing existing files over creating new ones.
- No new top-level folders. If unavoidable, include `exception_request: <why>` in `touch_set_rationale`.
- Allowed file patterns (JS-first; TS also permitted):
  • src/app/api/<endpoint>/route.js | route.ts
  • tests/integration/api.<endpoint>.test.js | test.ts
  • docs/api.md (only if missing the endpoint entry)
- Idempotency must follow core.md policy for this route.
- Invariants must include: envelope, headers, auth, SoT, time (UTC), idempotency, logging redaction.
- Reuse Gate: only use symbols that exist in docs/library.md or src/lib/*; if missing, inline minimal logic and list a TODO in `non_goals`.
- Every acceptance line must be directly testable.
- Answer with JSON only.
```

---

## 2) Stable Invariants (pulled from core.md each time)

Include these in each step’s `invariants` unless a step explicitly says otherwise:

* **Envelope**: `wrapSuccess` / `wrapError` with `correlationId` in all responses.
* **Headers**: require `x-request-id`, `x-correlation-id`; auto-generate UUIDv4 if missing via `requireHeaders`.
* **Security**: `security: "bearer"` (Clerk session) unless explicitly public.
* **Source of Truth (SoT)**: Stripe (billing/periods), DB `UsageCounter` (quota), Stigg (metadata/preview only).
* **Time**: Server clock authoritative; UTC (`Z`); `periodKey` derived server-side from Stripe billing cycle.
* **Idempotency**: app routes by `request_id`; Stripe via idempotency keys; webhooks by `event.id`.
* **Hot Path**: `/api/quota/check` must never perform external I/O.
* **Logging**: redact PII; structured logs with `orgId`, `request_id`, `correlation_id`.

---

## 3) Touch Set Policy — **AI-Authored, Human-Locked**

**Authoring (Cursor Plan):**

1. Discover code context for `<METHOD PATH>`:

   * Map `endpoint` → Next.js App Router file path (`route.js` preferred; `route.ts` allowed if repo is TS).
   * Locate/decide `tests/integration/api.<endpoint>.test.js` (or `.ts`) alongside existing tests.
   * Check `docs/api.md`; if endpoint missing, propose adding to that file (no new docs).
2. Propose **minimal** `touch_set` limited to allowed patterns.
3. Emit:

   * `touch_set` (paths),
   * `touch_set_mode: "proposed"`,
   * `touch_set_rationale` explaining for each path:

     * whether it **exists** already (`existing|new`),
     * why it is required for acceptance,
     * `exception_request: <reason>` if any path falls outside allowed patterns (avoid unless unavoidable).

**Review (Human):**

* Edit `touch_set` if needed; then flip `touch_set_mode` → `"locked"` before merge.

**Enforcement (CI):**

* PRs must not merge with `"touch_set_mode":"proposed"`.
* Disallow paths outside allowed patterns unless `exception_request` is present in rationale.

---

## 4) Reuse Gate (library.md)

Cursor must prefer existing helpers/types. Typical symbols (update **library.md** to match actual names):

* `wrapSuccess(data, meta?)`, `wrapError(apiError)`
* `requireHeaders(headers): { requestId, correlationId }`
* `requireAuth(req): { userId, orgId }`
* `uuid()`
* `validate(schema, input)` (Zod-based)
* `idempotencyKeyFor(input)`

**Touch-Set nudge:** Prefer files that already import these helpers so reuse-first is practical (no speculative utilities).

---

## 5) Acceptance & Test Matrix Guidance

Each acceptance bullet must be trivially testable. Prefer clear, observable conditions.

**Must include lines like:**

* `"returns 200 with {...} and correlationId on valid input"`
* `"requires x-request-id and x-correlation-id (auto-generate if missing)"`
* `"rejects unauthenticated with 401"`
* `"duplicate request_id returns identical body"`
* `"never calls external clients in this step"` *(add when applicable)*
* `"touch_set is minimal and only includes allowed patterns; new folders require exception_request in touch_set_rationale"`

---

## 6) Example (UC-01 · Step 1.1 — Create Org)

> **Note:** Calibrate shape only; always regenerate from the live repo.

```
Task: Draft docs/step_1.1.context.json for UC-01 Step 1.1 “Create Org”.
Goal: Create org and return {orgId} (stub only; no DB yet).
Inputs: Use docs/core.md invariants and docs/library.md (reuse-first).
Output: Return a single JSON object only (no prose), matching the schema below. Populate conservatively; infer from open docs; do not invent new goals.
Schema: ... (same as Section 1)

Constraints:
- Do NOT add DB writes, Clerk linking, or Stripe/Stigg calls in this step (stub only).
- Idempotency via x-request-id; repeat input → deterministic `{orgId}`.
- Reuse Gate: prefer wrapSuccess, wrapError, requireHeaders, requireAuth, uuid() from docs/library.md.
- Answer with JSON only.
```

**AI’s expected fields (sketch):**

```json
{
  "schema_version": "1.0",
  "story_id": "UC-01",
  "step_id": "1.1",
  "endpoint": "POST /api/orgs.create",
  "goal": "Create org and return {orgId} (stub; no DB).",
  "acceptance": [
    "returns 200 with {orgId} and correlationId on valid input",
    "requires x-request-id and x-correlation-id (auto-generate if missing)",
    "rejects unauthenticated with 401",
    "duplicate request_id returns identical body",
    "never calls external clients in this step",
    "touch_set minimal and within allowed patterns"
  ],
  "invariants": ["envelope","headers","security","SoT","time","idempotency","logging"],
  "touch_set": [
    "src/app/api/orgs.create/route.js",
    "tests/integration/api.orgs.create.test.js",
    "docs/api.md"
  ],
  "touch_set_mode": "proposed",
  "touch_set_rationale": "- src/app/api/orgs.create/route.js (new): endpoint entry point required to serve POST.\n- tests/integration/api.orgs.create.test.js (new): enforce acceptance and idempotency behavior.\n- docs/api.md (existing): add endpoint section if missing. No new folders. exception_request: none.",
  "reuse_first": ["wrapSuccess","wrapError","requireHeaders","requireAuth","uuid"],
  "non_goals": ["no DB writes","no Clerk linking","no Stripe/Stigg calls"],
  "loc_budget": 120,
  "required_headers": ["x-request-id","x-correlation-id"],
  "security": "bearer",
  "side_effects": "none",
  "test_matrix": ["happy path","missing headers","401 unauth","idempotent repeat"],
  "rollback": "revert route + tests; no persistent data created",
  "sources": [{"path":"docs/core.md"},{"path":"docs/library.md"}]
}
---

### Notes

* **JS-first**: Patterns default to `.js`. If your repo is TypeScript, `.ts` is allowed without changing the template.
* Keep this file short and opinionated; defer details to `docs/core.md` and `docs/library.md`.
