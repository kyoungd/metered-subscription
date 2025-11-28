/**
 * Payment Service
 * 
 * Business logic layer for payment operations.
 * Handles SetupIntent creation and payment method management.
 * 
 * @module lib/services/payments/payment-service
 */

import { stripe } from "../../stripe";
import { findOrganizationById } from "../../db/repositories/org-repository";
import {
  StripeValidationError,
  StripeOrgNotFoundError,
  StripeApiError,
} from "../../errors/stripe-errors";
import { logger } from "../../utils/logger";

export interface CreateSetupIntentResult {
  clientSecret: string;
}

export interface AttachDefaultPaymentMethodResult {
  ok: boolean;
}

/**
 * Creates a SetupIntent for collecting payment methods
 * 
 * Flow:
 * 1. Validate organization exists
 * 2. Ensure organization has stripeCustomerId
 * 3. Create Stripe SetupIntent
 * 4. Return client secret
 * 
 * @param orgId - Internal organization ID
 * @returns SetupIntent client secret
 */
export async function createSetupIntent(orgId: string): Promise<CreateSetupIntentResult> {
  logger.info("Creating SetupIntent for organization", { orgId });

  // Step 1: Validate organization exists
  const organization = await findOrganizationById(orgId);
  
  if (!organization) {
    throw new StripeOrgNotFoundError(`Organization not found: ${orgId}`);
  }

  // Step 2: Ensure organization has stripeCustomerId
  if (!organization.stripeCustomerId) {
    throw new StripeValidationError(
      `Organization ${orgId} does not have a Stripe customer ID. Please ensure customer first.`
    );
  }

  logger.info("Organization validated", {
    orgId,
    stripeCustomerId: organization.stripeCustomerId,
  });

  // Step 3: Create Stripe SetupIntent
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: organization.stripeCustomerId,
      usage: "off_session", // For future payments (subscriptions, invoices)
      metadata: {
        orgId,
      },
    });

    logger.info("SetupIntent created successfully", {
      orgId,
      setupIntentId: setupIntent.id,
      clientSecret: setupIntent.client_secret ? "***" : null,
    });

    if (!setupIntent.client_secret) {
      throw new StripeApiError(
        "SetupIntent created but client_secret is missing",
        { setupIntentId: setupIntent.id }
      );
    }

    // Step 4: Return client secret
    return {
      clientSecret: setupIntent.client_secret,
    };
  } catch (error) {
    logger.error("Failed to create SetupIntent", {
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StripeApiError(
      `Failed to create SetupIntent: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Attaches a payment method to a customer and sets it as default
 * 
 * Flow:
 * 1. Validate organization exists
 * 2. Ensure organization has stripeCustomerId
 * 3. Attach payment method to customer
 * 4. Set payment method as default for invoices/renewals
 * 5. Return success
 * 
 * @param orgId - Internal organization ID
 * @param paymentMethodId - Stripe PaymentMethod ID
 * @returns Success result
 */
export async function attachDefaultPaymentMethod(
  orgId: string,
  paymentMethodId: string
): Promise<AttachDefaultPaymentMethodResult> {
  logger.info("Attaching payment method and setting as default", {
    orgId,
    paymentMethodId,
  });

  // Step 1: Validate organization exists
  const organization = await findOrganizationById(orgId);
  
  if (!organization) {
    throw new StripeOrgNotFoundError(`Organization not found: ${orgId}`);
  }

  // Step 2: Ensure organization has stripeCustomerId
  if (!organization.stripeCustomerId) {
    throw new StripeValidationError(
      `Organization ${orgId} does not have a Stripe customer ID. Please ensure customer first.`
    );
  }

  logger.info("Organization validated", {
    orgId,
    stripeCustomerId: organization.stripeCustomerId,
  });

  try {
    // Step 3: Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: organization.stripeCustomerId,
    });

    logger.info("Payment method attached to customer", {
      orgId,
      paymentMethodId,
      stripeCustomerId: organization.stripeCustomerId,
    });

    // Step 4: Set payment method as default for invoices/renewals
    await stripe.customers.update(organization.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    logger.info("Payment method set as default", {
      orgId,
      paymentMethodId,
      stripeCustomerId: organization.stripeCustomerId,
    });

    // Step 5: Return success
    return { ok: true };
  } catch (error) {
    logger.error("Failed to attach or set default payment method", {
      orgId,
      paymentMethodId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StripeApiError(
      `Failed to attach or set default payment method: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

