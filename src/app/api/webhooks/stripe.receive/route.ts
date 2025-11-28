/**
 * POST /api/webhooks/stripe.receive
 *
 * Receives and enqueues Stripe webhook events.
 * This endpoint is called by Stripe when events occur (subscription updates, payments, etc.).
 *
 * Flow:
 * 1. Read raw request body (not JSON)
 * 2. Extract Stripe signature header
 * 3. Verify signature and parse event
 * 4. Check idempotency (event already processed?)
 * 5. Enqueue event to WebhookQueue
 * 6. Return 202 Accepted with eventId
 *
 * @module app/api/webhooks/stripe.receive
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { processStripeWebhookIntake } from "@/lib/services/webhooks/webhook-intake-service";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { generateId } from "@/lib/utils/ids";

/**
 * POST handler for receiving Stripe webhooks
 *
 * Important: This endpoint accepts RAW body (not JSON) because Stripe webhook
 * signature verification requires the exact raw body bytes.
 *
 * @param request - Next.js request object
 * @returns JSON response with 202 Accepted status
 */
export async function POST(request: NextRequest) {
  // Extract correlation ID from headers if present, otherwise generate one
  let correlationId = "";
  try {
    const headersList = await headers();
    correlationId = headersList.get("x-correlation-id") || generateId();
  } catch {
    correlationId = generateId();
  }

  try {
    // Step 1: Read raw request body (not JSON)
    // Stripe signature verification requires the exact raw body
    const body = await request.text();

    if (!body) {
      return NextResponse.json(
        wrapError(
          "VALIDATION_ERROR",
          "Request body is required",
          {},
          correlationId
        ),
        { status: 400 }
      );
    }

    // Step 2: Extract Stripe signature header
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      logger.warn("Stripe webhook received without signature header");
      return NextResponse.json(
        wrapError(
          "VALIDATION_ERROR",
          "Missing stripe-signature header",
          {},
          correlationId
        ),
        { status: 400 }
      );
    }

    logger.info("Received Stripe webhook", {
      bodyLength: body.length,
      hasSignature: !!signature,
    });

    // Step 3-5: Process webhook intake (verify, check idempotency, enqueue)
    const result = await processStripeWebhookIntake(body, signature);

    logger.info("Stripe webhook processed successfully", {
      eventId: result.eventId,
      queued: result.queued,
    });

    // Step 6: Return 202 Accepted with eventId
    return NextResponse.json(wrapSuccess(result, correlationId), {
      status: 202,
    });
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);

    logger.error("Stripe webhook processing failed", {
      correlation_id: correlationId,
      error: domainError.message,
      code: domainError.code,
    });

    // Return appropriate status code based on error type
    const statusCode = domainError.statusCode === 401 ? 401 : 500;

    return NextResponse.json(
      wrapError(
        domainError.code,
        domainError.message,
        domainError.details,
        correlationId
      ),
      { status: statusCode }
    );
  }
}
