import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { getEnv } from '@/lib/scaffold/config.js'
import { createContainer } from '@/lib/scaffold/di.js'
import { wrapSuccess, wrapError, ApiError, ErrorCode } from '@/lib/scaffold/envelope.js'
import { db } from '@/lib/scaffold/db.js'
import { handleSignup } from '@/lib/signup/handler.js'

/**
 * POST /api/signup
 *
 * Create organization + trial subscription for authenticated user
 *
 * Request body:
 * {
 *   orgName: string  // Organization name
 * }
 *
 * Response:
 * {
 *   ok: true,
 *   data: {
 *     orgId: string,
 *     planCode: 'starter',
 *     trialEndsAt: string  // ISO date
 *   },
 *   correlationId: string
 * }
 *
 * @param {Request} request - Next.js request
 * @returns {Promise<NextResponse>} JSON response
 */
export async function POST(request) {
  let call_state

  try {
    // Load environment and create DI container
    const env = getEnv()
    const container = createContainer(env)

    // Create request context (logger, call_state, clients)
    const ctx = container.createRequestContext(request.headers)
    call_state = ctx.call_state

    ctx.logger.info('Signup request received')

    // Step 1: Authenticate user via Clerk
    const { userId } = await auth()

    if (!userId) {
      throw new ApiError(
        ErrorCode.UNAUTHORIZED,
        'Authentication required. Please sign in first.',
        401
      )
    }

    ctx.logger.info({ message: 'User authenticated', userId })

    // Step 2: Parse request body
    let body
    try {
      body = await request.json()
    } catch (error) {
      throw new ApiError(
        ErrorCode.BAD_REQUEST,
        'Invalid JSON in request body',
        400
      )
    }

    const { orgName } = body

    if (!orgName) {
      throw new ApiError(
        ErrorCode.BAD_REQUEST,
        'orgName is required in request body',
        400
      )
    }

    ctx.logger.info({
      message: 'Request validated',
      orgName,
    })

    // Step 3: Call signup handler
    const result = await handleSignup({
      userId,
      orgName,
      logger: ctx.logger,
      call_state: ctx.call_state,
      clients: ctx.clients,
      env,
      clerkClient,
      db,
    })

    ctx.logger.info({
      message: 'Signup completed',
      orgId: result.data.orgId,
    })

    // Step 4: Return success response
    const response = wrapSuccess(result.data, undefined, call_state.correlationId)

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    // Handle errors
    const logger = call_state?.logger

    if (logger) {
      logger.error({
        message: 'Signup request failed',
        error: error.message,
        code: error.code || 'INTERNAL',
      })
    }

    const envelope = wrapError(error, call_state?.correlationId)
    const status = error instanceof ApiError ? error.httpStatus : 500

    return NextResponse.json(envelope, { status })
  }
}
