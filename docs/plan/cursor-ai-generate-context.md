# Cursor AI — Execute `plan-story-x.y.md` Exactly

**Attachments (must be present):**

* `core.md`
* `code-boundary.md`
* `docs/plan/plan-story-x.y.md`  ← **single source of truth**

**Instruction (strict):**
Follow the prompt, schema, paths, and rules **exactly as written inside `docs/plan/plan-story-x.y.md`**. Do **not** reinterpret, summarize, or add guidance. Use `core.md` and `code-boundary.md` **only** as validators when the plan references them.

**Output:**
Create **only** the artifacts and file paths specified **inside the plan** (e.g., the context/content JSON and any supporting files). Use the **exact filenames/locations** the plan prescribes. If the plan names `docs/implement/story-x.y.context.json`, use that; if it specifies a different name/location, use that instead.

**Response format:**
Return only what the plan’s own instructions require (no extra prose). If any required attachment is missing or a plan constraint fails, return a single line:
`ERROR: <reason>`
