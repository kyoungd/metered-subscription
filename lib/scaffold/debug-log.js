import { db } from './db.js'

/**
 * Write to debug log table (non-blocking)
 * @param {Object} params - Log parameters
 * @param {string} params.category - 'webhook', 'rest_in', 'rest_out'
 * @param {string} [params.provider] - Provider name (e.g., 'clerk', 'stripe')
 * @param {string} [params.type] - Event type or HTTP method
 * @param {string} [params.path] - URL path
 * @param {Object} params.payload - Full payload data
 */
export async function writeDebugLog({ category, provider, type, path, payload }) {
  try {
    await db.debugLog.create({
      data: {
        source: 'external',
        category,
        provider,
        type,
        path,
        payload,
      },
    })
  } catch (error) {
    // Silently fail - don't break the request if logging fails
    console.error('Failed to write debug log:', error.message)
  }
}
