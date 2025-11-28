/**
 * POST /api/usage/seed
 * 
 * Seeds a usage counter for an organization based on their active subscription.
 * Initializes quotas so users can make API calls immediately.
 * 
 * @module app/api/usage/seed
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { seedUsageCounter } from "@/lib/services/usage/usage-service";
import { seedUsageRequestSchema } from "@/lib/api/usage/seed-dto";
import { validateOrThrow, ValidationError } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

/**
 * POST handler for seeding usage counter
 * 
 * Flow:
 * 1. Validate and extract headers (x-request-id, x-correlation-id)
 * 2. Authenticate and extract Clerk org context
 * 3. Parse and validate request body (orgId)
 * 4. Seed usage counter via service layer
 * 5. Return success envelope with periodKey and remaining quota
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

    requestLogger.info("Processing usage seed request");

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
    
    const validated = validateOrThrow(seedUsageRequestSchema, body);
    const { orgId } = validated;

    requestLogger.info("Request validated", { orgId });

    // Step 4: Seed usage counter
    const result = await seedUsageCounter(orgId);

    requestLogger.info("Usage counter seeded successfully", {
      orgId,
      periodKey: result.periodKey,
      remaining: result.remaining,
    });

    // Step 5: Return success envelope
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);
    
    logger.error("Usage seed failed", {
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

