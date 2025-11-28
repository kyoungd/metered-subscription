/**
 * POST /api/stripe/subscription.create
 * 
 * Creates a trial subscription for an organization.
 * Creates subscription in Stripe and persists to local database.
 * 
 * @module app/api/stripe/subscription.create
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { createSubscriptionForOrganization } from "@/lib/services/stripe/stripe-subscription-service";
import { createSubscriptionRequestSchema } from "@/lib/api/stripe/create-subscription-dto";
import { validateOrThrow, ValidationError } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

/**
 * POST handler for creating subscription
 * 
 * Flow:
 * 1. Validate and extract headers (x-request-id, x-correlation-id)
 * 2. Authenticate and extract Clerk org context
 * 3. Parse and validate request body (orgId, planCode)
 * 4. Create subscription via service layer
 * 5. Return success envelope with subscription details
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

    requestLogger.info("Processing subscription creation request");

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
    
    const validated = validateOrThrow(createSubscriptionRequestSchema, body);
    const { orgId, planCode } = validated;

    requestLogger.info("Request validated", { orgId, planCode });

    // Step 4: Create subscription
    const result = await createSubscriptionForOrganization(orgId, planCode);

    requestLogger.info("Subscription created successfully", {
      orgId,
      planCode,
      subscriptionId: result.subscriptionId,
      status: result.status,
    });

    // Step 5: Return success envelope
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);
    
    logger.error("Subscription creation failed", {
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

