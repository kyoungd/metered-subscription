/**
 * GET /api/me/entitlements.read
 * 
 * Returns the current plan, quota, and consumption for the authenticated user's organization.
 * 
 * Authentication: Required (Clerk session with org context)
 * 
 * Response: 200 {planCode, included, used, remaining, periodKey}
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { logger } from "@/lib/utils/logger";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { toDomainError } from "@/lib/utils/errors";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { getEntitlements } from "@/lib/services/entitlements/entitlements-service";
import { GetEntitlementsResponse } from "@/lib/api/entitlements/entitlements-dto";

export async function GET(request: NextRequest) {
  let correlationId = "";
  let requestId = "";
  let clerkOrgId = "";

  try {
    const headers = requireHeaders(request);
    correlationId = headers.correlationId;
    requestId = headers.requestId;

    const requestLogger = logger.child({
      request_id: requestId,
      correlation_id: correlationId,
    });

    requestLogger.info("Processing entitlements read request");

    // Require authenticated session with org context
    const { clerkOrgId: authClerkOrgId } = await requireAuthWithOrg();
    clerkOrgId = authClerkOrgId;

    requestLogger.info("Authentication successful", { clerkOrgId });

    // Get entitlements
    const result: GetEntitlementsResponse = await getEntitlements(clerkOrgId);

    requestLogger.info("Entitlements retrieved successfully", {
      clerkOrgId,
      planCode: result.planCode,
      periodKey: result.periodKey,
    });

    return NextResponse.json(wrapSuccess(result, correlationId), {
      status: 200,
    });
  } catch (error) {
    const domainError = toDomainError(error);

    logger.error("Failed to get entitlements", {
      request_id: requestId,
      correlation_id: correlationId,
      clerkOrgId,
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

