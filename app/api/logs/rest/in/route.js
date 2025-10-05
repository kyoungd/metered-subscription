import { NextResponse } from 'next/server'
import { db } from '@/lib/scaffold/db.js'

/**
 * GET /api/logs/rest/in
 *
 * View incoming REST API request logs for debugging
 * Query params:
 * - path: filter by path (e.g., /api/entitlements)
 * - method: filter by HTTP method (GET, POST, etc.)
 * - limit: max results (default: 50, max: 100)
 * - since: ISO timestamp (default: last 24 hours)
 */
export async function GET(request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const path = searchParams.get('path')
  const method = searchParams.get('method')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const since = searchParams.get('since') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const where = {
    category: 'rest_in',
    timestamp: {
      gte: new Date(since),
    },
  }

  if (path) {
    where.path = {
      contains: path,
    }
  }

  if (method) {
    where.type = method
  }

  const logs = await db.debugLog.findMany({
    where,
    orderBy: {
      timestamp: 'desc',
    },
    take: limit,
  })

  return NextResponse.json({
    count: logs.length,
    logs,
  })
}
