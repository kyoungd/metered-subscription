/**
 * Stigg Service
 * 
 * Business logic layer for Stigg operations.
 * Handles subscription provisioning and synchronization with Stigg.
 * 
 * @module lib/services/stigg/stigg-service
 */

import { stigg, getStiggPlanId } from "../../stigg";
import { findOrganizationById } from "../../db/repositories/org-repository";
import { findSubscriptionById } from "../../db/repositories/subscription-repository";
import { logger } from "../../utils/logger";
import { PlanCode } from "../../stripe";

export interface ProvisionResult {
  provisioned: boolean;
}

/**
 * Provisions a subscription in Stigg
 * 
 * Flow:
 * 1. Fetch Organization and Subscription details from local DB
 * 2. Call Stigg SDK to provision subscription
 * 3. Handle errors gracefully (log but don't fail - soft dependency)
 * 
 * @param orgId - Internal organization ID
 * @param subscriptionId - Internal subscription ID
 * @returns Provision result
 */
export async function provisionSubscription(
  orgId: string,
  subscriptionId: string
): Promise<ProvisionResult> {
  logger.info("Provisioning subscription in Stigg", { orgId, subscriptionId });

  try {
    // Step 1: Data Gathering
    const organization = await findOrganizationById(orgId);
    if (!organization) {
      logger.warn("Organization not found for Stigg provisioning", { orgId });
      return { provisioned: false };
    }

    // Find subscription by internal ID
    const sub = await findSubscriptionById(subscriptionId);

    if (!sub) {
      logger.warn("Subscription not found for Stigg provisioning", { subscriptionId });
      return { provisioned: false };
    }

    if (!organization.stripeCustomerId) {
      logger.warn("Organization has no Stripe customer ID for Stigg provisioning", { orgId });
      return { provisioned: false };
    }

    logger.info("Data gathered for Stigg provisioning", {
      orgId,
      subscriptionId: sub.id,
      planCode: sub.planCode,
      stripeCustomerId: organization.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
    });

    // Step 2: Stigg SDK Call
    const stiggPlanId = getStiggPlanId(sub.planCode as PlanCode);

    logger.info("Calling Stigg SDK to provision subscription", {
      customerId: organization.stripeCustomerId,
      subscriptionId: sub.stripeSubscriptionId,
      planId: stiggPlanId,
    });

    // Call Stigg SDK to provision subscription
    // Using Stripe customer ID as the customer identifier in Stigg
    await stigg.provisionSubscription({
      customerId: organization.stripeCustomerId,
      subscriptionId: sub.stripeSubscriptionId,
      planId: stiggPlanId,
    });

    logger.info("Successfully provisioned subscription in Stigg", {
      orgId,
      subscriptionId: sub.id,
      stiggPlanId,
    });

    return { provisioned: true };
  } catch (error) {
    // Step 3: Error Handling - Log but don't fail (soft dependency)
    logger.error("Failed to provision subscription in Stigg", {
      orgId,
      subscriptionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return success even on error - Stigg is a soft dependency
    return { provisioned: false };
  }
}

