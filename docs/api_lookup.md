# API Lookup

Quick reference of all API routes. Check before implementing to avoid duplicates.

---

## Story 1: Sign-Up → Trial

### 1.1 Create Organization
- `POST /api/orgs/create` - Create organization with owner
  - File: `/app/api/orgs/create/route.js`

### 1.2 Ensure Stripe Customer
- `POST /api/stripe/customer/ensure` - Get or create Stripe customer for org
  - File: `/app/api/stripe/customer/ensure/route.js`

### 1.3 Create Trial Subscription
- `POST /api/stripe/subscription/create` - Create trial subscription
  - File: `/app/api/stripe/subscription/create/route.js`

### 1.4 Provision in Stigg
- `POST /api/stigg/provision` - Provision customer and subscription in Stigg
  - File: `/app/api/stigg/provision/route.js`

### 1.5 Seed Usage Counter
- `POST /api/usage/seed` - Initialize usage counter for billing period
  - File: `/app/api/usage/seed/route.js`

---

## Story 2: [Placeholder for next story]

---

## Story 3: [Placeholder for next story]

---

## Cross-Story APIs

### User Entitlements
- `GET /api/me/entitlements` - Get current user's entitlements
  - File: `/app/api/me/entitlements/route.js`

### Webhooks
- `POST /api/webhooks/clerk` - Clerk webhook handler
  - File: `/app/api/webhooks/clerk/route.js`

- `POST /api/webhooks/stripe` - Stripe webhook handler
  - File: `/app/api/webhooks/stripe/route.js`

---

## Dev/Test/Internal

### Health & Diagnostics
- `GET /api/health` - Health check endpoint
  - File: `/app/api/health/route.js`

### Database
- `POST /api/db/reset` - Reset database (dev/test only)
  - File: `/app/api/db/reset/route.js`

### Testing
- `POST /api/webhooks/clerk/test` - Test Clerk webhook (dev only)
  - File: `/app/api/webhooks/clerk/test/route.js`

- `GET /api/dev/auth/test-session` - Test auth session (dev only)
  - File: `/app/api/dev/auth/test-session/route.js`

### Logging (Internal)
- `POST /api/logs/rest/in` - Log incoming REST requests
  - File: `/app/api/logs/rest/in/route.js`

- `POST /api/logs/rest/out` - Log outgoing REST requests
  - File: `/app/api/logs/rest/out/route.js`

- `POST /api/logs/webhooks` - Log webhook events
  - File: `/app/api/logs/webhooks/route.js`

---

## Legacy/Deprecated

- `POST /api/create-checkout-session` - Create Stripe checkout session
  - File: `/app/api/create-checkout-session/route.js`
  - Note: Consider refactoring or removing
