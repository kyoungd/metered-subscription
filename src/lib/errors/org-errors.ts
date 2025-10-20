/**
 * Organization Domain Errors
 * 
 * Domain-specific error classes for organization operations.
 * 
 * @module lib/errors/org-errors
 */

import { ApplicationError, ValidationError } from "../utils/errors";

/**
 * Organization validation error
 * Thrown when organization input validation fails
 */
export class OrgValidationError extends ValidationError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "OrgValidationError";
  }
}

/**
 * Organization creation error
 * Thrown when organization creation fails
 */
export class OrgCreationError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super(message, "ORG_CREATION_ERROR", 500, details);
    this.name = "OrgCreationError";
  }
}

/**
 * Organization not found error
 */
export class OrgNotFoundError extends ApplicationError {
  constructor(message: string = "Organization not found") {
    super(message, "ORG_NOT_FOUND", 404);
    this.name = "OrgNotFoundError";
  }
}

