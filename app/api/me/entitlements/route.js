import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/scaffold/db.js'
import { getEnv, getPlanByCode } from '@/lib/scaffold/config.js'
import { createContainer } from '@/lib/scaffold/di.js'
import { wrapSuccess, wrapError, ApiError } from '@/lib/scaffold/envelope.js'
import { headers } from 'next/headers'

/**
 * GET /api/me/entitlements
 *
 * Returns current user's subscription and usage information
 * - Requires authentication
 * - Shows plan, limits, and current usage
 * - No external API calls (data from DB only)
 */
export async function GET(request) {
  let logger

  try {
    // Setup logging
    const env = getEnv()
    const container = createContainer(env)
    const headersList = await headers()
    const ctx = container.createRequestContext(headersList)
    logger = ctx.logger

    // Auth check
    const { userId } = await auth()
    if (!userId) {
      logger.warn({ message: 'Unauthenticated request to /api/me/entitlements' })
      return NextResponse.json(
        wrapError(new ApiError('UNAUTHORIZED', 'Authentication required', 401)),
        { status: 401 }
      )
    }

    logger.info({
      message: 'Fetching entitlements',
      clerkUserId: userId,
    })

    // Get user from DB
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        subscriptions: {
          where: {
            status: {
              in: ['active', 'trialing'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
    })

    if (!user) {
      logger.warn({
        message: 'User not found in DB',
        clerkUserId: userId,
      })
      return NextResponse.json(
        wrapError(new ApiError('NOT_FOUND', 'User not found', 404)),
        { status: 404 }
      )
    }

    // Get user's active organization from Clerk
    const clerk = await clerkClient()
    const orgMemberships = await clerk.users.getOrganizationMembershipList({
      userId,
    })

    let activeClerkOrgId = null
    if (orgMemberships.data && orgMemberships.data.length > 0) {
      // Get the first active organization
      activeClerkOrgId = orgMemberships.data[0].organization.id
    }

    logger.info({
      message: 'User data retrieved',
      dbUserId: user.id,
      clerkUserId: userId,
      activeClerkOrgId,
      subscriptionsCount: user.subscriptions.length,
    })

    // Build response
    const subscription = user.subscriptions[0]

    if (!subscription) {
      // No active subscription
      logger.info({
        message: 'No active subscription found',
        clerkUserId: userId,
      })

      return NextResponse.json(
        wrapSuccess(
          {
            hasSubscription: false,
            planCode: null,
            status: null,
            metrics: [],
          },
          undefined,
          ctx.call_state.correlationId
        )
      )
    }

    // Get plan configuration
    const planConfig = getPlanByCode(subscription.planCode)
    if (!planConfig) {
      logger.error({
        message: 'Plan configuration not found',
        planCode: subscription.planCode,
      })
      return NextResponse.json(
        wrapError(new ApiError('INTERNAL', 'Plan configuration not found', 500)),
        { status: 500 }
      )
    }

    // Get usage counters for this organization
    const usageCounters = await db.usageCounter.findMany({
      where: {
        clerkOrgId: subscription.clerkOrgId,
        periodStart: { lte: new Date() },
        periodEnd: { gte: new Date() },
      },
    })

    logger.info({
      message: 'Usage counters retrieved',
      clerkOrgId: subscription.clerkOrgId,
      countersCount: usageCounters.length,
    })

    // Build metrics array
    const metrics = Object.entries(planConfig.limits).map(([metric, limit]) => {
      const counter = usageCounters.find((c) => c.metric === metric)
      const used = counter?.currentValue || 0
      const remaining = Math.max(0, limit - used)

      return {
        metric,
        included: limit,
        used,
        remaining,
        periodKey: counter
          ? `${counter.periodStart.toISOString().substring(0, 7)}`
          : new Date().toISOString().substring(0, 7),
      }
    })

    const entitlements = {
      hasSubscription: true,
      planCode: subscription.planCode,
      planName: planConfig.name,
      status: subscription.status,
      currentPeriod: {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd,
      },
      trialEnd: subscription.trialEnd,
      clerkOrgId: subscription.clerkOrgId,
      metrics,
    }

    logger.info({
      message: 'Entitlements retrieved successfully',
      clerkUserId: userId,
      planCode: subscription.planCode,
      metricsCount: metrics.length,
    })

    return NextResponse.json(
      wrapSuccess(entitlements, undefined, ctx.call_state.correlationId)
    )
  } catch (error) {
    if (logger) {
      logger.error({
        message: 'Failed to fetch entitlements',
        error: error.message,
        stack: error.stack,
      })
    }

    return NextResponse.json(
      wrapError(new ApiError('INTERNAL', 'Failed to fetch entitlements', 500)),
      { status: 500 }
    )
  }
}
