/**
 * POST /api/stripe/customer.ensure
 * 
 * Ensures a Stripe customer exists for the organization.
 * Idempotent operation - returns existing customer ID if already created.
 * 
 * @module app/api/stripe/customer.ensure
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { ensureCustomer } from "@/lib/services/stripe/stripe-customer-service";
import { ensureCustomerRequestSchema } from "@/lib/api/stripe/ensure-customer-dto";
import { validateOrThrow } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError, ValidationError } from "@/lib/utils/errors";

/**
 * POST handler for ensuring Stripe customer
 * 
 * Flow:
 * 1. Validate and extract headers (x-request-id, x-correlation-id)
 * 2. Authenticate and extract Clerk org context
 * 3. Parse and validate request body (orgId, email)
 * 4. Ensure Stripe customer via service layer
 * 5. Return success envelope with stripeCustomerId
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

    requestLogger.info("Processing Stripe customer ensure request");

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
    
    const validated = validateOrThrow(ensureCustomerRequestSchema, body);
    const { orgId, email } = validated;

    requestLogger.info("Request validated", { orgId, email });

    // Step 4: Ensure Stripe customer
    const result = await ensureCustomer(orgId, email);

    requestLogger.info("Stripe customer ensured successfully", {
      orgId,
      email,
      stripeCustomerId: result.stripeCustomerId,
    });

    // Step 5: Return success envelope
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);
    
    logger.error("Stripe customer ensure failed", {
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

