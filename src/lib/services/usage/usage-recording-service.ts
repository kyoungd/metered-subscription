/**
 * Usage Recording Service
 * 
 * Business logic layer for usage recording operations.
 * Handles idempotent usage recording with request_id.
 * 
 * @module lib/services/usage/usage-recording-service
 */

import { findOrganizationByClerkOrgId } from "../../db/repositories/org-repository";
import { findActiveSubscriptionByOrganizationId } from "../../db/repositories/subscription-repository";
import {
  findUsageCounter,
  formatPeriodKey,
  incrementUsageCounter,
  createUsageRecord,
  findUsageRecordByRequestId,
  upsertUsageCounter,
} from "../../db/repositories/usage-repository";
import { PLANS_CONFIG, PlanCode } from "../../stripe";
import { logger } from "../../utils/logger";
import { ApplicationError } from "../../utils/errors";

export interface RecordUsageResult {
  periodKey: string;
  used: number;
  remaining: number;
}

/**
 * Records usage for an organization with idempotency
 * 
 * Flow:
 * 1. Check idempotency: find existing UsageRecord by request_id
 * 2. If exists → return existing result (idempotent)
 * 3. If not exists:
 *    a. Find organization and active subscription
 *    b. Derive periodKey from subscription
 *    c. Find or create usage counter
 *    d. Atomically increment used by value
 *    e. Create UsageRecord with metadata: {request_id}
 *    f. Return {periodKey, used, remaining}
 * 
 * @param clerkOrgId - Clerk organization ID
 * @param metric - Metric name (e.g., 'api_call')
 * @param value - Usage value to record (must be positive)
 * @param occurredAt - When the usage occurred
 * @param requestId - Request ID for idempotency
 * @returns Usage recording result with periodKey, used, and remaining
 */
export async function recordUsage(
  clerkOrgId: string,
  metric: string,
  value: number,
  occurredAt: Date,
  requestId: string
): Promise<RecordUsageResult> {
  logger.info("Recording usage", {
    clerkOrgId,
    metric,
    value,
    occurredAt,
    requestId,
  });

  // Step 1: Check idempotency
  const existingRecord = await findUsageRecordByRequestId(requestId);
  
  if (existingRecord) {
    logger.info("Usage record already exists (idempotent)", {
      requestId,
      recordId: existingRecord.id,
    });

    // Get the usage counter to return current state
    const counter = await findUsageCounter(
      existingRecord.clerkOrgId,
      formatPeriodKey(existingRecord.occurredAt),
      existingRecord.metric
    );

    if (!counter) {
      throw new ApplicationError(
        `Usage counter not found for existing record: ${requestId}`,
        "COUNTER_NOT_FOUND",
        500,
        { requestId, recordId: existingRecord.id }
      );
    }

    const remaining = counter.included - counter.used;

    logger.info("Returning existing usage record result", {
      requestId,
      periodKey: formatPeriodKey(existingRecord.occurredAt),
      used: counter.used,
      remaining,
    });

    return {
      periodKey: formatPeriodKey(existingRecord.occurredAt),
      used: counter.used,
      remaining,
    };
  }

  // Step 2: Find organization
  const organization = await findOrganizationByClerkOrgId(clerkOrgId);
  
  if (!organization) {
    throw new ApplicationError(
      `Organization not found: ${clerkOrgId}`,
      "ORG_NOT_FOUND",
      404,
      { clerkOrgId }
    );
  }

  logger.info("Organization found", {
    clerkOrgId,
    orgId: organization.id,
  });

  // Step 3: Find active subscription
  const subscription = await findActiveSubscriptionByOrganizationId(
    organization.id
  );

  if (!subscription) {
    throw new ApplicationError(
      `No active subscription found for organization: ${clerkOrgId}`,
      "NO_ACTIVE_SUBSCRIPTION",
      404,
      { clerkOrgId }
    );
  }

  logger.info("Active subscription found", {
    clerkOrgId,
    subscriptionId: subscription.id,
    planCode: subscription.planCode,
  });

  // Step 4: Derive periodKey from subscription.currentPeriodStart
  const periodKey = formatPeriodKey(subscription.currentPeriodStart);

  logger.info("Period key derived", {
    clerkOrgId,
    periodKey,
    periodStart: subscription.currentPeriodStart,
  });

  // Step 5: Find or create usage counter
  let usageCounter = await findUsageCounter(clerkOrgId, periodKey, metric);

  if (!usageCounter) {
    // Counter doesn't exist - create it with quota from plan
    const planCode = subscription.planCode as PlanCode;
    
    if (!(planCode in PLANS_CONFIG)) {
      throw new ApplicationError(
        `Invalid plan code in subscription: ${planCode}`,
        "INVALID_PLAN_CODE",
        500,
        { clerkOrgId, subscriptionId: subscription.id, planCode }
      );
    }

    const planConfig = PLANS_CONFIG[planCode];
    const included = planConfig.apiCalls;

    logger.info("Creating usage counter", {
      clerkOrgId,
      periodKey,
      metric,
      included,
    });

    usageCounter = await upsertUsageCounter({
      organizationId: organization.id,
      clerkOrgId,
      subscriptionId: subscription.id,
      periodKey,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      metric,
      included,
    });
  }

  // Step 6: Atomically increment usage counter
  const updatedCounter = await incrementUsageCounter(usageCounter.id, value);

  logger.info("Usage counter incremented", {
    clerkOrgId,
    counterId: updatedCounter.id,
    value,
    used: updatedCounter.used,
  });

  // Step 7: Create usage record with metadata for idempotency
  await createUsageRecord({
    organizationId: organization.id,
    clerkOrgId,
    subscriptionId: subscription.id,
    usageCounterId: updatedCounter.id,
    metric,
    value,
    occurredAt,
    metadata: {
      request_id: requestId,
    },
  });

  logger.info("Usage record created", {
    clerkOrgId,
    requestId,
    value,
    occurredAt,
  });

  // Step 8: Calculate remaining
  const remaining = updatedCounter.included - updatedCounter.used;

  logger.info("Usage recording completed", {
    clerkOrgId,
    periodKey,
    used: updatedCounter.used,
    remaining,
    requestId,
  });

  return {
    periodKey,
    used: updatedCounter.used,
    remaining,
  };
}

