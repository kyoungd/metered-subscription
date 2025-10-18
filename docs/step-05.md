# NANO-STEP S0.5 — EXTERNAL CLIENT STUBS (Stripe only)

**Purpose:** Provide a _uniform, testable_ Stripe client interface and DI registration **without real network calls** yet. All methods return deterministic fakes unless explicitly mocked in tests. No domain logic.

## Allowed paths (create/modify only these for S0.5)

```
/lib/scaffold/clients/stripe.js
/lib/scaffold/clients/http.js            # tiny http wrapper (instrumented), DRY-RUN only
/lib/scaffold/clients/index.js           # barrel export

/lib/scaffold/config.js                  # extend env with provider keys (add only)
/lib/scaffold/di.js                      # register app-scope client (add only)

/tests_scaffold/clients_stripe.test.js
```

> Do **not** change other S0 files beyond **additive** edits to `config.js` and `di.js`.

---

## Env (extend `MTR_*`, still JS only)

Add to `/lib/scaffold/config.js`:

- `stripeSecretKey` (`MTR_STRIPE_SECRET_KEY`, optional in S0.5)
- `dryRun` (`MTR_HTTP_DRY_RUN`, default `true`) // forces stubs; **no network allowed**

> Keep secrets out of logs; **never** print values.

---

## Shared HTTP wrapper (dry-run only now)

`/lib/scaffold/clients/http.js`

- Exports:
  - `buildHeaders({env, callState, extra})` → includes:
    - `authorization` (Bearer or key), **if provided**
    - `x-request-id`, `x-correlation-id`, tenant header (from config)
    - `user-agent: "metered-subscriptions/0.1"`

  - `http(env)` → returns `{ get, post, put, del }` functions that:
    - **If `env.dryRun === true`** ⇒ **do not** call network; instead return
      `{ status: 200, json: { stub: true, method, url, body, headers: <scrubbed> } }`.
    - Real `fetch` with timeouts/retry comes later (not in S0.5).

All methods must **scrub** auth tokens from any returned object used in logs.

---

## Client contract (uniform shape)

Each client factory receives `{ env, call_state, http }` and returns a **plain object** of async methods. All methods:

- Accept a simple `{ … }` parameter object.
- Return `{ ok: true, data }` on success; throw `ApiError` on predictable faults.
- **No network** in S0.5 (`env.dryRun` is always true in tests).
- Include correlation/tenant headers via `buildHeaders`.

### Stripe (`/lib/scaffold/clients/stripe.js`)

Exports `createStripeClient({ env, call_state, http })` with methods:

- `customers.createOrAttach({ externalId, email? })`
- `payments.createSetupIntent({ externalId })`
- `payments.attachMethod({ externalId, paymentMethodId })`

Dry-run data returns **stable fake IDs** (e.g., `cus_test_123`, `seti_test_123`, `pm_test_123`), and echoes inputs in a scrubbed `debug` field when `env.nodeEnv === 'test'`.

Return shapes (examples):

```js
{ ok: true, data: { customer: { id: "cus_test_123", externalId } }, debug: { stub: true } }
{ ok: true, data: { setupIntent: { id: "seti_test_123", status: "requires_confirmation" } }, debug: { stub: true } }
{ ok: true, data: { attachment: { customerId: "cus_test_123", paymentMethodId: "pm_test_123", attached: true } }, debug: { stub: true } }
```

---

## DI registration (app-scope)

Edit `/lib/scaffold/di.js` to:

- Create one app-scope instance of `http = http(env)` and **register** the factory:

```js
registry.app.stripe = ({ env, call_state }) =>
  createStripeClient({ env, call_state, http });
```

- Expose a resolver on request-scope `ctx(headers)`:

```js
const clients = {
  stripe: registry.app.stripe({ env, call_state }),
};
return { logger, call_state, env, clients };
```

> The client is an **app-scope singleton** parameterized per request with headers via `call_state` (for correlation/tenant). No network performed in S0.5.

---

## Tests (all dry-run; no network)

**/tests/tests_scaffold/clients_stripe.test.js**

- Build env with `dryRun: true`.
- Create DI container; get `clients.stripe`.
- Call each method; assert `{ ok:true }` and shape (e.g., `data.customer.id` starts with `cus_`).
- Assert the dry-run echo (in `debug`) contains `x-request-id` and **does not** leak auth tokens.

---

## Acceptance (Definition of Done)

- `make lint`, `make typecheck`, `make test` remain green.
- No actual network attempts in S0.5 (verified via dry-run echo).
- DI `ctx(headers)` returns `{ clients }` with **Stripe** only.
- Each Stripe client method:
  - Returns `{ ok:true, data:… }` with stable shapes.
  - Adds `x-request-id`, `x-correlation-id`, and tenant header to outgoing header set.
  - Never logs or returns raw secret values.

- Config extended with provider key(s); `.env.example` updated with `MTR_STRIPE_SECRET_KEY` and `MTR_HTTP_DRY_RUN`.

---
