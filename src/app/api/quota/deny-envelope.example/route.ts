/**
 * POST /api/quota/deny-envelope.example
 * 
 * Example/documentation endpoint showing the standard 429 quota denial response format.
 * This endpoint always returns 429 with a standard denial envelope for reference.
 * 
 * This is not a real operational endpoint - it's for documentation and testing purposes.
 * 
 * Response: 429 with standard JSON + Retry-After header
 */

import { NextRequest, NextResponse } from "next/server";
import { requireHeaders } from "@/lib/utils/http/headers";
import { wrapError } from "@/lib/utils/http/envelope";

export async function POST(request: NextRequest) {
  const headers = requireHeaders(request);
  const correlationId = headers.correlationId;

  // Always return 429 with standard denial envelope
  return NextResponse.json(
    wrapError(
      "QUOTA_EXCEEDED",
      "Usage quota exceeded",
      {
        metric: "api_call",
        limit: 30,
        used: 30,
        remaining: 0,
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

