# Scaffold Utility Functions Reference

## appctx.js
- `buildCallState(env, headers)` - Build call state from request headers with correlation IDs

## correlation.js
- `ensureIds(headers, tenantHeaderName)` - Ensure correlation IDs are present, generate if missing

## config.js
- `getEnv()` - Load and validate environment configuration
- `getPlanByCode(planCode)` - Get plan configuration by code
- `getPlanByPriceId(stripePriceId)` - Get plan configuration by Stripe price ID
- `getTrialPlan()` - Get trial plan configuration

## debug-log.js
- `writeDebugLog({category, provider, type, path, payload})` - Write to debug log table (non-blocking)

## db.js
- `db` - Prisma database client instance
- `ping()` - Ping database to verify connection
- `withTx(fn)` - Execute function within a database transaction
- `disconnect()` - Disconnect from database

## di.js
- `Container` - Dependency injection container class
- `createContainer(env)` - Create DI container instance

## log-request.js
- `logIncomingRequest(request)` - Log incoming API request to debug log

## envelope.js
- `ErrorCode` - Error codes enum (BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL)
- `ApiError` - API Error class
- `wrapSuccess(data, meta, correlationId)` - Wrap successful response
- `wrapError(err, correlationId)` - Wrap error response

## email-client.js
- `EmailClient` - Postmark email client class
- `EmailTemplates` - Email templates for trial conversion events

## logging.js
- `getLogger(appContext, requestContext)` - Get a logger instance with bound context

## clients/http.js
- `buildHeaders({env, callState, extra})` - Build HTTP headers for outgoing requests
- `http(env, logger)` - Create HTTP client factory (get, post, put, del methods)

## clients/stripe.js
- `createStripeClient({env, call_state, http})` - Create Stripe client with customers, payments, subscriptions methods

## clients/index.js
- Re-exports: http, buildHeaders, createStripeClient
