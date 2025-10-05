import { writeDebugLog } from './debug-log.js'

/**
 * Log incoming API request to debug log
 * Call this at the start of API route handlers
 *
 * @param {Request} request - Next.js request object
 */
export async function logIncomingRequest(request) {
  try {
    const url = new URL(request.url)

    await writeDebugLog({
      category: 'rest_in',
      type: request.method,
      path: url.pathname,
      payload: {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: {
          'user-agent': request.headers.get('user-agent'),
          'content-type': request.headers.get('content-type'),
        },
      },
    })
  } catch (error) {
    // Silently fail - don't break the request
    console.error('Failed to log incoming request:', error.message)
  }
}
