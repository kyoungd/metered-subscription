# NANO-STEP S0 — SCAFFOLD (Next.js JS)

**Settings · Logging · DB stub · DI · Health · Tooling**

> Language: **JavaScript only (ES modules + JSDoc)** — no TypeScript source.
> Testing: **Vitest** (checkJS typechecking via `typescript --noEmit`).

## PART A — Files & Hard Requirements

### Allowed paths (create/modify only these)

```
/app/api/health/route.js                 # GET /api/health
/lib/scaffold/config.js                  # env loader (frozen)
/lib/scaffold/logging.js                 # JSON logger factory (pino)
/lib/scaffold/correlation.js             # request/correlation-id helpers
/lib/scaffold/di.js                      # tiny DI (app/request scopes)
/lib/scaffold/db.js                      # DB client stub (no network yet)
/lib/scaffold/envelope.js                # API envelope + ApiError
/lib/scaffold/appctx.js                  # per-request context builder

/tests/tests_scaffold/config.test.js
/tests/tests_scaffold/logging.test.js
/tests/tests_scaffold/di.test.js
/tests/tests_scaffold/health.test.js
/tests/tests_scaffold/tooling.test.js

/package.json
/package-lock.json
/.env.example
/.npmrc                                  # save-exact=true
/.nvmrc                                   # e.g. v20
/.eslintrc.cjs
/.prettierrc
/vitest.config.mjs
/tsconfig.json                           # "checkJs": true (typecheck JS via JSDoc)
/Makefile
```

> Do **not** touch any other files in S0.

---

### Goals (hard)

* **Settings**: load from `process.env` (prefix `MTR_`), freeze, no globals.
* **Logging**: JSON logs with required keys; PII redaction; request/correlation IDs.
* **DI**: app-scope & request-scope; everything resolved via DI; no global singletons in code paths.
* **Health endpoint**: `GET /api/health` → `200 {status:"ok", service, version}`; no DB or providers.
* **Adapters**: per-request `call_state` built from headers; `{call_state, payload, conversation_history, data_request}` pass-through ready.
* **Zero domain**: **no external providers or billing logic in S0** (provider-agnostic; keep Stripe and others out until later steps).

---

### Detailed requirements (by module)

#### `/lib/scaffold/config.js`

* `getEnv()` returns a **frozen** object:

  ```js
  {
    service: string,            // default: "metered-subscriptions"
    version: string,            // default: "0.1.0"
    nodeEnv: "development"|"test"|"production",
    httpPort: number,           // MTR_HTTP_PORT (default 3000)
    logLevel: "debug"|"info"|"warn"|"error", // MTR_LOG_LEVEL (default "info")
    tenantHeader: "x-tenant-id",             // MTR_TENANT_HEADER
    betterStackToken?: string,  // MTR_BETTERSTACK_TOKEN (optional)
  }
  ```
* Validation: simple coercions (numbers, enums). Throw on invalid; never print secrets.
* **No global caching**; let DI provide app-scoped instance.

#### `/lib/scaffold/logging.js`

* Pino JSON logger; redact PII fields (`email`, `phone`, `ssn`, `password`, `token`) by key name.
* `getLogger({ service, version }, { requestId, correlationId, tenantId })` → pino child with bound fields.
* Output keys: `ts`, `level`, `msg`, `service`, `version`, `request_id`, `correlation_id`, `tenant_id`, `code?`, `detail?`.
* If `betterStackToken` present, add HTTPS stream (stub in S0; actual transport later).

#### `/lib/scaffold/correlation.js`

* `ensureIds(headers)` → `{ requestId, correlationId, tenantId }`

  * read `x-request-id`, `x-correlation-id`, tenant via `config.tenantHeader`.
  * generate UUIDv4 if missing (tiny local uuid util; no external dep).

#### `/lib/scaffold/envelope.js`

* `wrapSuccess(data, meta)` → `{ ok:true, data, meta?, correlationId }`
* `wrapError(err)` → `{ ok:false, code, message, correlationId }`
* `ApiError(code, message, httpStatus=400, detail?)`
* `ErrorCode`: `BAD_REQUEST|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|CONFLICT|RATE_LIMITED|INTERNAL`.

#### `/lib/scaffold/db.js`

* Stub only: export `{ db: { ping: async ()=>'noop' } }` and `withTx(fn)` that just runs `fn`.
  (Real Prisma wiring in a later step; **no I/O** here.)

#### `/lib/scaffold/di.js`

* `createContainer(env)` returns registry with:

  * **app-scope**: `env` object, `service`, `version`.
  * **request-scope** factory: `ctx(headers)` → returns `{ logger, call_state }`.

    * `call_state` fields: `requestId`, `correlationId`, `issuedAt` (ISO), `orgId?`, `userId?`, `role?`, `tenantId?`, `featureFlags?`, `logger`, `env`.

#### `/lib/scaffold/appctx.js`

* `buildCallState(env, headers)` → **only** constructs `{ call_state }` using `correlation` + injects logger via `logging.getLogger`.

#### `/app/api/health/route.js`

* Next.js App Router handler:

  ```js
  export async function GET(request) { /*…*/ }
  ```
* Build DI container (app-scope env), resolve request logger + call_state; **do not** touch DB.
* Response: `200 { status:"ok", service, version }` (JSON).

---

## PART B — Tooling & Scripts

### Makefile (required targets)

```
make install      # npm ci
make fmt          # prettier --write .
make lint         # eslint .
make typecheck    # tsc --noEmit (with "checkJs": true)
make test         # vitest run
make cov          # vitest run --coverage
make run          # next dev -p ${MTR_HTTP_PORT:-3000}
```

* Set **`NODE_OPTIONS=--throw-deprecation`** for `lint`, `typecheck`, `test`.
* All commands must be **pinned via package.json** (exact versions) and **`.npmrc` with `save-exact=true`**.

### `package.json` (pinned ranges, examples)

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "fmt": "prettier -w .",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "cov": "vitest run --coverage"
  },
  "dependencies": {
    "next": "14.2.10",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "pino": "9.3.2"
  },
  "devDependencies": {
    "eslint": "9.9.0",
    "eslint-config-next": "14.2.10",
    "prettier": "3.3.3",
    "typescript": "5.5.4",
    "vitest": "2.0.5",
    "@vitest/coverage-v8": "2.0.5"
  }
}
```

### Other pins/config

* `.nvmrc`: `v20.13.1` (example).
* `tsconfig.json` (for **JS** typechecking):

  ```json
  {
    "compilerOptions": {
      "checkJs": true,
      "noEmit": true,
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "strict": true,
      "skipLibCheck": true,
      "allowJs": true
    },
    "include": ["app", "lib", "tests_scaffold"]
  }
  ```
* `vitest.config.mjs`: default ESM config; test environment `node`.
* `.eslintrc.cjs`: next + recommended rules; JS only.
* `.prettierrc`: standard.
* `.env.example`: show `MTR_*` vars; no secrets.

---

## PART C — Tests to Write (`/tests/tests_scaffold`)

1. **config.test.js (env loading)**

   * Set `process.env.MTR_HTTP_PORT=4321`, etc.
   * Assert `getEnv()` maps & freezes values; works without `.env`.

2. **logging.test.js (structure & PII)**

   * Create logger with request/correlation/tenant IDs; log a sample message including `{ email: "a@b.com" }`.
   * Assert output JSON contains keys: `ts`, `level`, `msg`, `service`, `version`, `request_id`, `correlation_id`, `tenant_id`.
   * Assert the **PII field is absent or redacted** in serialized output.

3. **di.test.js (scopes)**

   * App-scope env from `createContainer()` returns same object across resolutions.
   * Request-scope logger/ctx **differ per request**, and IDs reflect headers (`x-request-id`, `x-correlation-id`, tenant header).

4. **health.test.js (route)**

   * Import `GET` from `/app/api/health/route.js`.
   * Create a `Request` with headers for IDs.
   * Assert `200` and JSON `{status:"ok", service, version}`; ensure **no DB calls** (db stub untouched).

5. **tooling.test.js (targets exist)**

   * Read `Makefile` and `package.json`; assert required make targets & npm scripts exist (do **not** execute them).

---

## Per-request inputs (ready for later steps)

Every route will eventually receive or construct:

```js
{ call_state, payload, conversation_history, data_request }
```

* In S0, only **`call_state`** is constructed (from headers + env) and passed around; the others are pass-through placeholders.

---

## Acceptance (Definition of Done)

* `make lint`, `make typecheck`, `make test` all pass; `cov` produces a report.
* No global state in code paths; only factories & DI.
* `/api/health` returns the specified JSON; does **not** touch DB or providers.
* Logger emits **JSON** with request/correlation/tenant IDs; sample PII is redacted/absent.
* Package/tooling are **version-pinned**; `.npmrc` has `save-exact=true`.

---

### Notes on AI-friendliness

* Keep each file ≤ **300 LOC**.
* Always instruct the AI: **import from `/lib/scaffold/*`** first; **do not re-implement** utilities.
* Tests act as rails; future steps can extend DI (e.g., add Prisma, external clients) without touching S0 files.

