/**
 * Webhook Processor Service
 * 
 * Business logic layer for processing Stripe webhook events.
 * Handles event routing, subscription synchronization, and state convergence.
 * 
 * @module lib/services/webhooks/webhook-processor-service
 */

import Stripe from "stripe";
import {
  findWebhookEvent,
  markWebhookProcessed,
} from "../../db/repositories/webhook-repository";
import {
  findSubscriptionByStripeSubscriptionId,
  updateSubscriptionFromStripe,
} from "../../db/repositories/subscription-repository";
import { logger } from "../../utils/logger";
import { ApplicationError } from "../../utils/errors";

export interface ProcessWebhookResult {
  converged: boolean;
}

/**
 * Processes a Stripe webhook event: routes to handler and updates DB state
 * 
 * Flow:
 * 1. Fetch event from WebhookQueue
 * 2. Check if already processed (skip if processed = true)
 * 3. Route by eventType to appropriate handler
 * 4. Update DB state to mirror Stripe
 * 5. Mark event as processed
 * 6. Return convergence result
 * 
 * @param eventId - Stripe event ID to process
 * @returns Process result with convergence status
 */
export async function processStripeWebhook(
  eventId: string
): Promise<ProcessWebhookResult> {
  logger.info("Processing Stripe webhook event", { eventId });

  // Step 1: Fetch event from WebhookQueue
  const webhookEvent = await findWebhookEvent(eventId);

  if (!webhookEvent) {
    throw new ApplicationError(
      `Webhook event not found: ${eventId}`,
      "WEBHOOK_EVENT_NOT_FOUND",
      404
    );
  }

  // Step 2: Check if already processed (idempotency)
  if (webhookEvent.processed) {
    logger.info("Webhook event already processed (idempotent)", {
      eventId,
      eventType: webhookEvent.eventType,
      processedAt: webhookEvent.processedAt,
    });
    return { converged: true };
  }

  logger.info("Processing webhook event", {
    eventId,
    eventType: webhookEvent.eventType,
  });

  // Step 3: Parse event payload
  const event = webhookEvent.payload as Stripe.Event;

  // Step 4: Route by eventType to appropriate handler
  try {
    switch (webhookEvent.eventType) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "customer.subscription.trial_will_end":
        await handleSubscriptionTrialWillEnd(event);
        break;
      default:
        logger.info("Unhandled webhook event type (no-op)", {
          eventId,
          eventType: webhookEvent.eventType,
        });
        // Don't throw error for unhandled events - just log and mark as processed
    }

    // Step 5: Mark event as processed
    await markWebhookProcessed(eventId);

    logger.info("Webhook event processed successfully", {
      eventId,
      eventType: webhookEvent.eventType,
    });

    // Step 6: Return convergence result
    return { converged: true };
  } catch (error) {
    logger.error("Failed to process webhook event", {
      eventId,
      eventType: webhookEvent.eventType,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't mark as processed if handler failed - allow retry
    throw error;
  }
}

/**
 * Handles customer.subscription.created event
 * 
 * @param event - Stripe event
 */
async function handleSubscriptionCreated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info("Handling subscription created", {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
  });
  // Subscription should already exist from Story 1.3
  // This handler is mainly for logging/auditing
}

/**
 * Handles customer.subscription.updated event
 * Updates subscription status, periods, and trial end date
 * 
 * @param event - Stripe event
 */
async function handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = subscription.id;

  logger.info("Handling subscription updated", {
    subscriptionId: stripeSubscriptionId,
    status: subscription.status,
  });

  // Find subscription in DB
  const dbSubscription = await findSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId
  );

  if (!dbSubscription) {
    logger.warn("Subscription not found in DB for update", {
      stripeSubscriptionId,
    });
    // Don't throw - subscription might be created elsewhere
    return;
  }

  // Update subscription from Stripe data
  const currentPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : dbSubscription.currentPeriodStart;

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : dbSubscription.currentPeriodEnd;

  const trialEndsAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  await updateSubscriptionFromStripe(stripeSubscriptionId, {
    status: subscription.status,
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt,
  });

  logger.info("Subscription updated from webhook", {
    subscriptionId: stripeSubscriptionId,
    status: subscription.status,
  });
}

/**
 * Handles customer.subscription.deleted event
 * Marks subscription as canceled
 * 
 * @param event - Stripe event
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const stripeSubscriptionId = subscription.id;

  logger.info("Handling subscription deleted", {
    subscriptionId: stripeSubscriptionId,
  });

  // Find subscription in DB
  const dbSubscription = await findSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId
  );

  if (!dbSubscription) {
    logger.warn("Subscription not found in DB for deletion", {
      stripeSubscriptionId,
    });
    return;
  }

  // Update subscription status to canceled
  await updateSubscriptionFromStripe(stripeSubscriptionId, {
    status: "canceled",
    currentPeriodStart: dbSubscription.currentPeriodStart,
    currentPeriodEnd: dbSubscription.currentPeriodEnd,
    trialEndsAt: dbSubscription.trialEndsAt,
  });

  logger.info("Subscription marked as canceled", {
    subscriptionId: stripeSubscriptionId,
  });
}

/**
 * Handles invoice.payment_succeeded event
 * 
 * @param event - Stripe event
 */
async function handleInvoicePaymentSucceeded(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  logger.info("Handling invoice payment succeeded", {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
  });
  // Payment succeeded - subscription should already be active
  // This handler is mainly for logging/auditing
}

/**
 * Handles invoice.payment_failed event
 * 
 * @param event - Stripe event
 */
async function handleInvoicePaymentFailed(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  logger.info("Handling invoice payment failed", {
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription,
  });
  // Payment failed - subscription status should be updated by subscription.updated event
  // This handler is mainly for logging/auditing
}

/**
 * Handles customer.subscription.trial_will_end event
 * 
 * @param event - Stripe event
 */
async function handleSubscriptionTrialWillEnd(event: Stripe.Event): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  logger.info("Handling subscription trial will end", {
    subscriptionId: subscription.id,
    trialEnd: subscription.trial_end,
  });
  // Trial ending soon - this handler is mainly for logging/notifications
  // Actual status change will come via subscription.updated event
}

