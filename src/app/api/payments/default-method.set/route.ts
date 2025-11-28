/**
 * POST /api/payments/default-method.set
 * 
 * Attaches a payment method to a Stripe customer and sets it as the default
 * payment method for invoices and renewals.
 * 
 * @module app/api/payments/default-method.set
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { attachDefaultPaymentMethod } from "@/lib/services/payments/payment-service";
import { setDefaultPaymentMethodRequestSchema } from "@/lib/api/payments/default-method-dto";
import { validateOrThrow, ValidationError } from "@/lib/utils/validation";
import { logger } from "@/lib/utils/logger";
import { toDomainError } from "@/lib/utils/errors";

/**
 * POST handler for setting default payment method
 * 
 * Flow:
 * 1. Validate and extract headers (x-request-id, x-correlation-id)
 * 2. Authenticate and extract Clerk org context
 * 3. Parse and validate request body (orgId, paymentMethodId)
 * 4. Attach and set default payment method via service layer
 * 5. Return success envelope
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

    requestLogger.info("Processing default payment method set request");

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
    
    const validated = validateOrThrow(setDefaultPaymentMethodRequestSchema, body);
    const { orgId, paymentMethodId } = validated;

    requestLogger.info("Request validated", { orgId, paymentMethodId });

    // Step 4: Attach and set default payment method
    const result = await attachDefaultPaymentMethod(orgId, paymentMethodId);

    requestLogger.info("Payment method attached and set as default", {
      orgId,
      paymentMethodId,
    });

    // Step 5: Return success envelope
    return NextResponse.json(
      wrapSuccess(result, correlationId),
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const domainError = toDomainError(error);
    
    logger.error("Default payment method set failed", {
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

