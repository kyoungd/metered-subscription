/**
 * HTTP Response Envelope Utilities
 * 
 * Provides standard success and error envelope formats for API responses.
 * All responses include a correlationId for request tracing.
 * 
 * @module lib/utils/http/envelope
 */

export interface SuccessEnvelope<T = unknown> {
  data: T;
  correlationId: string;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  correlationId: string;
}

/**
 * Wraps successful response data in standard envelope format
 * 
 * @param data - Response payload
 * @param correlationId - Request correlation ID for tracing
 * @returns Standard success envelope
 */
export function wrapSuccess<T>(data: T, correlationId: string): SuccessEnvelope<T> {
  return {
    data,
    correlationId,
  };
}

/**
 * Wraps error information in standard envelope format
 * 
 * @param code - Error code (e.g., 'VALIDATION_ERROR', 'UNAUTHORIZED')
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @param correlationId - Request correlation ID for tracing
 * @returns Standard error envelope
 */
export function wrapError(
  code: string,
  message: string,
  details: unknown | undefined,
  correlationId: string
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
    correlationId,
  };
}

