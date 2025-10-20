/**
 * HTTP Header Utilities
 * 
 * Validates and auto-generates required headers for API requests.
 * Ensures all requests have x-request-id and x-correlation-id for tracing.
 * 
 * @module lib/utils/http/headers
 */

import { randomUUID } from "crypto";

export const HEADER_REQUEST_ID = "x-request-id";
export const HEADER_CORRELATION_ID = "x-correlation-id";

export interface RequiredHeaders {
  requestId: string;
  correlationId: string;
}

/**
 * Validates and extracts required headers from request
 * Auto-generates UUIDv4 values if headers are missing
 * 
 * @param request - Next.js Request object
 * @returns Object containing requestId and correlationId
 */
export function requireHeaders(request: Request): RequiredHeaders {
  const headers = request.headers;
  
  const requestId = headers.get(HEADER_REQUEST_ID) || randomUUID();
  const correlationId = headers.get(HEADER_CORRELATION_ID) || randomUUID();
  
  return {
    requestId,
    correlationId,
  };
}

