import { NextResponse } from 'next/server'
import { db } from '@/lib/scaffold/db.js'

/**
 * GET /api/logs/webhooks
 *
 * View webhook logs for debugging
 * Query params:
 * - provider: filter by provider (clerk, stripe)
 * - type: filter by event type
 * - limit: max results (default: 50, max: 100)
 * - since: ISO timestamp (default: last 24 hours)
 */
export async function GET(request) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider')
  const type = searchParams.get('type')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const since = searchParams.get('since') || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const where = {
    category: 'webhook',
    timestamp: {
      gte: new Date(since),
    },
  }

  if (provider) {
    where.provider = provider
  }

  if (type) {
    where.type = type
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
