/**
 * Validation Utilities
 * 
 * Zod wrapper utilities for input validation with error mapping.
 * Converts Zod validation errors to standard envelope format.
 * 
 * @module lib/utils/validation
 */

import { z, ZodError, ZodSchema } from "zod";
import { ValidationError } from "./errors";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: ValidationError;
}

/**
 * Safely parses data against a Zod schema
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with typed data or error
 */
export function safeParseResponse<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }
  
  return {
    success: false,
    error: mapZodError(result.error),
  };
}

/**
 * Converts Zod validation error to ValidationError
 * 
 * @param error - Zod error
 * @returns ValidationError with formatted details
 */
export function mapZodError(error: ZodError): ValidationError {
  const details = error.errors.map((err) => ({
    path: err.path.join("."),
    message: err.message,
    code: err.code,
  }));
  
  const firstError = error.errors[0];
  const message = firstError
    ? `Validation failed at ${firstError.path.join(".")}: ${firstError.message}`
    : "Validation failed";
  
  return new ValidationError(message, { errors: details });
}

/**
 * Validates data against schema and throws on error
 * 
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws ValidationError if validation fails
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = safeParseResponse(schema, data);
  
  if (!result.success) {
    throw result.error;
  }
  
  return result.data;
}

