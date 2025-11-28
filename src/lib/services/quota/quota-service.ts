/**
 * Quota Service
 * 
 * Business logic layer for quota operations.
 * Handles real-time quota checks for usage enforcement.
 * 
 * @module lib/services/quota/quota-service
 */

import { findOrganizationByClerkOrgId } from "../../db/repositories/org-repository";
import { findActiveSubscriptionByOrganizationId } from "../../db/repositories/subscription-repository";
import { findUsageCounter, formatPeriodKey } from "../../db/repositories/usage-repository";
import {
  QuotaOrgNotFoundError,
  QuotaNoActiveSubscriptionError,
  QuotaCounterNotFoundError,
} from "../../errors/quota-errors";
import { logger } from "../../utils/logger";

export interface CheckQuotaResult {
  allow: boolean;
  remaining: number;
}

/**
 * Checks if quota is available for an organization
 * 
 * Flow:
 * 1. Find organization by clerkOrgId
 * 2. Find active subscription (status: active or trialing)
 * 3. Derive periodKey from subscription.currentPeriodStart
 * 4. Find usage counter for current period and metric
 * 5. Calculate remaining = included - used
 * 6. Return allow=true if remaining > 0, allow=false if remaining <= 0
 * 
 * @param clerkOrgId - Clerk organization ID
 * @param metric - Metric name (e.g., 'api_call')
 * @returns Quota check result with allow flag and remaining quota
 * @throws QuotaOrgNotFoundError if organization not found
 * @throws QuotaNoActiveSubscriptionError if no active subscription
 * @throws QuotaCounterNotFoundError if usage counter not found
 */
export async function checkQuota(
  clerkOrgId: string,
  metric: string = "api_call"
): Promise<CheckQuotaResult> {
  logger.info("Checking quota for organization", { clerkOrgId, metric });

  // Step 1: Find organization
  const organization = await findOrganizationByClerkOrgId(clerkOrgId);
  
  if (!organization) {
    throw new QuotaOrgNotFoundError(
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
    throw new QuotaNoActiveSubscriptionError(
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
    metric
  );

  if (!usageCounter) {
    throw new QuotaCounterNotFoundError(
      `Usage counter not found for organization: ${clerkOrgId}, period: ${periodKey}, metric: ${metric}`
    );
  }

  // Step 5: Calculate remaining quota
  const remaining = usageCounter.included - usageCounter.used;
  const allow = remaining > 0;

  logger.info("Quota check completed", {
    clerkOrgId,
    metric,
    periodKey,
    included: usageCounter.included,
    used: usageCounter.used,
    remaining,
    allow,
  });

  return {
    allow,
    remaining: allow ? remaining : 0, // Return 0 if denied
  };
}

