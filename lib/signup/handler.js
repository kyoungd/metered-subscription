import { ApiError, ErrorCode } from '../scaffold/envelope.js'
import { withTx } from '../scaffold/db.js'

/**
 * @typedef {Object} SignupParams
 * @property {string} userId - Clerk user ID
 * @property {string} orgName - Organization name
 * @property {import('pino').Logger} logger - Logger instance
 * @property {Object} call_state - Call state with correlation IDs
 * @property {Object} clients - API clients (Stripe, etc.)
 * @property {import('../scaffold/config.js').EnvConfig} env - Environment config
 * @property {Object} clerkClient - Clerk API client
 * @property {Object} db - Prisma database client
 */

/**
 * @typedef {Object} SignupResult
 * @property {boolean} ok - Success flag
 * @property {Object} data - Result data
 * @property {string} data.orgId - Organization ID
 * @property {string} data.planCode - Plan code (starter)
 * @property {string} data.trialEndsAt - Trial end date (ISO string)
 * @property {string} clerkOrgId - Clerk organization ID (for cleanup)
 * @property {string} [stripeCustomerId] - Stripe customer ID (for cleanup)
 */

/**
 * Handle signup: create Clerk org, DB records, Stripe customer + subscription
 *
 * @param {SignupParams} params - Signup parameters
 * @returns {Promise<SignupResult>} Signup result
 * @throws {ApiError} On validation or API errors
 */
export async function handleSignup({
  userId,
  orgName,
  logger,
  call_state,
  clients,
  env,
  clerkClient,
  db,
}) {
  // Step 1: Validate inputs
  if (!userId || typeof userId !== 'string') {
    throw new ApiError(ErrorCode.BAD_REQUEST, 'userId is required', 400)
  }

  if (!orgName || typeof orgName !== 'string' || orgName.trim().length === 0) {
    throw new ApiError(ErrorCode.BAD_REQUEST, 'orgName is required', 400)
  }

  const trimmedOrgName = orgName.trim()

  logger.info({
    message: 'Starting signup process',
    userId,
    orgName: trimmedOrgName,
  })

  try {
    // Step 2: Get user email from Clerk
    logger.info({ message: 'Fetching user from Clerk', userId })

    const clerkUser = await clerkClient.users.getUser(userId)

    if (!clerkUser.emailAddresses || clerkUser.emailAddresses.length === 0) {
      throw new ApiError(
        ErrorCode.BAD_REQUEST,
        'User email not found in Clerk account',
        400
      )
    }

    const userEmail = clerkUser.emailAddresses[0].emailAddress

    logger.info({
      message: 'User email retrieved',
      email: userEmail, // Will be redacted by logger
    })

    // Step 3: Create Clerk Organization (makes user the owner)
    logger.info({ message: 'Creating Clerk organization', orgName: trimmedOrgName })

    const clerkOrg = await clerkClient.organizations.createOrganization({
      name: trimmedOrgName,
      createdBy: userId,
    })

    logger.info({
      message: 'Clerk organization created',
      clerkOrgId: clerkOrg.id,
    })

    // Step 4: Create Stripe customer
    logger.info({ message: 'Creating Stripe customer', email: userEmail })

    const customerResult = await clients.stripe.customers.createOrAttach({
      externalId: clerkOrg.id, // Use Clerk org ID as external reference
      email: userEmail,
    })

    if (!customerResult.ok) {
      throw new ApiError(
        ErrorCode.INTERNAL,
        'Failed to create Stripe customer',
        500,
        { stripeError: customerResult.error }
      )
    }

    const stripeCustomerId = customerResult.data.customer.id

    logger.info({
      message: 'Stripe customer created',
      stripeCustomerId,
    })

    // Step 5: Create Stripe subscription with trial
    logger.info({
      message: 'Creating Stripe subscription',
      priceId: env.starterPriceId,
      trialDays: env.trialDays,
    })

    const subscriptionResult = await clients.stripe.subscriptions.create({
      customerId: stripeCustomerId,
      priceId: env.starterPriceId,
      trialDays: env.trialDays,
      metadata: {
        clerkOrgId: clerkOrg.id,
        planCode: 'starter',
      },
    })

    if (!subscriptionResult.ok) {
      throw new ApiError(
        ErrorCode.INTERNAL,
        'Failed to create Stripe subscription',
        500,
        { stripeError: subscriptionResult.error }
      )
    }

    const subscription = subscriptionResult.data.subscription

    logger.info({
      message: 'Stripe subscription created',
      subscriptionId: subscription.id,
      status: subscription.status,
      trialEnd: subscription.trialEnd,
    })

    // Step 6: Create database records in transaction
    logger.info({ message: 'Creating database records' })

    const dbOrg = await withTx(async (tx) => {
      // Create Organization
      const org = await tx.organization.create({
        data: {
          name: trimmedOrgName,
          clerkOrgId: clerkOrg.id,
          stripeCustomerId,
        },
      })

      logger.info({
        message: 'Organization created in DB',
        orgId: org.id,
      })

      // Create Subscription record
      const now = new Date()
      const currentPeriodEnd =
        subscription.currentPeriodEnd || new Date(now.getTime() + env.trialDays * 24 * 60 * 60 * 1000)

      await tx.subscription.create({
        data: {
          organizationId: org.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId: env.starterPriceId,
          planCode: 'starter',
          status: subscription.status,
          trialStart: subscription.trialStart || now,
          trialEnd: subscription.trialEnd || currentPeriodEnd,
          currentPeriodStart: subscription.currentPeriodStart || now,
          currentPeriodEnd,
        },
      })

      logger.info({
        message: 'Subscription created in DB',
        orgId: org.id,
      })

      // Seed UsageCounter
      const periodStart = now
      const periodEnd = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth() + 1,
        0, // Last day of current month
        23,
        59,
        59
      )

      await tx.usageCounter.create({
        data: {
          organizationId: org.id,
          metric: 'api_calls',
          periodStart,
          periodEnd,
          currentValue: 0,
          limit: null, // Unlimited during trial or set based on plan
        },
      })

      logger.info({
        message: 'UsageCounter seeded',
        orgId: org.id,
        periodStart,
        periodEnd,
      })

      return org
    })

    // Step 7: Return success response
    const trialEndsAt = subscription.trialEnd
      ? subscription.trialEnd.toISOString()
      : new Date(Date.now() + env.trialDays * 24 * 60 * 60 * 1000).toISOString()

    logger.info({
      message: 'Signup completed successfully',
      orgId: dbOrg.id,
      clerkOrgId: clerkOrg.id,
      stripeCustomerId,
    })

    return {
      ok: true,
      data: {
        orgId: dbOrg.id,
        planCode: 'starter',
        trialEndsAt,
      },
      clerkOrgId: clerkOrg.id,
      stripeCustomerId,
    }
  } catch (error) {
    // Log error with context
    logger.error({
      message: 'Signup failed',
      error: error.message,
      userId,
      orgName: trimmedOrgName,
    })

    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error
    }

    // Wrap other errors
    if (error.errors && error.clerkError) {
      // Clerk error
      throw new ApiError(
        ErrorCode.INTERNAL,
        `Clerk API error: ${error.errors[0]?.message || error.message}`,
        500,
        { clerkError: error.errors }
      )
    }

    // Generic error
    throw new ApiError(ErrorCode.INTERNAL, error.message, 500)
  }
}
