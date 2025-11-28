/**
 * Stripe Webhook Verification
 * 
 * Utilities for verifying Stripe webhook signatures.
 * Ensures webhooks are authentic and from Stripe.
 * 
 * @module lib/utils/webhooks/stripe-webhook-verification
 */

import Stripe from "stripe";
import { stripe } from "../../stripe";
import { env } from "../../env";
import { UnauthorizedError } from "../../utils/errors";

/**
 * Verifies a Stripe webhook signature
 * 
 * Uses Stripe SDK's constructEvent method which handles signature verification.
 * 
 * @param body - Raw request body (string or Buffer)
 * @param signature - Stripe signature header value
 * @returns Parsed and verified Stripe event
 * @throws UnauthorizedError if signature is invalid
 */
export function verifyStripeWebhookSignature(
  body: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new UnauthorizedError(
      "STRIPE_WEBHOOK_SECRET is not configured",
      { code: "WEBHOOK_SECRET_MISSING" }
    );
  }

  try {
    // Stripe SDK's constructEvent verifies the signature and parses the event
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
    return event;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new UnauthorizedError(
      `Invalid Stripe webhook signature: ${errorMessage}`,
      { code: "INVALID_WEBHOOK_SIGNATURE", originalError: errorMessage }
    );
  }
}

