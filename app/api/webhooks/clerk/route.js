import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { db } from '@/lib/scaffold/db.js'
import { getEnv } from '@/lib/scaffold/config.js'
import { createContainer } from '@/lib/scaffold/di.js'

/**
 * POST /api/webhooks/clerk
 *
 * Handles Clerk webhook events for user lifecycle
 * Note: Organizations are managed in Clerk only (single source of truth)
 * We only track Users and link them to Stripe for billing
 */
export async function POST(request) {
  let logger

  try {
    // Get environment and create logger
    const env = getEnv()
    const container = createContainer(env)
    const headersList = await headers()
    const ctx = container.createRequestContext(headersList)
    logger = ctx.logger

    // Get webhook secret
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET

    if (!webhookSecret) {
      logger.error('CLERK_WEBHOOK_SECRET not configured')
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      )
    }

    // Get headers for verification
    const svix_id = headersList.get('svix-id')
    const svix_timestamp = headersList.get('svix-timestamp')
    const svix_signature = headersList.get('svix-signature')

    if (!svix_id || !svix_timestamp || !svix_signature) {
      logger.error('Missing svix headers')
      return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
    }

    // Get raw body
    const payload = await request.text()

    let evt

    // Skip verification for test webhooks in development
    if (
      process.env.NODE_ENV !== 'production' &&
      svix_signature === 'test_signature'
    ) {
      logger.info('Test webhook detected, skipping signature verification')
      evt = JSON.parse(payload)
    } else {
      // Verify webhook signature
      const wh = new Webhook(webhookSecret)

      try {
        evt = wh.verify(payload, {
          'svix-id': svix_id,
          'svix-timestamp': svix_timestamp,
          'svix-signature': svix_signature,
        })
      } catch (err) {
        logger.error({ message: 'Webhook verification failed', error: err.message })
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }
    }

    // Extract event type and data
    const { type, data } = evt

    logger.info({
      message: 'Clerk webhook received',
      type,
      id: data.id,
      timestamp: evt.timestamp || new Date().toISOString(),
    })

    // Log full event data for debugging integrations
    logger.debug({
      message: 'Clerk webhook full payload',
      type,
      eventId: data.id,
      eventData: JSON.stringify(data, null, 2),
    })

    // Handle different event types
    switch (type) {
      case 'user.created':
        await handleUserCreated(data, logger)
        break

      case 'user.updated':
        await handleUserUpdated(data, logger)
        break

      case 'user.deleted':
        await handleUserDeleted(data, logger)
        break

      // Organizations are managed in Clerk only - no DB sync needed
      case 'organization.created':
      case 'organization.updated':
      case 'organization.deleted':
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
      case 'organizationMembership.deleted':
        logger.info({
          message: 'Organization event received (no DB sync needed)',
          type,
          note: 'Organizations are managed in Clerk only',
        })
        break

      default:
        logger.warn({ message: 'Unhandled webhook event type', type })
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error) {
    if (logger) {
      logger.error({
        message: 'Webhook processing failed',
        error: error.message,
        stack: error.stack,
      })
    }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

/**
 * Handle user.created event
 * Creates user in DB for billing/subscription tracking
 */
async function handleUserCreated(data, logger) {
  const clerkUserId = data.id
  const email = data.email_addresses?.[0]?.email_address

  if (!email) {
    logger.warn({ message: 'User created without email', clerkUserId })
    return
  }

  logger.info({
    message: 'Processing user.created',
    clerkUserId,
    email,
    hasPublicMetadata: !!data.public_metadata,
    hasPrivateMetadata: !!data.private_metadata,
  })

  // Check if user already exists
  const existingUser = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  })

  if (existingUser) {
    logger.info({
      message: 'User already exists in DB',
      clerkUserId,
      dbUserId: existingUser.id,
    })
    return
  }

  // Create user in DB
  const user = await db.user.create({
    data: {
      clerkId: clerkUserId,
      email,
    },
  })

  logger.info({
    message: 'User created in DB',
    clerkUserId,
    dbUserId: user.id,
    email,
  })
}

/**
 * Handle user.updated event
 */
async function handleUserUpdated(data, logger) {
  const clerkUserId = data.id
  const email = data.email_addresses?.[0]?.email_address

  logger.info({
    message: 'Processing user.updated',
    clerkUserId,
  })

  // Update user email if it changed
  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  })

  if (!user) {
    logger.warn({ message: 'User not found in DB', clerkUserId })
    return
  }

  if (user.email !== email) {
    await db.user.update({
      where: { clerkId: clerkUserId },
      data: { email },
    })

    logger.info({
      message: 'User email updated',
      clerkUserId,
      oldEmail: user.email,
      newEmail: email,
    })
  }
}

/**
 * Handle user.deleted event
 */
async function handleUserDeleted(data, logger) {
  const clerkUserId = data.id

  logger.info({
    message: 'Processing user.deleted',
    clerkUserId,
  })

  // Delete user from DB (cascade will handle related subscriptions)
  const deletedUser = await db.user.deleteMany({
    where: { clerkId: clerkUserId },
  })

  logger.info({
    message: 'User deleted from DB',
    clerkUserId,
    deletedCount: deletedUser.count,
  })
}
