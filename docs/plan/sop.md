## 🧭 **Purpose**

To build production-grade software with AI assistance while controlling for:

1. **Context rot** – loss of consistency across limited context windows.
2. **Output limit bias** – code quality degradation beyond ~300 LOC.
3. **Novelty bias** – AIs rewriting existing code instead of reusing it.

This SOP defines repeatable steps for design, implementation, review, and testing under a **story-based development** model.

---

## Standard Operating Procedures

- **Overall Design** - AI GPT-5 thinking
- **Individual Step**
  - **Overview** - the docs/step_x.x.md document has a description of the next build cycle.
  - **Cursor Pre-Plan Query** - Created during the "Overall Design".  Fixed template + generated "constraint" section.
  - **Cursor Plan Query** - Using the result, fill in the context.json schema.
  - **Run the Plan** - Run the plan with context.json to generate the code.
  - **Implementation Review - AI** - GPT 5: Interface/Schema Consistency, Event & Message Contracts, Adapter/SDK Usage, Error Envelope Integrity, Transaction & Atomicity, Idempotency, Time & Money Units, Logic Drift from Design, Security/PII Rules, Performance/ Await Safety
  - **Implementation Review - User** - Human: always show the diff; user must review and explicitly accept code before commit.
  - **Create and run Testing** - Cursor + Sonnet 4.5
  - **Passed all testing** - run "npm run doc:all" to update the reference files.

---



DETAIL IMPLEMENTATION

---

B). CURSOR PLAN TASK DOCUMENT.  FILL OUT THE CONSTRAINTS.  THE CURSOR AI WILL FILL OUT THE SCHEMA.  LET THE DESIGN AI CREATE THIS DOCUMENT FOR EACH STEP.

Task: Draft docs/step_1.1.context.json for UC-01 Step 1.1 “Create Org”.
Goal: Create org and return {orgId} (stub only; no DB yet).
Inputs: Use docs/core.md invariants and docs/library.md (reuse-first).
Output: Return a single JSON object only (no prose), matching the schema below. Populate conservatively; infer from open docs; do not invent new goals.

Schema:
{
  "schema_version": "1.0",
  "story_id": "UC-01",
  "step_id": "1.1",
  "endpoint": "POST /api/orgs.create",
  "goal": string,
  "acceptance": string[],              // bullet, testable
  "invariants": string[],              // from core.md
  "touch_set": string[],               // exact file paths
  "reuse_first": string[],             // symbols from docs/library.md
  "non_goals": string[],               // scope exclusions
  "loc_budget": number,                // ≤200
  "required_headers": string[],        // e.g., ["x-request-id"]
  "security": "none"|"bearer"|"key",
  "side_effects": "none"|"db"|"external",
  "test_matrix": string[],             // assertions you will implement
  "rollback": string,                  // one-commit revert
  "sources": [{"path":"docs/core.md"},{"path":"docs/library.md"}]
}


Constraints:
No DB write, no Clerk linking, no Stripe/Stigg in this step.
Reuse Gate: prefer wrapSuccess, wrapError, requireHeaders, uuid() if present in docs/library.md.
touch_set minimal: src/app/api/orgs.create/route.js, tests/api/orgs.create.test.js, docs/api.md (only if missing).
LOC budget ≤200.
Idempotency: acknowledge via request_id header (per core.md).
Quality checks before answering:
Every acceptance item is testable.
invariants include time/money/idempotency/envelope.
reuse_first cites real symbols in docs/library.md.
No files beyond touch_set.
Answer with JSON only.

---

C) PASTE THIS PLAN MODE HEADER PROMPT (EXACT TEXT)

You are planning Step 1.1.
Goal: Create org and return {orgId} (stub only).
Constraints: follow docs/core.md invariants; Reuse symbols from docs/library.md; edit only the touch_set files; ≤200 net new LOC.
Acceptance: as listed in docs/step_1.1.context.json.
Produce a plan ≤5 steps with estimated LOC per step, list exact files to open/edit, and list 2–3 symbols you will reuse before proposing any new helpers (Reuse Gate).
Emit a test plan first (unit + thin integration). If any acceptance is not testable, ask one clarifying question and proceed.

---

D) WHAT A “GOOD” CURSOR PLAN SHOULD CONTAIN (QUICK CHECKLIST)
Files: only the three in touch_set.
Reuse Gate: cites symbols from docs/library.md (e.g., wrapSuccess, requireHeaders, uuid()), not new helpers.
Tests first: a small test that checks:
200 response with {orgId} shape
Generates/echoes x-correlation-id
400 if x-request-id missing (or auto-insert per your policy in core.md)
LOC budget: each step with a number; sum ≤200.
If any of those are missing → stop the run, nudge it to fix the plan, then resume.

---

E) AFTER THE PLAN APPEARS — ONE-LINE GUARDRAILS TO APPLY
“Confirm you will not add any files beyond touch_set.”
“Confirm you will reuse wrapSuccess, requireHeaders, and uuid().”
“Confirm no DB, no Clerk—stub only this step.”
Then click Run Plan (step-by-step). If it tries to add helpers you already have, stop and tell it to route through the existing symbol (novelty guard).

---

# F) REVIEW & DEFINITION OF DONE (UPDATED)

**Pipeline (strict order):**

1. **AI Review (GPT-5) — pre-tests**
   * Run a *Review Block* against the plan + diff.
   * Must explicitly pass all checks (below) or the step is rejected.
2. **Developer Review — pre-commit**
   * Human reviews **diff only**, confirms no scope creep, approves.
3. **Tests — author & run**
   * Ask AI to write tests **now** (unit + thin integration), then run.
   * If red, iterate fixes → re-run GPT-5 Review (quick pass on changed files) → re-run tests.
4. **Docs refresh**
   * `npm run docs:all` to sync `api.md`, `db_schema.md`, `library.md`.
5. **Done**
   * All green; diff touches only `touch_set`; LOC within budget; docs updated.

**GPT-5 Review — required checks (must say “PASS/FAIL” per item):**
* **Interfaces/Schemas:** public API matches `docs/api.md` shape.
* **Contracts:** error envelope, idempotency (`request_id`), units (time=UTC RFC3339; money=cents).
* **Reuse Gate:** cites/reuses symbols from `docs/library.md` (no duplicate helpers).
* **Scope:** respects `non_goals`; only `touch_set` changed; LOC ≤ budget.
* **Security/PII:** headers, no sensitive logs; auth set per step.
* **Perf/await safety:** no unnecessary blocking or unhandled promises.
* **Diff summary:** file-by-file rationale in 1–2 lines each.
**Prompts (copy/paste):**

**AI Review (GPT-5)**
> “Review Step 1.1 implementation. Use the checklist: Interfaces/Schemas, Contracts, Reuse Gate, Scope, Security/PII, Perf/await, Diff summary. For each, output **PASS/FAIL + 1-line reason**. If any FAIL, list the smallest surgical change to fix. Keep output ≤120 lines.”

**Test Authoring**
> “Write tests for Step 1.1 per `test_matrix` and `acceptance`. Use existing helpers from `docs/library.md` where applicable. No skipped tests. Keep fixtures minimal. Then provide the `npm` command to run them.”

---

# G) FAILURE MODES & INTERCEPTS (UPDATED)

* **Drift from invariants** (envelope/units/idempotency)
  * *Intercept:* GPT-5 Review fails “Contracts”; fix by aligning to `core.md`.

* **Novelty bias** (new helper instead of reuse)
  * *Intercept:* FAIL on “Reuse Gate”; require call-sites to use listed symbols.

* **Scope creep** (DB/Clerk/Stripe appears in Step 1.1)
  * *Intercept:* FAIL on “Scope”; remove code; reaffirm `non_goals`.

* **Excess LOC / extra files**
  * *Intercept:* FAIL on “Scope”; split into follow-up story or trim boilerplate.

* **Test gaps** (acceptance not covered)
  * *Intercept:* refuse to pass DoD until `test_matrix` assertions exist and run green.

* **Docs out of sync**
  * *Intercept:* `npm run doc:all` changes diff → commit or CI fails PR.

---
