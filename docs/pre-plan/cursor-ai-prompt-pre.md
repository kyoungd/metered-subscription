# Prompt for **Architect AI** — Fill `<@ … @>` in `pre-plan-story-x.y.md` (no external brief)

**Legend:** `<@ … @>` = Architect fills · `<$ … $>` = Cursor Plan fills

**Attachments (must be present):**

* `core.md` — canonical invariants (SoT, time/idempotency, logging, hot-path, testing)
* `code-boundary.md` — allowed file patterns (TS-first), forbidden I/O, auth/logging rules
* `pre-plan-story-x.y.md` — the template to fill (contains the story/step fields + `<@ … @>` placeholders)

**Fail fast:** If any attachment is missing/unreadable, output exactly:
`ERROR: missing attachment(s).`

---

## Your task

Using only the three attachments:

1. **Open `pre-plan-story-x.y.md` and replace every `<@ … @>` placeholder** with concrete values derived from `core.md`, `code-boundary.md`, and the story/step info already present in `pre-plan-story-x.y.md`.

   * Do **not** invent goals beyond what the file implies.
   * Keep scope to the single step.
   * Respect TS-first, allowed paths, forbidden I/O, auth/logging from `code-boundary.md`.

2. **Do not alter any other text/characters**:

   * Do **not** touch any `<$ … $>` (Cursor Plan) fields.
   * Do **not** rename fields, headings, or sections.
   * Preserve punctuation, quotes, code fences, lists, spacing, and newlines.
   * If you would modify non-placeholder text, **abort** with:
     `ERROR: would modify non-placeholder content.`

3. **JSON validity (where applicable):**

   * Leave `touch_set`, `reuse_first`, `non_goals` as **empty arrays** (already in the template).
   * Keep `"touch_set_mode"` / `"reuse_mode"` = `"proposed"`.
   * Keep `"required_headers"` literal; add extras only to `"extra_required_headers"`.
   * If any JSON fragment in code fences becomes invalid after substitution, **abort** with:
     `ERROR: JSON invalid after substitution.`

4. **Derivations & mapping (derive from METHOD PATH inside the file):**

   * **`endpoint`** = the METHOD PATH string exactly (e.g., `POST /api/orgs.create`).
   * **Appendix A `<@endpoint@>` segment** = strip `/api/`, then replace `/` with `.`; preserve hyphens; no trailing slash.
     Examples: `/api/stripe/customer.ensure` → `stripe.customer.ensure`; `/api/orgs.create` → `orgs.create`.
   * **Acceptance:** include **Baseline 5**; add **Situational** only if relevant (external I/O, tenancy, boundary cases, logging/PII, time/periodKey).
   * **Security:** default `"bearer"` unless `code-boundary.md` or the file’s story text requires otherwise; list any deviation in §2 “Deviations”.
   * **Side effects:** `"none" | "db" | "external"`, consistent with the step.
   * **Headers:** always `"x-request-id"`, `"x-correlation-id"`; extras to `"extra_required_headers"`.
   * **LOC budget:** tight cap for route + tests + tiny doc touch (default if unspecified: `"≤140 LOC"`).
   * **Rollback:** exact revert actions for this step (DB rows/links). No external deletions unless explicitly required (default: `"DB changes only; no external reversals"`).

5. **Invariants (§2):**

   * Default to **no deviations**; only list deviations if truly required, and summarize them in “Deviations summary”.

6. **Test Matrix (§5):**

   * Keep **Baseline 5**.
   * Add only **relevant** situational rows (e.g., Stripe error mapping if Stripe is called).
   * Avoid generic/duplicative items.

---

## Output format (strict)

* **Return the full `pre-plan-story-x.y.md` content** with **only** the `<@ … @>` placeholders replaced.
* Also **create** `/docs/plan/plan-story-x.y.md` with the same content.
* Encoding: **UTF-8**; newlines: **POSIX**.
* No extra prose before/after.
* No added/removed sections/lines.
* Do not modify `<$ … $>` fields or Markdown formatting.

---

## Gate A — Quick checklist (before returning)

* [ ] All `<@ … @>` replaced; **no `<@` or `@>` remains**.
* [ ] Every other character unchanged (length/lines stable).
* [ ] `endpoint` equals METHOD PATH; Appendix A segment derived correctly.
* [ ] `required_headers` present; extras only in `extra_required_headers`.
* [ ] `security`, `side_effects`, `rollback`, `loc_budget` align with core/boundary + story.
* [ ] No invented goals; scope = single step.
* [ ] JSON fragments parse; arrays/literals intact.

---

If you want, I can now produce a one-liner **driver command** (e.g., for Cursor/CLI) to run this prompt against a folder of `pre-plan-story-*.md` files.
