/**
 * Entitlements Errors
 * 
 * Custom error classes for entitlements operations.
 * 
 * @module lib/errors/entitlements-errors
 */

import { ApplicationError, NotFoundError } from "../utils/errors";

/**
 * Error thrown when organization is not found
 */
export class EntitlementsOrgNotFoundError extends NotFoundError {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementsOrgNotFoundError";
  }
}

/**
 * Error thrown when no active subscription is found
 */
export class EntitlementsNoActiveSubscriptionError extends NotFoundError {
  constructor(message: string) {
    super(message);
    this.name = "EntitlementsNoActiveSubscriptionError";
  }
}

