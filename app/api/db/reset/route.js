import { NextResponse } from 'next/server'
import { db } from '@/lib/scaffold/db.js'
import { getEnv } from '@/lib/scaffold/config.js'

/**
 * POST /api/db/reset
 *
 * Resets the database to a clean state for testing
 *
 * SECURITY:
 * - Only works in development (NODE_ENV !== 'production')
 * - Requires confirmation query parameter: ?confirm=yes
 *
 * Query params:
 * - confirm: must be 'yes' to proceed
 *
 * Response:
 * {
 *   ok: true,
 *   message: 'Database reset successfully',
 *   deletedCounts: {
 *     users: number,
 *     organizations: number,
 *     subscriptions: number,
 *     usageCounters: number
 *   }
 * }
 */
export async function POST(request) {
  try {
    // Safety check 1: Only allow in development
    const env = getEnv()
    if (env.nodeEnv === 'production') {
      return NextResponse.json(
        { error: 'Database reset is not allowed in production' },
        { status: 403 }
      )
    }

    // Safety check 2: Require confirmation
    const { searchParams } = new URL(request.url)
    const confirm = searchParams.get('confirm')

    if (confirm !== 'yes') {
      return NextResponse.json(
        {
          error: 'Confirmation required',
          message: 'Add ?confirm=yes to the URL to reset the database',
        },
        { status: 400 }
      )
    }

    // Delete all records in reverse dependency order
    // (child tables first to avoid foreign key constraints)

    const deletedUsageRecords = await db.usageRecord.deleteMany({})
    const deletedUsageCounters = await db.usageCounter.deleteMany({})
    const deletedSubscriptions = await db.subscription.deleteMany({})
    const deletedUsers = await db.user.deleteMany({})

    return NextResponse.json(
      {
        ok: true,
        message: 'Database reset successfully',
        deletedCounts: {
          users: deletedUsers.count,
          subscriptions: deletedSubscriptions.count,
          usageCounters: deletedUsageCounters.count,
          usageRecords: deletedUsageRecords.count,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Database reset failed:', error)
    return NextResponse.json(
      {
        error: 'Database reset failed',
        message: error.message,
      },
      { status: 500 }
    )
  }
}
