/**
 * Webhook Intake Service
 * 
 * Business logic layer for webhook intake operations.
 * Handles webhook verification, idempotency, and enqueueing.
 * 
 * @module lib/services/webhooks/webhook-intake-service
 */

import Stripe from "stripe";
import { verifyStripeWebhookSignature } from "../../utils/webhooks/stripe-webhook-verification";
import {
  upsertWebhookEvent,
  findWebhookEvent,
} from "../../db/repositories/webhook-repository";
import { logger } from "../../utils/logger";
import { ApplicationError } from "../../utils/errors";

export interface WebhookIntakeResult {
  queued: boolean;
  eventId: string;
}

/**
 * Processes a Stripe webhook event: verifies signature, checks idempotency, and enqueues
 * 
 * Flow:
 * 1. Verify Stripe webhook signature
 * 2. Check if event already exists (idempotency)
 * 3. If new, enqueue event to WebhookQueue
 * 4. Return result with eventId
 * 
 * @param body - Raw request body (string or Buffer)
 * @param signature - Stripe signature header value
 * @returns Webhook intake result with queued status and eventId
 */
export async function processStripeWebhookIntake(
  body: string | Buffer,
  signature: string
): Promise<WebhookIntakeResult> {
  logger.info("Processing Stripe webhook intake", {
    signatureLength: signature.length,
    bodyLength: typeof body === "string" ? body.length : body.length,
  });

  // Step 1: Verify Stripe webhook signature
  let event: Stripe.Event;
  try {
    event = verifyStripeWebhookSignature(body, signature);
    logger.info("Webhook signature verified", {
      eventId: event.id,
      eventType: event.type,
    });
  } catch (error) {
    logger.error("Webhook signature verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Re-throw UnauthorizedError
  }

  // Step 2: Check if event already exists (idempotency)
  const existingEvent = await findWebhookEvent(event.id);
  
  if (existingEvent) {
    logger.info("Webhook event already exists (idempotent)", {
      eventId: event.id,
      eventType: event.type,
      processed: existingEvent.processed,
    });
    
    // Return existing event (idempotent response)
    return {
      queued: true,
      eventId: event.id,
    };
  }

  // Step 3: Enqueue new event to WebhookQueue
  try {
    await upsertWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      payload: event,
    });

    logger.info("Webhook event enqueued successfully", {
      eventId: event.id,
      eventType: event.type,
    });

    // Step 4: Return result
    return {
      queued: true,
      eventId: event.id,
    };
  } catch (error) {
    logger.error("Failed to enqueue webhook event", {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ApplicationError(
      "WEBHOOK_ENQUEUE_ERROR",
      `Failed to enqueue webhook event: ${event.id}`,
      500,
      { originalError: error }
    );
  }
}

