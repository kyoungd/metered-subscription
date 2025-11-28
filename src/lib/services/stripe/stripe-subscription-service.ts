/**
 * Stripe Subscription Service
 * 
 * Business logic layer for Stripe subscription operations.
 * Handles subscription creation, validation, and synchronization with local database.
 * 
 * @module lib/services/stripe/stripe-subscription-service
 */

import { stripe, PLANS_CONFIG, PlanCode } from "../../stripe";
import { findOrganizationById } from "../../db/repositories/org-repository";
import { createSubscription } from "../../db/repositories/subscription-repository";
import {
  StripeValidationError,
  StripeApiError,
  StripeOrgNotFoundError,
} from "../../errors/stripe-errors";
import { logger } from "../../utils/logger";
import Stripe from "stripe";

export interface CreateSubscriptionResult {
  subscriptionId: string;
  status: string;
  trialEndsAt: string | null;
}

/**
 * Validates plan code against PLANS_CONFIG
 * 
 * @param planCode - Plan code to validate
 * @returns True if valid plan code
 */
export function isValidPlanCode(planCode: string): planCode is PlanCode {
  return planCode in PLANS_CONFIG;
}

/**
 * Creates a subscription in Stripe
 * 
 * @param customerId - Stripe customer ID
 * @param planCode - Plan code
 * @param orgId - Internal organization ID for metadata
 * @returns Created Stripe subscription
 */
async function createStripeSubscription(
  customerId: string,
  planCode: PlanCode,
  orgId: string
): Promise<Stripe.Subscription> {
  try {
    const planConfig = PLANS_CONFIG[planCode];
    
    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [
        {
          price: planConfig.stripePriceId,
        },
      ],
      metadata: {
        orgId,
        planCode,
      },
    };

    // Add trial period if configured
    if (planConfig.trialDays > 0) {
      subscriptionParams.trial_period_days = planConfig.trialDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    return subscription;
  } catch (error) {
    logger.error("Failed to create Stripe subscription", {
      customerId,
      planCode,
      orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new StripeApiError(
      `Failed to create Stripe subscription: ${error instanceof Error ? error.message : String(error)}`,
      { originalError: error }
    );
  }
}

/**
 * Maps Stripe subscription status to local status
 * 
 * @param stripeStatus - Stripe subscription status
 * @returns Local status string
 */
function mapStripeStatusToLocalStatus(stripeStatus: Stripe.Subscription.Status): string {
  // Map Stripe statuses to our local statuses
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "canceled",
    incomplete: "canceled",
    incomplete_expired: "canceled",
  };

  return statusMap[stripeStatus] || stripeStatus;
}

/**
 * Creates a trial subscription for an organization
 * 
 * Flow:
 * 1. Validate planCode against PLANS_CONFIG
 * 2. Ensure Organization has stripeCustomerId
 * 3. Create subscription in Stripe
 * 4. Persist subscription to local DB
 * 
 * @param orgId - Internal organization ID
 * @param planCode - Plan code (trial, starter, growth, pro)
 * @returns Subscription details
 */
export async function createSubscriptionForOrganization(
  orgId: string,
  planCode: string
): Promise<CreateSubscriptionResult> {
  logger.info("Creating subscription for organization", { orgId, planCode });

  // Step 1: Validate planCode
  if (!isValidPlanCode(planCode)) {
    throw new StripeValidationError(
      `Invalid plan code: ${planCode}. Must be one of: ${Object.keys(PLANS_CONFIG).join(", ")}`
    );
  }

  // Step 2: Ensure Organization has stripeCustomerId
  const organization = await findOrganizationById(orgId);
  
  if (!organization) {
    throw new StripeOrgNotFoundError(`Organization not found: ${orgId}`);
  }

  if (!organization.stripeCustomerId) {
    throw new StripeValidationError(
      `Organization ${orgId} does not have a Stripe customer ID. Please ensure customer first.`
    );
  }

  logger.info("Organization validated", {
    orgId,
    stripeCustomerId: organization.stripeCustomerId,
    planCode,
  });

  // Step 3: Create subscription in Stripe
  logger.info("Creating subscription in Stripe", {
    customerId: organization.stripeCustomerId,
    planCode,
  });

  const stripeSubscription = await createStripeSubscription(
    organization.stripeCustomerId,
    planCode,
    orgId
  );

  logger.info("Stripe subscription created", {
    orgId,
    stripeSubscriptionId: stripeSubscription.id,
    status: stripeSubscription.status,
  });

  // Step 4: Persist to DB
  const localStatus = mapStripeStatusToLocalStatus(stripeSubscription.status);
  const trialEndsAt = stripeSubscription.trial_end
    ? new Date(stripeSubscription.trial_end * 1000)
    : null;

  // Ensure period dates are valid - use current time as fallback if not set
  const currentPeriodStart = stripeSubscription.current_period_start
    ? new Date(stripeSubscription.current_period_start * 1000)
    : new Date();
  const currentPeriodEnd = stripeSubscription.current_period_end
    ? new Date(stripeSubscription.current_period_end * 1000)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

  const subscription = await createSubscription({
    organizationId: orgId,
    clerkOrgId: organization.clerkOrgId,
    stripeCustomerId: organization.stripeCustomerId,
    stripeSubscriptionId: stripeSubscription.id,
    planCode,
    stripePriceId: PLANS_CONFIG[planCode].stripePriceId,
    status: localStatus,
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt,
  });

  logger.info("Subscription persisted to database", {
    orgId,
    subscriptionId: subscription.id,
    stripeSubscriptionId: stripeSubscription.id,
    status: localStatus,
  });

  return {
    subscriptionId: subscription.id,
    status: localStatus,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
  };
}

