/**
 * Stripe Customer Service
 * 
 * Business logic layer for Stripe customer operations.
 * Handles customer creation, lookup, and synchronization with local database.
 * 
 * @module lib/services/stripe/stripe-customer-service
 */

import { stripe } from "../../stripe";
import { findOrganizationById, updateOrganizationStripeCustomerId } from "../../db/repositories/org-repository";
import {
  StripeCustomerCreationError,
  StripeApiError,
  StripeOrgNotFoundError,
} from "../../errors/stripe-errors";
import { logger } from "../../utils/logger";
import Stripe from "stripe";

export interface EnsureCustomerResult {
  stripeCustomerId: string;
}

/**
 * Searches for a Stripe customer by email
 * 
 * @param email - Email address to search for
 * @returns Stripe Customer ID if found, null otherwise
 */
async function searchStripeCustomerByEmail(email: string): Promise<string | null> {
  try {
    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (customers.data.length > 0) {
      return customers.data[0].id;
    }

    return null;
  } catch (error) {
    logger.error("Failed to search Stripe customer by email", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StripeApiError(
      `Failed to search Stripe customer: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Creates a new Stripe customer
 * 
 * @param email - Customer email
 * @param orgId - Internal organization ID for metadata
 * @returns Created Stripe customer ID
 */
async function createStripeCustomer(
  email: string,
  orgId: string
): Promise<string> {
  try {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        orgId,
      },
    });

    return customer.id;
  } catch (error) {
    logger.error("Failed to create Stripe customer", {
      email,
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StripeCustomerCreationError(
      `Failed to create Stripe customer: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Ensures a Stripe customer exists for the organization
 * 
 * Flow:
 * 1. Check local DB - if stripeCustomerId exists, return it (idempotency)
 * 2. Search Stripe - if missing locally, search by email to prevent duplicates
 * 3. Create in Stripe - if not found in Stripe, create new customer
 * 4. Update local DB - save stripeCustomerId to organization record
 * 
 * @param orgId - Internal organization ID
 * @param email - Admin email address
 * @returns Stripe customer ID
 */
export async function ensureCustomer(
  orgId: string,
  email: string
): Promise<EnsureCustomerResult> {
  logger.info("Ensuring Stripe customer", { orgId, email });

  // Step 1: Check local DB
  const organization = await findOrganizationById(orgId);
  
  if (!organization) {
    throw new StripeOrgNotFoundError(`Organization not found: ${orgId}`);
  }

  // If stripeCustomerId already exists, return it (idempotency)
  if (organization.stripeCustomerId) {
    logger.info("Stripe customer already exists in local DB", {
      orgId,
      stripeCustomerId: organization.stripeCustomerId,
    });
    return {
      stripeCustomerId: organization.stripeCustomerId,
    };
  }

  // Step 2: Search Stripe by email
  logger.info("Searching Stripe for existing customer by email", { email });
  const existingCustomerId = await searchStripeCustomerByEmail(email);

  let stripeCustomerId: string;

  if (existingCustomerId) {
    // Found existing customer in Stripe
    logger.info("Found existing Stripe customer", {
      orgId,
      email,
      stripeCustomerId: existingCustomerId,
    });
    stripeCustomerId = existingCustomerId;
  } else {
    // Step 3: Create new customer in Stripe
    logger.info("Creating new Stripe customer", { orgId, email });
    stripeCustomerId = await createStripeCustomer(email, orgId);
    logger.info("Stripe customer created successfully", {
      orgId,
      email,
      stripeCustomerId,
    });
  }

  // Step 4: Update local DB
  logger.info("Updating organization with Stripe customer ID", {
    orgId,
    stripeCustomerId,
  });
  await updateOrganizationStripeCustomerId(orgId, stripeCustomerId);

  logger.info("Stripe customer ensured successfully", {
    orgId,
    email,
    stripeCustomerId,
  });

  return {
    stripeCustomerId,
  };
}

