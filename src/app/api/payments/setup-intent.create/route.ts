/**
 * POST /api/payments/setup-intent.create
 * 
 * Creates a Stripe SetupIntent for securely collecting payment methods.
 * Returns a client secret that can be used with Stripe.js on the frontend.
 * 
 * @module app/api/payments/setup-intent.create
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { createSetupIntent } from "@/lib/services/payments/payment-service";
import { createSetupIntentRequestSchema } from "@/lib/api/payments/setup-intent-dto";
import { validateOrThrow, ValidationError } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

/**
 * POST handler for creating SetupIntent
 * 
 * Flow:
 * 1. Validate and extract headers (x-request-id, x-correlation-id)
 * 2. Authenticate and extract Clerk org context
 * 3. Parse and validate request body (orgId)
 * 4. Create SetupIntent via service layer
 * 5. Return success envelope with client secret
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

    requestLogger.info("Processing SetupIntent creation request");

    // Step 2: Authenticate and extract Clerk org context
    const authContext = await requireAuthWithOrg();
    const { clerkOrgId } = authContext;

    requestLogger.info("Authentication successful", {
      clerkOrgId,
      userId: authContext.userId,
    });

    // Step 3: Parse and validate request body
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      throw new ValidationError("Invalid JSON in request body", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
    
    const validated = validateOrThrow(createSetupIntentRequestSchema, body);
    const { orgId } = validated;

    requestLogger.info("Request validated", { orgId });

    // Step 4: Create SetupIntent
    const result = await createSetupIntent(orgId);

    requestLogger.info("SetupIntent created successfully", {
      orgId,
      setupIntentId: result.clientSecret.substring(0, 20) + "...", // Log partial secret
    });

    // Step 5: Return success envelope
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);
    
    logger.error("SetupIntent creation failed", {
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

