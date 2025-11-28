/**
 * Quota Errors
 * 
 * Custom error classes for quota operations.
 * 
 * @module lib/errors/quota-errors
 */

import { ApplicationError, NotFoundError } from "../utils/errors";

/**
 * Error thrown when organization is not found
 */
export class QuotaOrgNotFoundError extends NotFoundError {
  constructor(message: string) {
    super(message);
    this.name = "QuotaOrgNotFoundError";
  }
}

/**
 * Error thrown when no active subscription is found
 */
export class QuotaNoActiveSubscriptionError extends NotFoundError {
  constructor(message: string) {
    super(message);
    this.name = "QuotaNoActiveSubscriptionError";
  }
}

/**
 * Error thrown when usage counter is not found
 */
export class QuotaCounterNotFoundError extends NotFoundError {
  constructor(message: string) {
    super(message);
    this.name = "QuotaCounterNotFoundError";
  }
}

