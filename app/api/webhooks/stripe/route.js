import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { db } from '@/lib/scaffold/db.js'
import { getEnv } from '@/lib/scaffold/config.js'
import { createContainer } from '@/lib/scaffold/di.js'

export async function POST(req) {
  let logger

  try {
    // Setup logging infrastructure
    const env = getEnv()
    const container = createContainer(env)
    const headersList = await headers()
    const ctx = container.createRequestContext(headersList)
    logger = ctx.logger

    const body = await req.text()
    const signature = headersList.get('Stripe-Signature')

    if (!signature) {
      logger.error('Missing Stripe-Signature header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    let event

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      )

      logger.info({
        message: 'Stripe webhook received',
        type: event.type,
        eventId: event.id,
        apiVersion: event.api_version,
      })

      // Log full event data for debugging integrations
      logger.debug({
        message: 'Stripe webhook full payload',
        type: event.type,
        eventId: event.id,
        eventData: JSON.stringify(event.data.object, null, 2),
      })
    } catch (err) {
      logger.error({
        message: 'Stripe webhook signature verification failed',
        error: err.message,
      })
      return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
    }

    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object, logger)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, logger)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, logger)
        break

      case 'customer.created':
        await handleCustomerCreated(event.data.object, logger)
        break

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object, logger)
        break

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object, logger)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, logger)
        break

      default:
        logger.warn({
          message: 'Unhandled Stripe webhook event type',
          type: event.type,
          eventId: event.id,
        })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    if (logger) {
      logger.error({
        message: 'Stripe webhook processing failed',
        error: error.message,
        stack: error.stack,
      })
    }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

/**
 * Handle customer.created event
 * Links Stripe customer to user (owner/admin who pays)
 */
async function handleCustomerCreated(customer, logger) {
  logger.info({
    message: 'Processing customer.created',
    customerId: customer.id,
    email: customer.email,
    hasMetadata: !!customer.metadata,
  })

  // Customer should have been created with userId in metadata
  if (!customer.metadata?.userId) {
    logger.warn({
      message: 'Customer created without userId metadata',
      customerId: customer.id,
      email: customer.email,
    })
    return
  }

  // Update user with Stripe customer ID
  const user = await db.user.findUnique({
    where: { id: customer.metadata.userId },
  })

  if (!user) {
    logger.error({
      message: 'User not found for Stripe customer',
      customerId: customer.id,
      userId: customer.metadata.userId,
    })
    return
  }

  if (user.stripeCustomerId && user.stripeCustomerId !== customer.id) {
    logger.warn({
      message: 'User already has different Stripe customer',
      userId: user.id,
      existingCustomerId: user.stripeCustomerId,
      newCustomerId: customer.id,
    })
  }

  await db.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  })

  logger.info({
    message: 'User linked to Stripe customer',
    userId: user.id,
    customerId: customer.id,
  })
}

/**
 * Handle customer.updated event
 */
async function handleCustomerUpdated(customer, logger) {
  logger.info({
    message: 'Processing customer.updated',
    customerId: customer.id,
    email: customer.email,
  })

  // Find user by Stripe customer ID
  const user = await db.user.findUnique({
    where: { stripeCustomerId: customer.id },
  })

  if (!user) {
    logger.warn({
      message: 'User not found for Stripe customer',
      customerId: customer.id,
    })
    return
  }

  logger.info({
    message: 'Customer update processed',
    customerId: customer.id,
    userId: user.id,
  })
}

/**
 * Handle subscription.created event
 */
async function handleSubscriptionCreated(subscription, logger) {
  logger.info({
    message: 'Processing subscription.created',
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
    priceId: subscription.items.data[0]?.price.id,
  })

  // Find user by Stripe customer ID (owner who pays)
  const user = await db.user.findUnique({
    where: { stripeCustomerId: subscription.customer },
    include: { subscriptions: true },
  })

  if (!user) {
    logger.error({
      message: 'User not found for subscription',
      customerId: subscription.customer,
      subscriptionId: subscription.id,
    })
    return
  }

  // Get clerkOrgId and plan code from metadata
  const clerkOrgId = subscription.metadata?.clerkOrgId
  const planCode = subscription.metadata?.planCode || 'starter'

  if (!clerkOrgId) {
    logger.warn({
      message: 'Subscription created without clerkOrgId in metadata',
      subscriptionId: subscription.id,
      userId: user.id,
    })
  }

  logger.info({
    message: 'User found for subscription',
    userId: user.id,
    clerkOrgId,
    existingSubscriptions: user.subscriptions.length,
  })

  const createdSubscription = await db.subscription.create({
    data: {
      userId: user.id,
      clerkOrgId: clerkOrgId || '',
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0].price.id,
      planCode,
      status: subscription.status,
      trialStart: subscription.trial_start
        ? new Date(subscription.trial_start * 1000)
        : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    },
  })

  logger.info({
    message: 'Subscription created in DB',
    subscriptionId: subscription.id,
    dbSubscriptionId: createdSubscription.id,
    userId: user.id,
    clerkOrgId,
    planCode,
    status: subscription.status,
    isTrialing: !!subscription.trial_end,
  })
}

/**
 * Handle subscription.updated event
 */
async function handleSubscriptionUpdated(subscription, logger) {
  logger.info({
    message: 'Processing subscription.updated',
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  })

  const existingSubscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { organization: true },
  })

  if (!existingSubscription) {
    logger.warn({
      message: 'Subscription not found in DB, treating as create',
      subscriptionId: subscription.id,
    })
    await handleSubscriptionCreated(subscription, logger)
    return
  }

  logger.info({
    message: 'Existing subscription found',
    dbSubscriptionId: existingSubscription.id,
    userId: existingSubscription.userId,
    clerkOrgId: existingSubscription.clerkOrgId,
    previousStatus: existingSubscription.status,
    newStatus: subscription.status,
  })

  const updatedSubscription = await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status,
      stripePriceId: subscription.items.data[0].price.id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
  })

  logger.info({
    message: 'Subscription updated in DB',
    subscriptionId: subscription.id,
    dbSubscriptionId: updatedSubscription.id,
    statusChange: `${existingSubscription.status} -> ${subscription.status}`,
  })
}

/**
 * Handle subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription, logger) {
  logger.info({
    message: 'Processing subscription.deleted',
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  })

  const existingSubscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { organization: true },
  })

  if (!existingSubscription) {
    logger.warn({
      message: 'Subscription not found in DB',
      subscriptionId: subscription.id,
    })
    return
  }

  logger.info({
    message: 'Subscription found, marking as canceled',
    dbSubscriptionId: existingSubscription.id,
    userId: existingSubscription.userId,
    clerkOrgId: existingSubscription.clerkOrgId,
    previousStatus: existingSubscription.status,
  })

  await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: 'canceled',
      canceledAt: new Date(),
    },
  })

  logger.info({
    message: 'Subscription canceled in DB',
    subscriptionId: subscription.id,
    userId: existingSubscription.userId,
    clerkOrgId: existingSubscription.clerkOrgId,
  })
}

/**
 * Handle invoice.paid event
 */
async function handleInvoicePaid(invoice, logger) {
  logger.info({
    message: 'Processing invoice.paid',
    invoiceId: invoice.id,
    customerId: invoice.customer,
    subscriptionId: invoice.subscription,
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
  })

  if (!invoice.subscription) {
    logger.info({
      message: 'Invoice not associated with subscription, skipping',
      invoiceId: invoice.id,
    })
    return
  }

  // Find subscription and user
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
    include: { user: true },
  })

  if (!subscription) {
    logger.warn({
      message: 'Subscription not found for invoice',
      subscriptionId: invoice.subscription,
      invoiceId: invoice.id,
    })
    return
  }

  logger.info({
    message: 'Invoice payment recorded',
    invoiceId: invoice.id,
    userId: subscription.userId,
    clerkOrgId: subscription.clerkOrgId,
    subscriptionId: subscription.id,
    amountPaid: invoice.amount_paid / 100,
    billingReason: invoice.billing_reason,
  })
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(invoice, logger) {
  logger.error({
    message: 'Processing invoice.payment_failed',
    invoiceId: invoice.id,
    customerId: invoice.customer,
    subscriptionId: invoice.subscription,
    amountDue: invoice.amount_due,
    attemptCount: invoice.attempt_count,
  })

  if (!invoice.subscription) {
    logger.info({
      message: 'Invoice not associated with subscription, skipping',
      invoiceId: invoice.id,
    })
    return
  }

  // Find subscription and user
  const subscription = await db.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
    include: { user: true },
  })

  if (!subscription) {
    logger.warn({
      message: 'Subscription not found for failed invoice',
      subscriptionId: invoice.subscription,
      invoiceId: invoice.id,
    })
    return
  }

  logger.error({
    message: 'Payment failure recorded for user/organization',
    invoiceId: invoice.id,
    userId: subscription.userId,
    userEmail: subscription.user.email,
    clerkOrgId: subscription.clerkOrgId,
    subscriptionId: subscription.id,
    amountDue: invoice.amount_due / 100,
    attemptCount: invoice.attempt_count,
    note: 'User/organization may need notification or access restriction',
  })
}
