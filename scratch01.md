chip: <ID>@1                 # bump when public contract changes
fingerprint: <TO_FILL>       # sha1 of file content (compute & paste)
route: <HTTP VERB> <PATH>    # e.g., POST /api/signup
scope: api|fn|migration      # one only
dependencies:                # other chips this relies on (IDs only)
  - _shared/envelope@1
  - _shared/headers@1

request:
  headers:
    required: [x-request-id, x-tenant-id]
  body:                       # schema $id references only
    $ref: "schema://<Body>@1"

responses:
  200:
    $ref: "schema://Envelope@1"
    example: { "ok": true, "data": { ...exact JSON... } }
  400:
    example: { "ok": false, "error": { "code":"INVALID", "message":"..." } }
  409:
    example: { "ok": false, "error": { "code":"IDEMPOTENCY_VIOLATION" } }

sideEffects:
  stripe: [customers.create, subscriptions.create]
  db: [Org.insert, Entitlement.upsert, UsageCounter.seed]

filesAllowed:                # strict whitelist for this story
  - /app/api/<path>/route.js
  - /lib/stripe.js
  - /lib/db.js
  - /tests/api/<path>.test.js

notes:
  - No UI changes.
  - Trial cancels if no PM (Stripe trial_settings.end_behavior=cancel).