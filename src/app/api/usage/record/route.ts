/**
 * POST /api/usage/record
 * 
 * Records usage for an organization with idempotency via request_id.
 * 
 * Authentication: Required (Clerk session with org context)
 * 
 * Response: 200 {periodKey, used, remaining}
 * Idempotency: Duplicate request_id returns identical response
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { logger } from "@/lib/utils/logger";
import { wrapSuccess, wrapError } from "@/lib/utils/http/envelope";
import { toDomainError } from "@/lib/utils/errors";
import { requireAuthWithOrg } from "@/lib/middleware/auth";
import { validateOrThrow } from "@/lib/utils/validation";
import { recordUsage } from "@/lib/services/usage/usage-recording-service";
import {
  RecordUsageRequestSchema,
  RecordUsageResponse,
} from "@/lib/api/usage/record-usage-dto";

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

    requestLogger.info("Processing usage recording request");

    // Require authenticated session with org context
    const { clerkOrgId: authClerkOrgId } = await requireAuthWithOrg();
    clerkOrgId = authClerkOrgId;

    requestLogger.info("Authentication successful", { clerkOrgId });

    // Validate request body
    const {
      orgId: requestOrgId,
      metric,
      value,
      occurredAt: occurredAtString,
      request_id: usageRequestId,
    } = await validateOrThrow(
      RecordUsageRequestSchema,
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

    // Parse occurredAt (handle both string and Date)
    const occurredAt =
      occurredAtString instanceof Date
        ? occurredAtString
        : new Date(occurredAtString);

    // Record usage
    const result: RecordUsageResponse = await recordUsage(
      clerkOrgId,
      metric,
      value,
      occurredAt,
      usageRequestId
    );

    requestLogger.info("Usage recorded successfully", {
      clerkOrgId,
      metric,
      value,
      periodKey: result.periodKey,
      used: result.used,
      remaining: result.remaining,
      request_id: usageRequestId,
    });

    return NextResponse.json(wrapSuccess(result, correlationId), {
      status: 200,
    });
  } catch (error) {
    const domainError = toDomainError(error);

    logger.error("Failed to record usage", {
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

