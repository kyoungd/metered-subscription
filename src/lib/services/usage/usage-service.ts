/**
 * Usage Service
 * 
 * Business logic layer for usage operations.
 * Handles usage counter seeding, quota calculation, and usage tracking.
 * 
 * @module lib/services/usage/usage-service
 */

import { PLANS_CONFIG, PlanCode } from "../../stripe";
import { findActiveSubscriptionByOrganizationId } from "../../db/repositories/subscription-repository";
import { upsertUsageCounter, formatPeriodKey } from "../../db/repositories/usage-repository";
import { findOrganizationById } from "../../db/repositories/org-repository";
import { logger } from "../../utils/logger";
import { ApplicationError } from "../../utils/errors";

export interface SeedUsageResult {
  periodKey: string;
  remaining: number;
}

/**
 * Seeds a usage counter for an organization
 * 
 * Flow:
 * 1. Fetch active subscription for organization
 * 2. Derive periodKey from subscription.currentPeriodStart
 * 3. Lookup included quota from PLANS_CONFIG based on planCode
 * 4. Upsert usage counter (preserve existing used value if re-seeding)
 * 
 * @param orgId - Internal organization ID
 * @returns Seed result with periodKey and remaining quota
 */
export async function seedUsageCounter(orgId: string): Promise<SeedUsageResult> {
  logger.info("Seeding usage counter for organization", { orgId });

  // Step 1: Fetch active subscription
  const subscription = await findActiveSubscriptionByOrganizationId(orgId);
  
  if (!subscription) {
    throw new ApplicationError(
      `No active subscription found for organization: ${orgId}`,
      "NO_ACTIVE_SUBSCRIPTION",
      404,
      { orgId }
    );
  }

  logger.info("Active subscription found", {
    orgId,
    subscriptionId: subscription.id,
    planCode: subscription.planCode,
    currentPeriodStart: subscription.currentPeriodStart,
  });

  // Step 2: Derive periodKey from subscription.currentPeriodStart
  const periodKey = formatPeriodKey(subscription.currentPeriodStart);
  
  logger.info("Period key derived", {
    orgId,
    periodKey,
    periodStart: subscription.currentPeriodStart,
  });

  // Step 3: Calculate quota from PLANS_CONFIG
  const planCode = subscription.planCode as PlanCode;
  
  if (!(planCode in PLANS_CONFIG)) {
    throw new ApplicationError(
      `Invalid plan code in subscription: ${planCode}`,
      "INVALID_PLAN_CODE",
      500,
      { orgId, subscriptionId: subscription.id, planCode }
    );
  }

  const planConfig = PLANS_CONFIG[planCode];
  const included = planConfig.apiCalls;

  logger.info("Quota calculated from plan", {
    orgId,
    planCode,
    included,
  });

  // Step 4: Get organization to get clerkOrgId
  const organization = await findOrganizationById(orgId);
  if (!organization) {
    throw new ApplicationError(
      `Organization not found: ${orgId}`,
      "ORG_NOT_FOUND",
      404,
      { orgId }
    );
  }

  // Step 5: Upsert usage counter
  // This will preserve existing 'used' value if counter already exists
  const counter = await upsertUsageCounter({
    organizationId: orgId,
    clerkOrgId: organization.clerkOrgId,
    subscriptionId: subscription.id,
    periodKey,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    metric: "api_call",
    included,
  });

  const remaining = included - counter.used;

  logger.info("Usage counter seeded successfully", {
    orgId,
    periodKey,
    included,
    used: counter.used,
    remaining,
  });

  return {
    periodKey,
    remaining,
  };
}

