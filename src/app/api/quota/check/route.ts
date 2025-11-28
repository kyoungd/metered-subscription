/**
 * POST /api/quota/check
 * 
 * Checks if quota is available for an organization.
 * Returns 200 if quota available, 429 if quota exceeded.
 * 
 * Authentication: Required (Clerk session with org context)
 * 
 * Response: 
 * - 200 {allow: true, remaining: number} if quota available
 * - 429 {allow: false, remaining: 0} if quota exceeded
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { logger } from "@/lib/utils/logger";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { toDomainError } from "@/lib/utils/errors";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { validateOrThrow } from "@/lib/utils/validation";
import { checkQuota } from "@/lib/services/quota/quota-service";
import {
  CheckQuotaRequestSchema,
  CheckQuotaResponse,
} from "@/lib/api/quota/quota-check-dto";
import { QuotaCounterNotFoundError } from "@/lib/errors/quota-errors";

export async function POST(request: NextRequest) {
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

    requestLogger.info("Processing quota check request");

    // Require authenticated session with org context
    const { clerkOrgId: authClerkOrgId } = await requireAuthWithOrg();
    clerkOrgId = authClerkOrgId;

    requestLogger.info("Authentication successful", { clerkOrgId });

    // Validate request body
    const { orgId: requestOrgId, metric } = await validateOrThrow(
      CheckQuotaRequestSchema,
      await request.json(),
      requestLogger
    );

    // Verify that request orgId matches authenticated orgId
    if (requestOrgId !== clerkOrgId) {
      requestLogger.warn("Request orgId does not match authenticated orgId", {
        requestOrgId,
        clerkOrgId,
      });
      return NextResponse.json(
        wrapError(
          "FORBIDDEN",
          "Organization ID in request does not match authenticated organization",
          {},
          correlationId
        ),
        { status: 403 }
      );
    }

    // Check quota
    const result: CheckQuotaResponse = await checkQuota(clerkOrgId, metric);

    requestLogger.info("Quota check completed", {
      clerkOrgId,
      metric,
      allow: result.allow,
      remaining: result.remaining,
    });

    // Return 200 if allowed, 429 if denied
    if (result.allow) {
      return NextResponse.json(wrapSuccess(result, correlationId), {
        status: 200,
      });
    } else {
      // Quota exceeded - return 429 with standard denial envelope
      return NextResponse.json(
        wrapError(
          "QUOTA_EXCEEDED",
          "Usage quota exceeded",
          {
            metric,
            remaining: result.remaining,
          },
          correlationId
        ),
        {
          status: 429,
          headers: {
            "Retry-After": "3600", // 1 hour - approximate time until next period
          },
        }
      );
    }
  } catch (error) {
    const domainError = toDomainError(error);

    // Handle quota counter not found as 429 (treat as no quota available)
    if (error instanceof QuotaCounterNotFoundError) {
      logger.warn("Quota counter not found, treating as quota exceeded", {
        request_id: requestId,
        correlation_id: correlationId,
        clerkOrgId,
        error: domainError.message,
      });

      return NextResponse.json(
        wrapError(
          "QUOTA_EXCEEDED",
          "Usage quota not available",
          {
            metric: "api_call",
            remaining: 0,
          },
          correlationId
        ),
        {
          status: 429,
          headers: {
            "Retry-After": "3600",
          },
        }
      );
    }

    logger.error("Failed to check quota", {
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

