/**
 * Error Utilities
 * 
 * Base error classes and error normalization utilities.
 * Provides consistent error handling across the application.
 * 
 * @module lib/utils/errors
 */

import { ErrorEnvelope } from "./http/envelope";

/**
 * Base application error class
 */
export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends ApplicationError {
  constructor(message: string = "Unauthorized") {
    super(message, "UNAUTHORIZED", 401);
  }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApplicationError {
  constructor(message: string = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApplicationError {
  constructor(message: string = "Not found") {
    super(message, "NOT_FOUND", 404);
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super(message, "CONFLICT", 409, details);
  }
}

/**
 * Internal server error (500)
 */
export class InternalServerError extends ApplicationError {
  constructor(message: string = "Internal server error", details?: unknown) {
    super(message, "INTERNAL_SERVER_ERROR", 500, details);
  }
}

/**
 * Normalizes any error to domain error format
 * 
 * @param error - Error to normalize
 * @returns ApplicationError instance
 */
export function toDomainError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new InternalServerError(error.message, {
      originalError: error.name,
      stack: error.stack,
    });
  }
  
  return new InternalServerError("An unknown error occurred", {
    originalError: String(error),
  });
}

/**
 * Converts ApplicationError to error envelope format
 * 
 * @param error - Application error
 * @param correlationId - Request correlation ID
 * @returns Error envelope object (without correlationId wrapper)
 */
export function toErrorEnvelopeData(error: ApplicationError, correlationId: string): ErrorEnvelope {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined && { details: error.details }),
    },
    correlationId,
  };
}

