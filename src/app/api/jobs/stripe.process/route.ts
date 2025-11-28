/**
 * POST /api/jobs/stripe.process
 *
 * Processes a Stripe webhook event from the queue.
 * This endpoint is called by background job processors to apply webhook event effects to the database.
 *
 * Flow:
 * 1. Validate request body (eventId)
 * 2. Process webhook event via service layer
 * 3. Return convergence result
 *
 * @module app/api/jobs/stripe.process
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { processStripeWebhook } from "@/lib/services/webhooks/webhook-processor-service";
import { processWebhookRequestSchema } from "@/lib/api/webhooks/process-webhook-dto";
import { validateOrThrow, ValidationError } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

/**
 * POST handler for processing Stripe webhook events
 *
 * @param request - Next.js request object
 * @returns JSON response with success or error envelope
 */
export async function POST(request: NextRequest) {
  let correlationId = "";
  let requestId = "";

  try {
    // Step 1: Validate/extract headers
    const headers = requireHeaders(request);
    correlationId = headers.correlationId;
    requestId = headers.requestId;

    const requestLogger = logger.child({
      request_id: requestId,
      correlation_id: correlationId,
    });

    requestLogger.info("Processing Stripe webhook event");

    // Step 2: Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ValidationError("Invalid JSON in request body", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }

    const validated = validateOrThrow(processWebhookRequestSchema, body);
    const { eventId } = validated;

    requestLogger.info("Request validated", { eventId });

    // Step 3: Process webhook event
    const result = await processStripeWebhook(eventId);

    requestLogger.info("Webhook event processed successfully", {
      eventId,
      converged: result.converged,
    });

    // Step 4: Return success envelope
    return NextResponse.json(wrapSuccess(result, correlationId), {
      status: 200,
    });
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);

    logger.error("Webhook processing failed", {
      request_id: requestId,
      correlation_id: correlationId,
      error: domainError.message,
      code: domainError.code,
    });

    return NextResponse.json(
      wrapError(
        domainError.code,
        domainError.message,
        domainError.details,
        correlationId
      ),
      { status: domainError.statusCode }
    );
  }
}

