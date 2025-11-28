/**
 * POST /api/stigg/provision
 * 
 * Provisions a subscription in Stigg for feature flagging and plan management.
 * This is a "soft" dependency - failures are logged but don't fail the transaction.
 * 
 * @module app/api/stigg/provision
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { provisionSubscription } from "@/lib/services/stigg/stigg-service";
import { provisionRequestSchema } from "@/lib/api/stigg/provision-dto";
import { validateOrThrow, ValidationError } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

/**
 * POST handler for provisioning subscription in Stigg
 * 
 * Flow:
 * 1. Validate and extract headers (x-request-id, x-correlation-id)
 * 2. Authenticate and extract Clerk org context
 * 3. Parse and validate request body (orgId, subscriptionId)
 * 4. Provision subscription via service layer (soft dependency - always returns success)
 * 5. Return success envelope
 * 
 * @param request - Next.js request object
 * @returns JSON response with success envelope
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

    requestLogger.info("Processing Stigg provision request");

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
    
    const validated = validateOrThrow(provisionRequestSchema, body);
    const { orgId, subscriptionId } = validated;

    requestLogger.info("Request validated", { orgId, subscriptionId });

    // Step 4: Provision subscription (soft dependency - always succeeds)
    const result = await provisionSubscription(orgId, subscriptionId);

    requestLogger.info("Stigg provision completed", {
      orgId,
      subscriptionId,
      provisioned: result.provisioned,
    });

    // Step 5: Return success envelope (always 200, even if Stigg failed)
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling - only validation/auth errors should reach here
    const domainError = toDomainError(error);
    
    logger.error("Stigg provision request failed", {
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

