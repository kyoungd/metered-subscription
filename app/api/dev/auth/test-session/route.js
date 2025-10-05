import { NextResponse } from 'next/server'
import { db } from '@/lib/scaffold/db.js'
import { wrapSuccess, wrapError } from '@/lib/scaffold/envelope.js'

/**
 * POST /api/dev/auth/test-session
 *
 * DEV ONLY: Creates a test user and subscription for testing
 * Returns instructions for how to authenticate in Postman
 *
 * This endpoint is NOT for getting tokens - Clerk handles that.
 * Instead, it:
 * 1. Creates a test user in the DB
 * 2. Creates a test subscription
 * 3. Returns the user's Clerk ID
 * 4. You then sign in via Clerk UI and use those cookies
 */
export async function POST(request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      wrapError({
        code: 'FORBIDDEN',
        message: 'This endpoint is only available in development',
        status: 403,
      }),
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const {
      clerkUserId = 'user_test_dev',
      email = 'dev@test.com',
      clerkOrgId = 'org_test_dev',
      planCode = 'starter',
    } = body

    // Create or update test user
    const user = await db.user.upsert({
      where: { clerkId: clerkUserId },
      update: { email },
      create: {
        clerkId: clerkUserId,
        email,
        stripeCustomerId: 'cus_test_dev_123',
      },
    })

    // Create or update test subscription
    const subscription = await db.subscription.upsert({
      where: { stripeSubscriptionId: `sub_test_${clerkUserId}` },
      update: {
        planCode,
        status: 'active',
      },
      create: {
        userId: user.id,
        clerkOrgId,
        stripeSubscriptionId: `sub_test_${clerkUserId}`,
        stripePriceId: 'price_test_dev',
        planCode,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    })

    // Create test usage counter
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    await db.usageCounter.upsert({
      where: {
        clerkOrgId_metric_periodStart: {
          clerkOrgId,
          metric: 'api_calls',
          periodStart,
        },
      },
      update: {
        currentValue: 150,
        limit: 1000,
      },
      create: {
        clerkOrgId,
        metric: 'api_calls',
        periodStart,
        periodEnd,
        currentValue: 150,
        limit: 1000,
      },
    })

    return NextResponse.json(
      wrapSuccess({
        message: 'Test user and subscription created',
        user: {
          id: user.id,
          clerkId: user.clerkId,
          email: user.email,
        },
        subscription: {
          id: subscription.id,
          planCode: subscription.planCode,
          status: subscription.status,
          clerkOrgId: subscription.clerkOrgId,
        },
        instructions: {
          note: 'Clerk authentication is required. Use the browser flow:',
          steps: [
            '1. Sign in at http://localhost:3000/sign-in with any Clerk account',
            '2. Open DevTools → Application → Cookies',
            '3. Copy the __session cookie value',
            '4. In Postman, add Header: Cookie: __session=<value>',
            '5. Call GET http://localhost:3000/api/me/entitlements',
          ],
          alternative: 'Or simply visit http://localhost:3000/dashboard after signing in',
        },
      })
    )
  } catch (error) {
    console.error('Test session creation failed:', error)
    return NextResponse.json(
      wrapError({
        code: 'TEST_SESSION_ERROR',
        message: error.message,
        status: 500,
      }),
      { status: 500 }
    )
  }
}

/**
 * GET /api/dev/auth/test-session
 *
 * Returns instructions for testing authentication
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      wrapError({
        code: 'FORBIDDEN',
        message: 'This endpoint is only available in development',
        status: 403,
      }),
      { status: 403 }
    )
  }

  return NextResponse.json(
    wrapSuccess({
      message: 'Dev authentication testing helper',
      usage: {
        createTestData: 'POST /api/dev/auth/test-session',
        body: {
          clerkUserId: 'user_test_dev (optional)',
          email: 'dev@test.com (optional)',
          clerkOrgId: 'org_test_dev (optional)',
          planCode: 'starter (optional)',
        },
      },
      authenticationFlow: {
        note: 'Clerk handles authentication - no test tokens available',
        browserFlow: [
          '1. Visit http://localhost:3000/sign-in',
          '2. Sign in with Clerk',
          '3. Visit http://localhost:3000/dashboard',
          '4. See your entitlements',
        ],
        postmanFlow: [
          '1. Sign in via browser',
          '2. Extract __session cookie from DevTools',
          '3. Add Cookie header in Postman',
          '4. Test API endpoints',
        ],
      },
    })
  )
}
