import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { db } from '@/lib/scaffold/db.js'
import { getEnv } from '@/lib/scaffold/config.js'
import { createContainer } from '@/lib/scaffold/di.js'
import { writeDebugLog } from '@/lib/scaffold/debug-log.js'
import { logIncomingRequest } from '@/lib/scaffold/log-request.js'

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
    // Log incoming request
    await logIncomingRequest(request)

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

    // Log full event data for debugging (changed to info for external data logging)
    logger.info({
      message: 'Clerk webhook received - full payload',
      source: 'external',
      provider: 'clerk',
      type,
      eventId: data.id,
      payload: data,
    })

    // Write to debug log table (non-blocking)
    writeDebugLog({
      category: 'webhook',
      provider: 'clerk',
      type,
      path: '/api/webhooks/clerk',
      payload: data,
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

      case 'organization.created':
        await handleOrganizationCreated(data, logger)
        break

      // Organizations are managed in Clerk only - no DB sync needed
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
 * Creates user in DB and optionally creates Stripe customer + trial subscription
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

  // Get environment and trial plan config
  const env = getEnv()
  const container = createContainer(env)
  const trialPlan = env.plans.find((p) => p.type === 'trial')

  if (!trialPlan) {
    logger.warn({ message: 'No trial plan configured, creating user without subscription' })

    // Create user without Stripe customer
    const user = await db.user.create({
      data: {
        clerkId: clerkUserId,
        email,
      },
    })

    logger.info({
      message: 'User created in DB without trial',
      clerkUserId,
      dbUserId: user.id,
      email,
    })
    return
  }

  // Create Stripe customer
  logger.info({ message: 'Creating Stripe customer for trial', email })

  const { clients } = container.createRequestContext(new Headers())
  const customerResult = await clients.stripe.customers.createOrAttach({
    externalId: clerkUserId,
    email,
  })

  if (!customerResult.ok) {
    logger.error({
      message: 'Failed to create Stripe customer',
      error: customerResult.error,
    })

    // Create user without Stripe customer
    const user = await db.user.create({
      data: {
        clerkId: clerkUserId,
        email,
      },
    })

    logger.info({
      message: 'User created in DB without Stripe customer',
      clerkUserId,
      dbUserId: user.id,
    })
    return
  }

  const stripeCustomerId = customerResult.data.customer.id

  logger.info({
    message: 'Stripe customer created',
    stripeCustomerId,
  })

  // Create trial subscription
  logger.info({
    message: 'Creating trial subscription',
    priceId: trialPlan.stripePriceId,
    trialDays: trialPlan.trialDays,
  })

  const subscriptionResult = await clients.stripe.subscriptions.create({
    customerId: stripeCustomerId,
    priceId: trialPlan.stripePriceId,
    trialDays: trialPlan.trialDays,
    metadata: {
      clerkUserId,
      planCode: trialPlan.code,
      type: 'trial',
    },
  })

  if (!subscriptionResult.ok) {
    logger.error({
      message: 'Failed to create trial subscription',
      error: subscriptionResult.error,
    })

    // Create user with Stripe customer but without subscription
    const user = await db.user.create({
      data: {
        clerkId: clerkUserId,
        email,
        stripeCustomerId,
      },
    })

    logger.info({
      message: 'User created in DB with Stripe customer but no subscription',
      clerkUserId,
      dbUserId: user.id,
      stripeCustomerId,
    })
    return
  }

  const subscription = subscriptionResult.data.subscription

  logger.info({
    message: 'Trial subscription created',
    subscriptionId: subscription.id,
    status: subscription.status,
    trialEnd: subscription.trialEnd,
  })

  // Create user in DB with Stripe customer and subscription ID
  // Note: Subscription record will be created when user creates their first organization
  const user = await db.user.create({
    data: {
      clerkId: clerkUserId,
      email,
      stripeCustomerId,
    },
  })

  logger.info({
    message: 'User created with Stripe customer and trial subscription',
    clerkUserId,
    dbUserId: user.id,
    email,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    note: 'Subscription record will be created when user creates organization',
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

/**
 * Handle organization.created event
 * Links existing Stripe trial subscription to organization
 */
async function handleOrganizationCreated(data, logger) {
  const clerkOrgId = data.id
  const createdBy = data.created_by

  logger.info({
    message: 'Processing organization.created',
    clerkOrgId,
    createdBy,
  })

  if (!createdBy) {
    logger.warn({ message: 'Organization created without creator', clerkOrgId })
    return
  }

  // Find the user who created the organization
  const user = await db.user.findUnique({
    where: { clerkId: createdBy },
  })

  if (!user) {
    logger.warn({
      message: 'User not found for organization creator',
      createdBy,
      clerkOrgId,
    })
    return
  }

  // Check if user has a Stripe customer (trial subscription was created)
  if (!user.stripeCustomerId) {
    logger.info({
      message: 'User has no Stripe customer, skipping subscription link',
      userId: user.id,
      clerkOrgId,
    })
    return
  }

  // Get environment and container
  const env = getEnv()
  const container = createContainer(env)
  const { clients } = container.createRequestContext(new Headers())

  // Fetch Stripe subscriptions for this customer
  logger.info({
    message: 'Fetching Stripe subscriptions',
    stripeCustomerId: user.stripeCustomerId,
  })

  try {
    // List customer subscriptions from Stripe
    const response = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${user.stripeCustomerId}&status=trialing`,
      {
        headers: {
          Authorization: `Bearer ${env.stripeSecretKey}`,
        },
      }
    )

    const subscriptionsData = await response.json()

    if (!subscriptionsData.data || subscriptionsData.data.length === 0) {
      logger.info({
        message: 'No active trial subscriptions found',
        stripeCustomerId: user.stripeCustomerId,
      })
      return
    }

    // Get the first trial subscription
    const stripeSubscription = subscriptionsData.data[0]
    const trialPlan = env.plans.find((p) => p.type === 'trial')

    if (!trialPlan) {
      logger.warn({ message: 'No trial plan configured' })
      return
    }

    // Create subscription record in DB
    const now = new Date()
    const trialEnd = stripeSubscription.trial_end
      ? new Date(stripeSubscription.trial_end * 1000)
      : new Date(now.getTime() + trialPlan.trialDays * 24 * 60 * 60 * 1000)

    const subscription = await db.subscription.create({
      data: {
        userId: user.id,
        clerkOrgId,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: stripeSubscription.items.data[0].price.id,
        planCode: trialPlan.code,
        status: stripeSubscription.status,
        trialStart: stripeSubscription.trial_start
          ? new Date(stripeSubscription.trial_start * 1000)
          : now,
        trialEnd,
        currentPeriodStart: stripeSubscription.current_period_start
          ? new Date(stripeSubscription.current_period_start * 1000)
          : now,
        currentPeriodEnd: stripeSubscription.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000)
          : trialEnd,
      },
    })

    logger.info({
      message: 'Subscription linked to organization',
      subscriptionId: subscription.id,
      clerkOrgId,
      userId: user.id,
      stripeSubscriptionId: stripeSubscription.id,
    })
  } catch (error) {
    logger.error({
      message: 'Failed to link subscription to organization',
      error: error.message,
      clerkOrgId,
      userId: user.id,
    })
  }
}
