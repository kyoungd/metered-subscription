Awesome—let’s wire your **SOP → UC-01 · Step 1.1 (Create Org)** in a way you can repeat every time.

I’ll keep it minimal and mechanical: **what to open, what to paste, what to ask Cursor Plan to do, and how to decide it’s done.** No code—just the procedure.

---

# Step 1.1 · Create Org — Cursor Plan “Context Acquisition” SOP

## A) Open exactly these files (keep context tiny)

1. `docs/core.md` (SoT invariants: time/money/idempotency/envelope)
2. `docs/library.md` (Derived: symbols to reuse; e.g., `wrapSuccess`, `requireHeaders`, `uuid()`, `request_id`)
3. `docs/api.md` (Derived: the **intended** `POST /api/orgs.create` block if it exists; if not, the block will be created by this step)
4. `docs/step_1.1.context.json` (you create this; see below)

> Tip: keep only these tabs open before entering Plan Mode; it biases Cursor toward the right context and prevents novelty.

---

## B) Create the tiny Context Pack (drop-in JSON)

`docs/step_1.1.context.json`

```json
{
  "goal": "Create org and return {orgId}. No DB write yet (stub only).",
  "acceptance": [
    "POST /api/orgs.create returns 200 {orgId}",
    "Requires x-request-id; sets x-correlation-id if absent",
    "Idempotent semantics acknowledged but no persistence yet",
    "Net new LOC ≤200 in app/api/orgs.create/route.js + tests"
  ],
  "invariants": [
    "time=UTC RFC3339",
    "money=cents(int) — not used here but global",
    "error envelope: {code,message,details?,request_id}",
    "idempotency via request_id header"
  ],
  "touch_set": [
    "src/app/api/orgs.create/route.js",
    "tests/api/orgs.create.test.js",
    "docs/api.md (append section if missing)"
  ],
  "reuse_first": [
    "http/wrapSuccess",
    "http/wrapError",
    "http/requireHeaders",
    "ids/uuid"
  ],
  "non_goals": [
    "No DB insert yet",
    "No Clerk org linking yet",
    "No Stripe/Stigg calls"
  ],
  "loc_budget": 200,
  "rollback": "Single commit; delete route + test to revert"
}
```

---

## C) Paste this **Plan Mode header prompt** (exact text)

> **You are planning Step 1.1.**
> Goal: Create org and return `{orgId}` (stub only).
> Constraints: follow `docs/core.md` invariants; Reuse symbols from `docs/library.md`; edit only the `touch_set` files; **≤200 net new LOC**.
> Acceptance: as listed in `docs/step_1.1.context.json`.
> **Produce a plan ≤5 steps** with estimated LOC per step, **list exact files to open/edit**, and **list 2–3 symbols you will reuse** before proposing any new helpers (Reuse Gate).
> Emit a **test plan first** (unit + thin integration). If any acceptance is not testable, ask one clarifying question and proceed.

---

## D) What a “good” Cursor plan should contain (quick checklist)

* **Files**: only the three in `touch_set`.
* **Reuse Gate**: cites symbols from `docs/library.md` (e.g., `wrapSuccess`, `requireHeaders`, `uuid()`), not new helpers.
* **Tests first**: a small test that checks:

  * 200 response with `{orgId}` shape
  * Generates/echoes `x-correlation-id`
  * 400 if `x-request-id` missing (or auto-insert per your policy in `core.md`)
* **LOC budget**: each step with a number; sum ≤200.

If any of those are missing → **stop the run**, nudge it to fix the plan, then resume.

---

## E) After the plan appears — one-line guardrails to apply

* “Confirm you will **not** add any files beyond `touch_set`.”
* “Confirm you will **reuse** `wrapSuccess`, `requireHeaders`, and `uuid()`.”
* “Confirm **no DB, no Clerk**—stub only this step.”

> Then click **Run Plan** (step-by-step). If it tries to add helpers you already have, stop and tell it to route through the existing symbol (novelty guard).

---

## F) Definition of Done (DoD) for Step 1.1 (non-code)

* `docs/api.md` has a rendered section for `POST /api/orgs.create` (from your JSDoc tags).
* Tests pass locally.
* Diff touches only the `touch_set`.
* Plan’s **Review Block** (have it output one) explicitly checks:

  * Envelope matches `core.md`
  * Idempotency policy acknowledged (even if stubbed)
  * Await/async safety in the route
  * No PII logs

---

## G) Common failure modes to watch for (and how to prevent)

* **New “tiny helpers”** instead of existing utilities → enforce Reuse Gate.
* **Scope creep** (adds DB or Clerk) → remind of `non_goals`.
* **Large file rewrites** → ask for surgical edits; keep net new LOC in budget.
* **Missing headers** → require `requireHeaders` call in the plan.

---

If you want, next turn I’ll show a 10-line example of the **`@api` JSDoc** comment for this endpoint (still no code) so your generator fills `docs/api.md` automatically.
