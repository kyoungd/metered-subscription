/**
 * Entitlements Service
 * 
 * Business logic layer for entitlements operations.
 * Handles retrieval of plan, quota, and consumption data from local DB.
 * 
 * @module lib/services/entitlements/entitlements-service
 */

import { findOrganizationByClerkOrgId } from "../../db/repositories/org-repository";
import { findActiveSubscriptionByOrganizationId } from "../../db/repositories/subscription-repository";
import { findUsageCounter, formatPeriodKey } from "../../db/repositories/usage-repository";
import {
  EntitlementsOrgNotFoundError,
  EntitlementsNoActiveSubscriptionError,
} from "../../errors/entitlements-errors";
import { logger } from "../../utils/logger";

export interface GetEntitlementsResult {
  planCode: string;
  included: number;
  used: number;
  remaining: number;
  periodKey: string;
}

/**
 * Gets entitlements for an organization
 * 
 * Flow:
 * 1. Find organization by clerkOrgId
 * 2. Find active subscription (status: active or trialing)
 * 3. Derive periodKey from subscription.currentPeriodStart
 * 4. Find usage counter for current period and metric 'api_call'
 * 5. Calculate remaining = included - used
 * 6. Return entitlements
 * 
 * @param clerkOrgId - Clerk organization ID
 * @returns Entitlements result with plan, quota, and consumption
 * @throws EntitlementsOrgNotFoundError if organization not found
 * @throws EntitlementsNoActiveSubscriptionError if no active subscription
 */
export async function getEntitlements(
  clerkOrgId: string
): Promise<GetEntitlementsResult> {
  logger.info("Getting entitlements for organization", { clerkOrgId });

  // Step 1: Find organization
  const organization = await findOrganizationByClerkOrgId(clerkOrgId);
  
  if (!organization) {
    throw new EntitlementsOrgNotFoundError(
      `Organization not found: ${clerkOrgId}`
    );
  }

  logger.info("Organization found", {
    clerkOrgId,
    orgId: organization.id,
  });

  // Step 2: Find active subscription
  const subscription = await findActiveSubscriptionByOrganizationId(
    organization.id
  );

  if (!subscription) {
    throw new EntitlementsNoActiveSubscriptionError(
      `No active subscription found for organization: ${clerkOrgId}`
    );
  }

  logger.info("Active subscription found", {
    clerkOrgId,
    subscriptionId: subscription.id,
    planCode: subscription.planCode,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
  });

  // Step 3: Derive periodKey from subscription.currentPeriodStart
  const periodKey = formatPeriodKey(subscription.currentPeriodStart);

  logger.info("Period key derived", {
    clerkOrgId,
    periodKey,
    periodStart: subscription.currentPeriodStart,
  });

  // Step 4: Find usage counter for current period
  const usageCounter = await findUsageCounter(
    clerkOrgId,
    periodKey,
    "api_call"
  );

  // Step 5: Calculate entitlements
  // If no counter exists, return zeros (counter may not be seeded yet)
  const included = usageCounter?.included ?? 0;
  const used = usageCounter?.used ?? 0;
  const remaining = included - used;

  logger.info("Entitlements calculated", {
    clerkOrgId,
    planCode: subscription.planCode,
    periodKey,
    included,
    used,
    remaining,
    hasCounter: !!usageCounter,
  });

  return {
    planCode: subscription.planCode,
    included,
    used,
    remaining,
    periodKey,
  };
}

