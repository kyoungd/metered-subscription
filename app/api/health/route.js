import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/scaffold/config.js'
import { createContainer } from '@/lib/scaffold/di.js'
import { wrapSuccess } from '@/lib/scaffold/envelope.js'

/**
 * Health check endpoint
 * @param {Request} request - Next.js request
 * @returns {Promise<NextResponse>} Health check response
 */
export async function GET(request) {
  try {
    // Load environment config (app-scope)
    const env = getEnv()

    // Create DI container
    const container = createContainer(env)

    // Create request context
    const { logger, call_state } = container.createRequestContext(request.headers)

    logger.info('Health check requested')

    // Build response
    const data = {
      status: 'ok',
      service: container.service,
      version: container.version,
    }

    const response = wrapSuccess(data, undefined, call_state.correlationId)

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        code: 'INTERNAL',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
