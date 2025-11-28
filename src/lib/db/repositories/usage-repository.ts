/**
 * Usage Repository
 * 
 * Data access layer for usage operations.
 * Handles database interactions for usage counters and records.
 * 
 * @module lib/db/repositories/usage-repository
 */

import { db } from "../../db";
import { OrgCreationError } from "../../errors/org-errors";

export interface UsageCounterRecord {
  id: string;
  clerkOrgId: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  metric: string;
  included: number;
  used: number;
  organizationId: string;
  subscriptionId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Formats a date to period key (YYYY-MM format)
 * 
 * @param date - Date to format
 * @returns Period key string (YYYY-MM)
 */
export function formatPeriodKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Upserts a usage counter
 * 
 * If a counter exists for the given clerkOrgId, periodKey, and metric,
 * it updates the included value but preserves the used value.
 * If it doesn't exist, it creates a new counter with used: 0.
 * 
 * @param data - Usage counter data
 * @returns Created or updated usage counter record
 * @throws OrgCreationError if database operation fails
 */
export async function upsertUsageCounter(data: {
  organizationId: string;
  clerkOrgId: string;
  subscriptionId: string;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  metric: string;
  included: number;
}): Promise<UsageCounterRecord> {
  try {
    // Upsert: update if exists, create if not
    // Preserve existing 'used' value if counter already exists
    const counter = await db.usageCounter.upsert({
      where: {
        clerkOrgId_periodKey_metric: {
          clerkOrgId: data.clerkOrgId,
          periodKey: data.periodKey,
          metric: data.metric,
        },
      },
      update: {
        // Update included quota but preserve used value
        included: data.included,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        subscriptionId: data.subscriptionId,
        organizationId: data.organizationId,
      },
      create: {
        organizationId: data.organizationId,
        clerkOrgId: data.clerkOrgId,
        subscriptionId: data.subscriptionId,
        periodKey: data.periodKey,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        metric: data.metric,
        included: data.included,
        used: 0, // Start with 0 used
      },
    });

    return counter;
  } catch (error) {
    throw new OrgCreationError(
      `Failed to upsert usage counter: ${data.clerkOrgId}/${data.periodKey}/${data.metric}`,
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Finds a usage counter by unique key
 * 
 * @param clerkOrgId - Clerk organization ID
 * @param periodKey - Period key (YYYY-MM)
 * @param metric - Metric name (e.g., 'api_call')
 * @returns Usage counter record or null if not found
 */
export async function findUsageCounter(
  clerkOrgId: string,
  periodKey: string,
  metric: string
): Promise<UsageCounterRecord | null> {
  return db.usageCounter.findUnique({
    where: {
      clerkOrgId_periodKey_metric: {
        clerkOrgId,
        periodKey,
        metric,
      },
    },
  });
}

/**
 * Finds usage counters for an organization
 * 
 * @param organizationId - Internal organization ID
 * @returns Array of usage counter records
 */
export async function findUsageCountersByOrganizationId(
  organizationId: string
): Promise<UsageCounterRecord[]> {
  return db.usageCounter.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      periodKey: "desc",
    },
  });
}

