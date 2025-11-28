/**
 * Stripe Domain Errors
 * 
 * Domain-specific error classes for Stripe operations.
 * 
 * @module lib/errors/stripe-errors
 */

import { ApplicationError, ValidationError } from "../utils/errors";

/**
 * Stripe validation error
 * Thrown when Stripe input validation fails
 */
export class StripeValidationError extends ValidationError {
  constructor(message: string, details?: unknown) {
    super(message, details);
    this.name = "StripeValidationError";
  }
}

/**
 * Stripe customer creation error
 * Thrown when Stripe customer creation fails
 */
export class StripeCustomerCreationError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super(message, "STRIPE_CUSTOMER_CREATION_ERROR", 500, details);
    this.name = "StripeCustomerCreationError";
  }
}

/**
 * Stripe API error
 * Thrown when Stripe API calls fail
 */
export class StripeApiError extends ApplicationError {
  constructor(message: string, details?: unknown) {
    super(message, "STRIPE_API_ERROR", 502, details);
    this.name = "StripeApiError";
  }
}

/**
 * Organization not found error for Stripe operations
 */
export class StripeOrgNotFoundError extends ApplicationError {
  constructor(message: string = "Organization not found") {
    super(message, "ORG_NOT_FOUND", 404);
    this.name = "StripeOrgNotFoundError";
  }
}

