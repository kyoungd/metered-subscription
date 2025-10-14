● Story 1.3: Create Trial Subscription

  Overview

  Create a trial subscription in Stripe for an organization.

  ---
  Design Specification

  route

  POST /api/stripe/subscription/create

  scope

  api

  dependencies

  - 1.1 (Create Org)
  - 1.2 (Ensure Stripe Customer)

  ---
  Request

  headers

  required:
    - x-request-id
    - x-correlation-id
  optional:
    - x-tenant-id

  body

  {
    orgId: string,           // Organization ID
    priceLookup: string      // Price lookup key (e.g., 'plan_starter_m')
  }

  Schema reference: schema://CreateTrialSubscriptionRequest@1

  ---
  Responses

  200 - Success

  description: "Trial subscription created successfully"
  body:
    subscriptionId: string        // Stripe subscription ID (sub_xxx)
    status: string                // 'trialing'
    trialEndsAt: string          // ISO 8601 timestamp
    priceId: string              // Stripe price ID used

  400 - Bad Request

  description: "Validation error - missing or invalid fields"
  body:
    code: "BAD_REQUEST"
    message: string

  404 - Not Found

  description: "Organization not found or customer not found"
  body:
    code: "NOT_FOUND"
    message: string

  409 - Conflict

  description: "Organization already has active/trialing subscription"
  body:
    code: "CONFLICT"
    message: string
    detail:
      existingSubscriptionId: string

  500 - Internal Server Error

  description: "Stripe API error or internal error"
  body:
    code: "INTERNAL"
    message: string

  ---
  Side Effects

  - Creates Stripe subscription via Stripe API
  - Creates Subscription record in database
  - Logs incoming request to DebugLog table
  - Logs operation to structured logger

  ---
  Implementation Notes

  Database Schema

  Uses existing Prisma schema:
  model Subscription {
    id                    String   @id @default(cuid())
    organizationId        String
    stripeSubscriptionId  String   @unique
    stripePriceId        String
    status               String
    trialEndsAt          DateTime?
    currentPeriodStart   DateTime
    currentPeriodEnd     DateTime
    cancelAtPeriodEnd    Boolean  @default(false)
    createdAt            DateTime @default(now())
    updatedAt            DateTime @updatedAt

    organization         Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  }

  Process Flow

  1. Validate request body (orgId, priceLookup required)
  2. Query Organization and verify owner has stripeCustomerId
  3. Check for existing active/trialing subscription (return 409 if exists)
  4. Get plan config using getPlanByCode(priceLookup) from config.js
  5. Create Stripe subscription with trial period
  6. Create Subscription record in database
  7. Return success with subscription details

  Key Logic

  - Conflict Check: Organization can only have ONE active/trialing subscription
  - Trial Period: Comes from plan configuration in config.js
  - Stripe Metadata: Store orgId in subscription metadata

  Scaffold Usage

  - getEnv() - Environment configuration
  - createContainer() - DI container
  - getPlanByCode() - Get plan config by lookup key
  - clients.stripe.subscriptions.create() - Create Stripe subscription
  - db.subscription.create() - Create database record
  - wrapSuccess() / wrapError() - Response envelopes

  ---
  Tests

  unit

  - description: "Happy path creates trial subscription and returns 200"
  expect: "Response contains subscriptionId, status='trialing', trialEndsAt, priceId"
  - description: "Missing required fields returns 400"
  expect: "Error code BAD_REQUEST"
  - description: "Invalid orgId returns 404"
  expect: "Error code NOT_FOUND"
  - description: "Organization without Stripe customer returns 404"
  expect: "Error code NOT_FOUND with message about customer"
  - description: "Existing active subscription returns 409"
  expect: "Error code CONFLICT with existingSubscriptionId"
  - description: "Invalid priceLookup returns 400"
  expect: "Error code BAD_REQUEST"
  - description: "Stripe API failure returns 500"
  expect: "Error code INTERNAL"
  - description: "Creates Subscription record in database"
  expect: "Database record exists with correct data"
  - description: "Correlation IDs are propagated"
  expect: "Response contains correlationId from headers"

  ---
  Documentation

  onCompletion

  - Update /lib/scaffold/story_features.md
    - Add: POST /api/stripe/subscription/create - Create trial subscription
  - If final story in group: Update /docs/api_global.md
    - Add: POST /api/stripe/subscription/create - Trial subscription endpoint

  ---
  Files Allowed

  /lib/scaffold/**                                    # Read-only: utility functions
  /lib/scaffold/story_features.md                     # Update on completion
  /app/api/stripe/subscription/create/route.js        # Create: API route handler
  /prisma/schema.prisma                               # Read-only: use existing Subscription model
  /.env                                               # Read-only: STRIPE_SECRET_KEY
  /docs/story_1.3_design.md                           # This file
  /docs/story_1.2_design.md                           # previous signatures (read-only)
  /docs/story_1.1_design.md                           # previous signatures (read-only)
  /docs/api_global.md                                 # Update if final story

  ---
  Notes

  - Depends on Stories 1.1 (Create Org) and 1.2 (Ensure Stripe Customer)
  - ONE subscription per organization (enforce with conflict check)
  - Trial period from plan configuration in config.js
  - Uses existing Stripe client from /lib/scaffold/clients/stripe.js
  - No Prisma schema changes required
